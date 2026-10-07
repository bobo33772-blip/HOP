// 모의 카페24. 앱 등록 전에도 데모·테스트에서 전체 흐름(찜 → 초대 → 신청 → 쿠폰 → 결제)을 돌려 보기 위한 것이다.
// 데이터는 모두 예시이며 실존 브랜드·회원이 아니다. 실제 카페24와 다를 수 있는 부분은 api.ts의 VERIFY 표시를 본다.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CouponSpec, MemberConsent, OrderInfo, Product, ShopApi, SmsSpec } from "./api";
import type { Clock } from "../time";

type Coupon = CouponSpec & { couponNo: string; holders: Set<string>; used: Set<string> };
export type MockWebhook = { event_no: number; resource: { mall_id: string; order_id: string } };

interface MockMall {
  products: Product[];
  members: Map<string, { sms: boolean }>;
  wishlists: Map<number, Set<string>>;
  carts: Map<number, Set<string>>;
  coupons: Map<string, Coupon>;
  orders: Map<string, OrderInfo>;
}

export class MockCafe24 {
  malls = new Map<string, MockMall>();
  smsLog: { mallId: string; memberIds: string[]; content: string; isAd: boolean; at: Date }[] = [];
  /** 다음 쿠폰 발급에서 일부러 빠뜨릴 회원 (누락 대사 테스트용) */
  dropNextIssue = new Set<string>();
  /** 몇 번을 다시 발급해도 빠지는 회원 (영구 실패 테스트용) */
  blockIssue = new Set<string>();
  failNextSms = false;
  /** 개인정보 권한 여부 (false면 찜·수신 동의 조회 불가 → 장바구니 고객 공구) */
  privacy = true;
  /** 실제 카페24처럼 상품마다 조회 시간이 걸리는 것을 흉내 낸다 (첫 수집 화면 확인용) */
  delayMs = 0;
  private listeners: ((e: MockWebhook) => Promise<void> | void)[] = [];
  private seq = 1000;

  constructor(private clock: Clock, private secret = "mock-member-key") {}

  addMall(mallId: string, products: Product[]) {
    this.malls.set(mallId, { products, members: new Map(), wishlists: new Map(), carts: new Map(), coupons: new Map(), orders: new Map() });
  }
  addMember(mallId: string, memberId: string, sms: boolean) { this.mall(mallId).members.set(memberId, { sms }); }
  addWish(mallId: string, productNo: number, memberId: string) { this.bucket(this.mall(mallId).wishlists, productNo).add(memberId); }
  addCart(mallId: string, productNo: number, memberId: string) { this.bucket(this.mall(mallId).carts, productNo).add(memberId); }
  onWebhook(fn: (e: MockWebhook) => Promise<void> | void) { this.listeners.push(fn); }

  /** 쇼핑몰 프런트(Front SDK)가 위젯에 넘겨주는 암호화 회원 ID를 흉내 낸다 */
  encryptMember(mallId: string, memberId: string): string {
    const body = Buffer.from(`${mallId}:${memberId}`).toString("base64url");
    return `${body}.${createHmac("sha256", this.secret).update(body).digest("base64url")}`;
  }

  /** 고객이 쇼핑몰 주문서에서 결제한 상황. 쿠폰은 보유·미사용·기간 안·해당 상품이어야 적용된다.
   *  opts.silent: 웹훅이 유실된 상황을 재현한다 (야간 대사 테스트용) */
  async placeOrder(mallId: string, memberId: string, productNo: number, qty: number, couponNo?: string, opts: { silent?: boolean } = {}): Promise<OrderInfo> {
    const m = this.mall(mallId);
    const p = m.products.find((x) => x.productNo === productNo);
    if (!p) throw new Error("상품 없음");
    let discount = 0;
    const used: string[] = [];
    if (couponNo) {
      const c = m.coupons.get(couponNo);
      const now = this.clock.now();
      if (!c || !c.holders.has(memberId) || c.used.has(memberId) || c.productNo !== productNo || now < c.availableFrom || now > c.availableUntil) {
        throw new Error("쿠폰을 쓸 수 없어요");
      }
      c.used.add(memberId);
      used.push(couponNo);
      discount = c.discountAmount * qty;
    }
    const order: OrderInfo = { orderId: `ORD-${++this.seq}`, memberId, couponNos: used, items: [{ productNo, qty, amount: p.price * qty - discount }], status: "paid", paidAt: this.clock.now() };
    m.orders.set(order.orderId, order);
    if (!opts.silent) await this.emit({ event_no: 90023, resource: { mall_id: mallId, order_id: order.orderId } });
    return order;
  }

  async cancelOrder(mallId: string, orderId: string, notify = true) {
    const o = this.mall(mallId).orders.get(orderId);
    if (!o) throw new Error("주문 없음");
    o.status = "cancelled";
    if (notify) await this.emit({ event_no: 90026, resource: { mall_id: mallId, order_id: orderId } });
  }

  couponsOf(mallId: string, memberId: string) {
    return [...this.mall(mallId).coupons.values()].filter((c) => c.holders.has(memberId)).map((c) => ({ name: c.name, discountAmount: c.discountAmount, used: c.used.has(memberId) }));
  }

  /** 한 몰에 묶인 ShopApi */
  forMall(mallId: string): ShopApi {
    const w = this;
    const m = () => w.mall(mallId);
    return {
      get privacy() { return w.privacy; },
      async listProducts(offset, limit) { return m().products.slice(offset, offset + limit); },
      async wishlistCount(n) { await w.delay(); return m().wishlists.get(n)?.size ?? 0; },
      async cartCount(n) { return m().carts.get(n)?.size ?? 0; },
      async wishlistMembers(n) { return [...(m().wishlists.get(n) ?? [])].slice(0, 100); }, // 실제 API처럼 100명에서 끊긴다 (P8)
      async cartMembers(n) { return [...(m().carts.get(n) ?? [])]; },
      async consents(ids): Promise<MemberConsent[]> { return ids.map((id) => ({ memberId: id, sms: !!m().members.get(id)?.sms })); },
      async createCoupon(spec) {
        const couponNo = `CP-${++w.seq}`;
        m().coupons.set(couponNo, { ...spec, couponNo, holders: new Set(), used: new Set() });
        return couponNo;
      },
      async issueCoupon(no, ids) {
        const c = m().coupons.get(no);
        if (!c) throw new Error("쿠폰 없음");
        if (ids.length > 100) throw new Error("1회 최대 100명");
        for (const id of ids) {
          if (w.blockIssue.has(id)) continue;
          if (w.dropNextIssue.has(id)) { w.dropNextIssue.delete(id); continue; }
          c.holders.add(id);
        }
      },
      async listCouponHolders(no) { return [...(m().coupons.get(no)?.holders ?? [])]; },
      async sendSms(spec: SmsSpec) {
        if (w.failNextSms) { w.failNextSms = false; throw new Error("SMS 발송 실패 (모의)"); }
        const ids = spec.memberIds.filter((id) => m().members.get(id)?.sms); // 카페24의 수신거부자 자동 제외
        w.smsLog.push({ mallId, memberIds: ids, content: spec.content, isAd: spec.isAd, at: w.clock.now() });
        return { queueRef: `Q-${++w.seq}` };
      },
      async smsSenders() { return [{ senderNo: "1", number: "02-000-0000", status: "T" }]; },
      async installScriptTag() { return "MOCK_SCRIPT_1"; },
      async getOrder(id) { return m().orders.get(id) ?? null; },
      async listOrdersWithCoupon(no, since) { return [...m().orders.values()].filter((o) => o.couponNos.includes(no) && o.paidAt >= since); },
      async verifyMember(token) {
        const [body, sig] = String(token).split(".");
        if (!body || !sig) return null;
        const want = createHmac("sha256", w.secret).update(body).digest();
        const got = Buffer.from(sig, "base64url");
        if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
        const [mall, id] = Buffer.from(body, "base64url").toString().split(":");
        return mall === mallId && m().members.has(id) ? id : null;
      },
    };
  }

  private delay() { return this.delayMs ? new Promise((r) => setTimeout(r, this.delayMs)) : Promise.resolve(); }
  private async emit(e: MockWebhook) { for (const fn of this.listeners) await fn(e); }
  private mall(id: string) { const m = this.malls.get(id); if (!m) throw new Error(`모의 쇼핑몰 없음: ${id}`); return m; }
  private bucket(map: Map<number, Set<string>>, k: number) { let s = map.get(k); if (!s) { s = new Set(); map.set(k, s); } return s; }
}

// ---- 데모 쇼핑몰: 홈리빙 브랜드 'LINEN & CO.' (예시) ----

export const DEMO_MALL = "demo";
export const DEMO_BRAND = "LINEN & CO.";

export const DEMO_PRODUCTS: Product[] = [
  { productNo: 101, name: "워싱 린넨 이불 커버 (Q)", price: 129_000, soldOut: true },
  { productNo: 102, name: "스톤웨어 디너 접시 4P", price: 52_000, soldOut: true },
  { productNo: 103, name: "린넨 암막 커튼 2장", price: 89_000 },
  { productNo: 104, name: "원목 수납 트레이", price: 39_000 },
  { productNo: 105, name: "코튼 와플 타월 3P", price: 32_000 },
  { productNo: 106, name: "세라믹 머그 2P", price: 28_000 },
];

// 찜·장바구니 회원 범위 [시작, 끝] (회원 m1~m400)
const WISH: Record<number, [number, number]> = { 101: [1, 180], 102: [60, 200], 103: [150, 240], 104: [300, 330], 106: [331, 340] };
const CART: Record<number, [number, number]> = { 101: [170, 200], 102: [190, 230], 103: [235, 250], 104: [330, 335], 105: [380, 382] };

/** 회원 400명, 약 60% 문자 수신 동의 */
export function seedDemoMall(w: MockCafe24, mallId = DEMO_MALL) {
  w.addMall(mallId, DEMO_PRODUCTS);
  for (let i = 1; i <= 400; i++) w.addMember(mallId, `m${i}`, (i * 37) % 10 < 6);
  for (const [no, [a, b]] of Object.entries(WISH)) for (let i = a; i <= b; i++) w.addWish(mallId, Number(no), `m${i}`);
  for (const [no, [a, b]] of Object.entries(CART)) for (let i = a; i <= b; i++) w.addCart(mallId, Number(no), `m${i}`);
}
