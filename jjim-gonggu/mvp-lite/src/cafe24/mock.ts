import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Cafe24Port, CouponSpec, OrderInfo, Product } from './port.ts';
import type { Clock } from '../time.ts';

// 모의 카페24 쇼핑몰. 개발·데모·테스트에서 실제 쇼핑몰 대신 쓴다.
// 실제 카페24와 다르게 동작할 수 있는 부분은 real.ts의 'VERIFY' 주석과 README의 PoC 목록을 본다.

type Member = { member_id: string; sms: boolean };
type Coupon = CouponSpec & { coupon_no: string; holders: Set<string>; used: Set<string> };
export type WebhookEvent = { event_no: number; resource: { mall_id: string; order_id: string } };

type MockMall = {
  products: Product[];
  members: Map<string, Member>;
  wishlists: Map<number, Set<string>>;
  carts: Map<number, Set<string>>;
  coupons: Map<string, Coupon>;
  orders: Map<string, OrderInfo>;
};

export class MockCafe24 implements Cafe24Port {
  malls = new Map<string, MockMall>();
  smsLog: { mall_id: string; member_ids: string[]; content: string; is_ad: boolean; at: string }[] = [];
  /** 다음 쿠폰 발급에서 일부러 빠뜨릴 회원 (누락 대사 테스트용) */
  dropNextIssue = new Set<string>();
  /** 몇 번을 다시 발급해도 빠지는 회원 (영구 실패 테스트용) */
  blockIssue = new Set<string>();
  failNextSms = false;
  private webhookListeners: ((e: WebhookEvent) => Promise<void> | void)[] = [];
  private seq = 1000;
  private clock: Clock;
  private secret: string;

  constructor(clock: Clock, secret = 'mock-member-key') { this.clock = clock; this.secret = secret; }

  addMall(mallId: string, products: Product[]) {
    this.malls.set(mallId, { products, members: new Map(), wishlists: new Map(), carts: new Map(), coupons: new Map(), orders: new Map() });
  }
  addMember(mallId: string, memberId: string, sms: boolean) { this.mall(mallId).members.set(memberId, { member_id: memberId, sms }); }
  addWish(mallId: string, productNo: number, memberId: string) { this.set(this.mall(mallId).wishlists, productNo).add(memberId); }
  addCart(mallId: string, productNo: number, memberId: string) { this.set(this.mall(mallId).carts, productNo).add(memberId); }
  onWebhook(fn: (e: WebhookEvent) => Promise<void> | void) { this.webhookListeners.push(fn); }

  /** 쇼핑몰 프런트(Front SDK)가 위젯에 넘겨주는 암호화 회원 ID를 흉내 낸다 */
  encryptMember(mallId: string, memberId: string): string {
    const body = Buffer.from(`${mallId}:${memberId}`).toString('base64url');
    return `${body}.${createHmac('sha256', this.secret).update(body).digest('base64url')}`;
  }

  /** 고객이 쇼핑몰 주문서에서 결제한 상황을 흉내 낸다. 쿠폰은 보유·미사용·기간 안이어야 적용된다 */
  /** opts.silent: 웹훅이 유실된 상황을 재현한다 (야간 대사 테스트용) */
  async placeOrder(mallId: string, memberId: string, productNo: number, qty: number, couponNo?: string, opts: { silent?: boolean } = {}): Promise<OrderInfo> {
    const m = this.mall(mallId);
    const p = m.products.find(x => x.product_no === productNo);
    if (!p) throw new Error('상품 없음');
    let discount = 0; const used: string[] = [];
    if (couponNo) {
      const c = m.coupons.get(couponNo);
      const now = this.clock.now().toISOString();
      if (!c || !c.holders.has(memberId) || c.used.has(memberId) || c.product_no !== productNo || now < c.available_from || now > c.available_until) {
        throw new Error('쿠폰을 쓸 수 없어요');
      }
      c.used.add(memberId); used.push(couponNo); discount = c.discount_amount * qty;
    }
    const order: OrderInfo = { order_id: `ORD-${++this.seq}`, member_id: memberId, coupon_nos: used, items: [{ product_no: productNo, qty, amount: p.price * qty - discount }], status: 'paid', paid_at: this.clock.now().toISOString() };
    m.orders.set(order.order_id, order);
    if (!opts.silent) await this.emit({ event_no: 90023, resource: { mall_id: mallId, order_id: order.order_id } });
    return order;
  }

  async cancelOrder(mallId: string, orderId: string, notify = true) {
    const o = this.mall(mallId).orders.get(orderId);
    if (!o) throw new Error('주문 없음');
    o.status = 'cancelled';
    if (notify) await this.emit({ event_no: 90026, resource: { mall_id: mallId, order_id: orderId } });
  }

  // ---- Cafe24Port ----
  async listProducts(mallId: string) { return this.mall(mallId).products; }
  async wishlistCount(mallId: string, n: number) { return this.mall(mallId).wishlists.get(n)?.size ?? 0; }
  async cartCount(mallId: string, n: number) { return this.mall(mallId).carts.get(n)?.size ?? 0; }
  async wishlistMembers(mallId: string, n: number) { return [...(this.mall(mallId).wishlists.get(n) ?? [])]; }
  async cartMembers(mallId: string, n: number) { return [...(this.mall(mallId).carts.get(n) ?? [])]; }
  async smsConsented(mallId: string, ids: string[]) {
    const m = this.mall(mallId); return new Set(ids.filter(id => m.members.get(id)?.sms));
  }
  async sendSms(mallId: string, msg: { member_ids: string[]; content: string; is_ad: boolean }) {
    if (this.failNextSms) { this.failNextSms = false; throw new Error('SMS 발송 실패 (모의)'); }
    const m = this.mall(mallId);
    const ids = msg.member_ids.filter(id => m.members.get(id)?.sms); // 카페24의 수신거부자 자동 제외
    this.smsLog.push({ mall_id: mallId, member_ids: ids, content: msg.content, is_ad: msg.is_ad, at: this.clock.now().toISOString() });
    return { queue_ref: `Q-${++this.seq}` };
  }
  async createCoupon(mallId: string, spec: CouponSpec) {
    const coupon_no = `CP-${++this.seq}`;
    this.mall(mallId).coupons.set(coupon_no, { ...spec, coupon_no, holders: new Set(), used: new Set() });
    return { coupon_no };
  }
  async issueCoupon(mallId: string, couponNo: string, ids: string[]) {
    const c = this.mall(mallId).coupons.get(couponNo);
    if (!c) throw new Error('쿠폰 없음');
    if (ids.length > 100) throw new Error('1회 최대 100명');
    for (const id of ids) {
      if (this.blockIssue.has(id)) continue;
      if (this.dropNextIssue.has(id)) { this.dropNextIssue.delete(id); continue; }
      c.holders.add(id);
    }
  }
  async listCouponHolders(mallId: string, couponNo: string) { return [...(this.mall(mallId).coupons.get(couponNo)?.holders ?? [])]; }
  async getOrder(mallId: string, orderId: string) { return this.mall(mallId).orders.get(orderId) ?? null; }
  async listOrdersWithCoupon(mallId: string, couponNo: string, since: string) {
    return [...this.mall(mallId).orders.values()].filter(o => o.coupon_nos.includes(couponNo) && o.paid_at >= since);
  }
  async verifyMember(mallId: string, token: string) {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const want = createHmac('sha256', this.secret).update(body).digest();
    const got = Buffer.from(sig, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const [m, id] = Buffer.from(body, 'base64url').toString().split(':');
    return m === mallId && this.mall(mallId).members.has(id) ? id : null;
  }

  private async emit(e: WebhookEvent) { for (const fn of this.webhookListeners) await fn(e); }
  private mall(id: string) { const m = this.malls.get(id); if (!m) throw new Error(`모의 쇼핑몰 없음: ${id}`); return m; }
  private set(map: Map<number, Set<string>>, k: number) { let s = map.get(k); if (!s) { s = new Set(); map.set(k, s); } return s; }
}
