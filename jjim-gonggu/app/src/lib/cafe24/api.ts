// 찜꽁이 쓰는 카페24 기능만 모은 인터페이스. 실제 구현(Cafe24Api)과 모의 쇼핑몰(mock.ts)이 같은 모양을 가진다.
// ⚠ 경로는 기획서 '연동 인벤토리'(2026-10-06 확인) 기준. 'VERIFY(Pn)' 표시는 공식 문서로 경로만 확인했고
//    요청·응답 필드명은 테스트몰에서 아직 확인하지 못한 부분이다 → 1단계 PoC에서 확정하고 tests/fixtures/에 응답 샘플을 저장할 것.

import { Cafe24Client } from "./client";
import { verifyEncryptedMemberId } from "./member";

export interface Product { productNo: number; name: string; price: number; soldOut?: boolean; imageUrl?: string }
export interface MemberConsent { memberId: string; sms: boolean }

export interface CouponSpec {
  name: string;
  productNo: number;
  discountAmount: number; // 정가 - 공구가 (정액 할인)
  availableFrom: Date;
  availableUntil: Date; // 결제 기간 끝 + 여유
}

export interface SmsSpec { senderNo: string; memberIds: string[]; content: string; isAd: boolean }

export interface OrderInfo {
  orderId: string;
  memberId: string;
  couponNos: string[];
  items: { productNo: number; qty: number; amount: number }[];
  status: "paid" | "pending" | "cancelled"; // pending: 주문은 했지만 입금 전(무통장 등)
  paidAt: Date;
}

export interface ShopApi {
  /** 개인정보(mall.read_privacy) 권한이 있는가. 없으면 찜 회원·수신 동의를 조회할 수 없다 → 장바구니 고객 + 카페24 수신거부 자동 제외로 동작 */
  readonly privacy: boolean;
  listProducts(offset: number, limit: number): Promise<Product[]>;
  wishlistCount(productNo: number): Promise<number>;
  wishlistMembers(productNo: number): Promise<string[]>;
  cartCount(productNo: number): Promise<number>;
  cartMembers(productNo: number): Promise<string[]>;
  consents(memberIds: string[]): Promise<MemberConsent[]>;
  createCoupon(spec: CouponSpec): Promise<string>; // coupon_no
  /** 한 번에 최대 100명. 엔진이 100명씩 나눠 부른다 */
  issueCoupon(couponNo: string, memberIds: string[]): Promise<void>;
  listCouponHolders(couponNo: string): Promise<string[]>;
  /** 회원 ID로 발송. 카페24가 수신거부자를 자동으로 제외한다 (광고·결과 안내 모두) */
  sendSms(spec: SmsSpec): Promise<{ queueRef: string }>;
  installScriptTag(src: string): Promise<string>;
  getOrder(orderId: string): Promise<OrderInfo | null>;
  listOrdersWithCoupon(couponNo: string, since: Date): Promise<OrderInfo[]>;
  /** 위젯이 보낸 암호화 회원 ID를 검증해 member_id를 돌려준다. 실패하면 null */
  verifyMember(token: string): Promise<string | null>;
}

/** 모든 상품 (페이지를 넘기며) */
export async function allProducts(api: ShopApi, max = 5_000): Promise<Product[]> {
  const out: Product[] = [];
  for (let offset = 0; offset < max; offset += 100) {
    const page = await api.listProducts(offset, 100);
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

const kstIso = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 19) + "+09:00";
/** 카페24 쿠폰 기간은 정시(:00:00)만 받는다 (테스트몰 확인) → 시작은 내림, 끝은 올림 */
const HOUR_MS = 3_600_000;
export const kstHourIso = (d: Date, mode: "floor" | "ceil") =>
  kstIso(new Date((mode === "floor" ? Math.floor : Math.ceil)(d.getTime() / HOUR_MS) * HOUR_MS));

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOrder(o: any): OrderInfo | null {
  if (!o) return null;
  // VERIFY: 결제·취소 여부 필드명 (paid, canceled, order_status), 쿠폰 번호 위치
  const cancelled = o.canceled === "T" || String(o.order_status ?? "").startsWith("C");
  return {
    orderId: String(o.order_id),
    memberId: String(o.member_id ?? ""),
    couponNos: (o.coupons ?? []).map((c: any) => String(c.coupon_no)),
    items: (o.items ?? []).map((i: any) => ({ productNo: Number(i.product_no), qty: Number(i.quantity), amount: Math.round(Number(i.payment_amount ?? i.product_price * i.quantity)) })),
    status: cancelled ? "cancelled" : o.paid === "T" ? "paid" : "pending",
    paidAt: new Date(o.payment_date ?? o.order_date),
  };
}

export class Cafe24Api implements ShopApi {
  constructor(private c: Cafe24Client, private shopNo = 1, private serviceKey = "", readonly privacy = false) {}

  async listProducts(offset: number, limit: number) {
    const r = await this.c.request<{ products: { product_no: number; product_name: string; price: string; sold_out?: "T" | "F"; list_image?: string }[] }>("GET", "/products", {
      query: { shop_no: this.shopNo, offset, limit, fields: "product_no,product_name,price,sold_out,list_image" },
    });
    return r.products.map((p) => ({ productNo: Number(p.product_no), name: p.product_name, price: Math.round(Number(p.price)), soldOut: p.sold_out === "T", imageUrl: p.list_image }));
  }

  async wishlistCount(productNo: number) {
    const r = await this.c.request<{ count: number }>("GET", `/products/${productNo}/wishlist/customers/count`, { query: { shop_no: this.shopNo } });
    return Number(r.count ?? 0);
  }

  async wishlistMembers(productNo: number) {
    // VERIFY(P8): 페이지 넘김 없음·limit 100 — 100명 초과 상품은 회원별 찜 목록 + 로그인 웹훅(90143)으로 보완해야 한다
    const r = await this.c.request<{ customers?: { member_id: string }[]; wishlist?: { member_id: string }[] }>("GET", `/products/${productNo}/wishlist/customers`, { query: { shop_no: this.shopNo, limit: 100 } });
    return (r.customers ?? r.wishlist ?? []).map((c) => String(c.member_id)).filter(Boolean);
  }

  async cartCount(productNo: number) {
    const r = await this.c.request<{ count: number }>("GET", `/products/${productNo}/carts/count`, { query: { shop_no: this.shopNo } });
    return Number(r.count ?? 0);
  }

  async cartMembers(productNo: number) {
    const ids: string[] = [];
    for (let offset = 0; offset <= 10_000; offset += 100) {
      const r = await this.c.request<{ carts: { member_id: string }[] }>("GET", `/products/${productNo}/carts`, { query: { shop_no: this.shopNo, limit: 100, offset } });
      ids.push(...r.carts.map((c) => c.member_id).filter(Boolean));
      if (r.carts.length < 100) break;
    }
    return [...new Set(ids)];
  }

  async consents(memberIds: string[]) {
    const out: MemberConsent[] = [];
    for (let i = 0; i < memberIds.length; i += 100) {
      const chunk = memberIds.slice(i, i + 100);
      // VERIFY(P9): 몰의 개인정보 제공 설정에 따라 막히는지 확인 필요
      const r = await this.c.request<{ customersprivacy: { member_id: string; sms: "T" | "F" }[] }>("GET", "/customersprivacy", {
        query: { shop_no: this.shopNo, member_id: chunk.join(","), limit: chunk.length, fields: "member_id,sms" },
      });
      out.push(...r.customersprivacy.map((c) => ({ memberId: String(c.member_id), sms: c.sms === "T" })));
    }
    return out;
  }

  async createCoupon(spec: CouponSpec) {
    // 공식 문서(쿠폰 등록 POST /coupons, 2026-09-01 버전) + 테스트몰 실제 호출로 확인(2026-10-08, PoC P3):
    // available_site 필수, 할인액은 discount_amount.benefit_price 정수, 기간은 정시(:00:00)만 허용
    // 정액 할인(A) · 대상자 지정 발급(M/회원대상 M) · 일반 기간(F) · 상품 쿠폰(P) + 선택 상품(I) · 웹·모바일
    const r = await this.c.request<{ coupon: { coupon_no: string } }>("POST", "/coupons", {
      body: {
        shop_no: this.shopNo,
        request: {
          coupon_name: spec.name.slice(0, 50),
          benefit_type: "A",
          discount_amount: { benefit_price: Math.round(spec.discountAmount) },
          issue_type: "M",
          issue_sub_type: "M",
          available_period_type: "F",
          available_begin_datetime: kstHourIso(spec.availableFrom, "floor"),
          available_end_datetime: kstHourIso(spec.availableUntil, "ceil"),
          available_site: ["W", "M"],
          available_scope: "P",
          available_product: "I",
          available_product_list: [spec.productNo],
          available_category: "U",
          available_amount_type: "E",
          available_coupon_count_by_order: 1,
          issue_max_count_by_user: 1,
          issue_reserved: "F",
        },
      },
    });
    return String(r.coupon.coupon_no);
  }

  async issueCoupon(couponNo: string, memberIds: string[]) {
    await this.c.request("POST", `/coupons/${couponNo}/issues`, {
      body: { shop_no: this.shopNo, request: { issued_member_scope: "M", member_id: memberIds, allow_duplication: "F" } },
    });
  }

  async listCouponHolders(couponNo: string) {
    const ids: string[] = [];
    for (let offset = 0; offset <= 10_000; offset += 500) {
      const r = await this.c.request<{ issues?: { member_id: string }[] }>("GET", `/coupons/${couponNo}/issues`, { query: { shop_no: this.shopNo, limit: 500, offset } });
      const rows = r.issues ?? [];
      ids.push(...rows.map((x) => String(x.member_id)).filter(Boolean));
      if (rows.length < 500) break;
    }
    return ids;
  }

  async sendSms(spec: SmsSpec) {
    // VERIFY: 요청 필드명 (sender_no, member_id, exclude_unsubscriber, type), LMS 단가
    const r = await this.c.request<{ sms?: { queue_code?: string } }>("POST", "/sms", {
      body: {
        shop_no: this.shopNo,
        request: {
          sender_no: spec.senderNo,
          content: spec.content,
          member_id: spec.memberIds,
          type: spec.content.length > 45 ? "LMS" : "SMS",
          // 광고뿐 아니라 결과 안내도 수신거부 고객은 빼고 보낸다 (P5 결론 전까지 보수적으로)
          exclude_unsubscriber: "T",
        },
      },
    });
    return { queueRef: String(r?.sms?.queue_code ?? "") };
  }

  async installScriptTag(src: string) {
    // 이 앱이 예전에 넣은 위젯 태그(다른 주소로 설치했던 것 포함)를 먼저 지워 위젯이 두 번 뜨지 않게 한다. 앱 토큰으로는 이 앱의 태그만 보인다
    const old = await this.c.request<{ scripttags: { script_no: string; src: string }[] }>("GET", "/scripttags", { query: { shop_no: this.shopNo } });
    for (const t of old.scripttags ?? []) {
      if (/\/widget\.js(\?|$)/.test(t.src)) await this.c.request("DELETE", `/scripttags/${encodeURIComponent(t.script_no)}`, { query: { shop_no: this.shopNo } });
    }
    const r = await this.c.request<{ scripttag: { script_no: string } }>("POST", "/scripttags", {
      body: { shop_no: this.shopNo, request: { src, display_location: ["PRODUCT_DETAIL"] } },
    });
    return String(r.scripttag.script_no);
  }

  async getOrder(orderId: string) {
    try {
      const r = await this.c.request<{ order: unknown }>("GET", `/orders/${encodeURIComponent(orderId)}`, { query: { shop_no: this.shopNo, embed: "items,coupons" } });
      return mapOrder(r.order);
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async listOrdersWithCoupon(couponNo: string, since: Date) {
    const out: OrderInfo[] = [];
    const start = kstIso(since).slice(0, 10), end = kstIso(new Date()).slice(0, 10);
    for (let offset = 0; offset <= 15_000; offset += 1000) {
      const r = await this.c.request<{ orders?: unknown[] }>("GET", "/orders", { query: { shop_no: this.shopNo, start_date: start, end_date: end, embed: "items,coupons", limit: 1000, offset } });
      const rows = r.orders ?? [];
      for (const o of rows) { const m = mapOrder(o); if (m && m.couponNos.includes(couponNo)) out.push(m); }
      if (rows.length < 1000) break;
    }
    return out;
  }

  async verifyMember(token: string): Promise<string | null> {
    // 암호화 회원 ID(JWT, HS512)를 Service Key로 검증한다. Service Key가 없으면 모든 신청을 거절한다 (fail-closed).
    if (!this.serviceKey) return null;
    const r = verifyEncryptedMemberId(token, this.serviceKey, this.c.mallId);
    if (!r.ok) return null;
    // VERIFY(P2): 토큰에 몰 ID가 없으면 다른 몰 회원 토큰 재사용을 서명만으로는 막지 못한다 → 클레임 이름만 남겨 PoC에서 확인
    if (!r.mallBound) console.warn(`[P2] ${this.c.mallId}: 암호화 회원 ID에 몰 ID 클레임이 없어요. 클레임: ${r.claims.join(",")}`);
    return r.memberId;
  }
}
