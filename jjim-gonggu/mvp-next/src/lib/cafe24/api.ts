// 찜 공구가 쓰는 카페24 기능만 모은 인터페이스. 실제 구현(Cafe24Api)과 로컬용 가짜(MockCafe24Api)가 같은 모양을 가진다.
// ⚠ 경로는 기획서 '연동 인벤토리'(2026-10-06 확인) 기준. 요청·응답 필드명은 1단계 PoC에서 테스트몰 실제 응답으로 확정하고
//    tests/fixtures/ 에 응답 샘플을 저장할 것.

import { Cafe24Client } from "./client";

export interface Product { productNo: number; name: string; price: number; imageUrl?: string }
export interface MemberConsent { memberId: string; sms: boolean }

export interface CouponSpec {
  name: string;
  productNo: number;
  discountAmount: number; // 정가 - 공구가 (정액 할인)
  availableFrom: Date;
  availableUntil: Date; // 결제 기간 끝
}

export interface SmsSpec { senderNo: string; memberIds: string[]; content: string; isAd: boolean }

export interface CouponOrder { orderId: string; memberId: string; couponNo: string; productNo: number; qty: number; amount: number; canceled: boolean }

export interface ShopApi {
  listProducts(offset: number, limit: number): Promise<Product[]>;
  wishlistCount(productNo: number): Promise<number>;
  wishlistMembers(productNo: number): Promise<string[]>;
  cartCount(productNo: number): Promise<number>;
  cartMembers(productNo: number): Promise<string[]>;
  consents(memberIds: string[]): Promise<MemberConsent[]>;
  createCoupon(spec: CouponSpec): Promise<string>; // coupon_no
  issueCoupon(couponNo: string, memberIds: string[]): Promise<void>;
  sendSms(spec: SmsSpec): Promise<void>;
  installScriptTag(src: string): Promise<string>;
  couponOrders(couponNo: string, since: Date): Promise<CouponOrder[]>;
}

const ymd = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 19) + "+09:00";

export class Cafe24Api implements ShopApi {
  constructor(private c: Cafe24Client, private shopNo = 1) {}

  async listProducts(offset: number, limit: number) {
    const r = await this.c.request<{ products: { product_no: number; product_name: string; price: string; list_image?: string }[] }>("GET", "/products", {
      query: { shop_no: this.shopNo, offset, limit, fields: "product_no,product_name,price,list_image" },
    });
    return r.products.map((p) => ({ productNo: p.product_no, name: p.product_name, price: Math.round(Number(p.price)), imageUrl: p.list_image }));
  }

  async wishlistCount(productNo: number) {
    const r = await this.c.request<{ count: number }>("GET", `/products/${productNo}/wishlist/customers/count`, { query: { shop_no: this.shopNo } });
    return r.count;
  }

  async wishlistMembers(productNo: number) {
    // 페이지 넘김 없음·limit 100 — 100명 초과 시 전원이 오는지 PoC P8에서 확인
    const r = await this.c.request<{ customers: { member_id: string }[] }>("GET", `/products/${productNo}/wishlist/customers`, { query: { shop_no: this.shopNo, limit: 100 } });
    return r.customers.map((c) => c.member_id);
  }

  async cartCount(productNo: number) {
    const r = await this.c.request<{ count: number }>("GET", `/products/${productNo}/carts/count`, { query: { shop_no: this.shopNo } });
    return r.count;
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
      const r = await this.c.request<{ customersprivacy: { member_id: string; sms: "T" | "F" }[] }>("GET", "/customersprivacy", {
        query: { shop_no: this.shopNo, member_id: chunk.join(","), limit: chunk.length, fields: "member_id,sms" },
      });
      out.push(...r.customersprivacy.map((c) => ({ memberId: c.member_id, sms: c.sms === "T" })));
    }
    return out;
  }

  async createCoupon(spec: CouponSpec) {
    const r = await this.c.request<{ coupon: { coupon_no: string } }>("POST", "/coupons", {
      body: {
        shop_no: this.shopNo,
        request: {
          coupon_name: spec.name,
          benefit_type: "A", // 정액 할인
          issue_type: "M", // 대상자 지정 발급
          available_period_type: "F",
          available_begin_datetime: ymd(spec.availableFrom),
          available_end_datetime: ymd(spec.availableUntil),
          available_product: "I",
          available_product_list: [spec.productNo],
          benefit_price: spec.discountAmount,
          issue_max_count_by_user: 1,
        },
      },
    });
    return r.coupon.coupon_no;
  }

  async issueCoupon(couponNo: string, memberIds: string[]) {
    // 1회 발급 인원 한계 미확인(PoC P3) → 100명씩 나눠 발급
    for (let i = 0; i < memberIds.length; i += 100) {
      await this.c.request("POST", `/coupons/${couponNo}/issues`, {
        body: { shop_no: this.shopNo, request: { issued_member_scope: "M", member_id: memberIds.slice(i, i + 100), allow_duplication: "F" } },
      });
    }
  }

  async sendSms(spec: SmsSpec) {
    for (let i = 0; i < spec.memberIds.length; i += 100) {
      await this.c.request("POST", "/sms", {
        body: {
          shop_no: this.shopNo,
          request: {
            sender_no: spec.senderNo,
            content: spec.content,
            member_id: spec.memberIds.slice(i, i + 100),
            type: spec.content.length > 45 ? "LMS" : "SMS",
            exclude_unsubscriber: spec.isAd ? "T" : "F",
          },
        },
      });
    }
  }

  async installScriptTag(src: string) {
    const r = await this.c.request<{ scripttag: { script_no: string } }>("POST", "/scripttags", {
      body: { shop_no: this.shopNo, request: { src, display_location: ["PRODUCT_DETAIL"] } },
    });
    return r.scripttag.script_no;
  }

  async couponOrders(couponNo: string, since: Date) {
    const r = await this.c.request<{ orders: { order_id: string; member_id: string; canceled: "T" | "F"; coupons?: { coupon_no: string }[]; items: { product_no: number; quantity: number; payment_amount: string }[] }[] }>(
      "GET", "/orders", { query: { shop_no: this.shopNo, start_date: ymd(since).slice(0, 10), end_date: ymd(new Date()).slice(0, 10), embed: "items,coupons", limit: 500 } },
    );
    return r.orders
      .filter((o) => o.coupons?.some((c) => c.coupon_no === couponNo))
      .flatMap((o) => o.items.map((it) => ({ orderId: o.order_id, memberId: o.member_id, couponNo, productNo: it.product_no, qty: it.quantity, amount: Math.round(Number(it.payment_amount)), canceled: o.canceled === "T" })));
  }
}
