import type { DB } from '../db.ts';
import { decryptSecret, encryptSecret } from '../db.ts';
import type { Cafe24Port, CouponSpec, OrderInfo, Product } from './port.ts';

// 실제 카페24 Admin API 연동.
// 'VERIFY(Pn)' 표시가 있는 곳은 공식 문서로 경로는 확인했지만 응답 필드·요청 형식을
// 테스트몰에서 아직 확인하지 못한 부분이다. 1주 차 PoC(README 참고)에서 확정한다.

export type Cafe24Config = {
  clientId: string;
  clientSecret: string;
  apiVersion: string;          // X-Cafe24-Api-Version
  tokenKey: string;            // 토큰 암호화 키
};

type TokenRow = { access_token_enc: string | null; refresh_token_enc: string | null; token_expires_at: string | null; sender_no: string | null; shop_no: number };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class RealCafe24 implements Cafe24Port {
  private db: DB; private cfg: Cafe24Config;
  constructor(db: DB, cfg: Cafe24Config) { this.db = db; this.cfg = cfg; }

  // ---------- OAuth ----------
  static authorizeUrl(mallId: string, cfg: Cafe24Config, redirectUri: string, state: string, scopes: string[]) {
    const q = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, state, redirect_uri: redirectUri, scope: scopes.join(',') });
    return `https://${mallId}.cafe24api.com/api/v2/oauth/authorize?${q}`;
  }

  async exchangeCode(mallId: string, code: string, redirectUri: string) {
    const t = await this.tokenRequest(mallId, new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }));
    this.saveTokens(mallId, t);
  }

  private async tokenRequest(mallId: string, body: URLSearchParams) {
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
      method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!res.ok) throw new Error(`카페24 토큰 발급 실패 ${res.status}`);
    return await res.json() as { access_token: string; refresh_token: string; expires_at: string };
  }

  private saveTokens(mallId: string, t: { access_token: string; refresh_token: string; expires_at: string }) {
    this.db.prepare('UPDATE malls SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ? WHERE mall_id = ?')
      .run(encryptSecret(t.access_token, this.cfg.tokenKey), encryptSecret(t.refresh_token, this.cfg.tokenKey), new Date(t.expires_at).toISOString(), mallId);
  }

  private row(mallId: string): TokenRow {
    const r = this.db.prepare('SELECT access_token_enc, refresh_token_enc, token_expires_at, sender_no, shop_no FROM malls WHERE mall_id = ?').get(mallId) as TokenRow | undefined;
    if (!r?.access_token_enc || !r.refresh_token_enc) throw new Error(`카페24 연결이 없어요: ${mallId}`);
    return r;
  }

  private async token(mallId: string): Promise<string> {
    const r = this.row(mallId);
    if (r.token_expires_at && new Date(r.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
      const t = await this.tokenRequest(mallId, new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptSecret(r.refresh_token_enc!, this.cfg.tokenKey) }));
      this.saveTokens(mallId, t);
      return t.access_token;
    }
    return decryptSecret(r.access_token_enc!, this.cfg.tokenKey);
  }

  /** 호출 한도(몰별 버킷 40, 초당 2회 회복)를 지키며 요청한다. 429면 1→2→4→8초 기다렸다 다시 보낸다 */
  private async api(mallId: string, method: string, path: string, body?: unknown): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin${path}`, {
        method,
        headers: { Authorization: `Bearer ${await this.token(mallId)}`, 'Content-Type': 'application/json', 'X-Cafe24-Api-Version': this.cfg.apiVersion },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const limit = res.headers.get('x-api-call-limit'); // 예: "12/40"
      if (limit) { const [used, max] = limit.split('/').map(Number); if (used > max * 0.75) await sleep(600); }
      if (res.status === 429 && attempt < 4) { await sleep(1000 * 2 ** attempt); continue; }
      if (!res.ok) throw new Error(`카페24 API ${method} ${path} 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.status === 204 ? null : await res.json();
    }
  }

  // ---------- Cafe24Port ----------
  async listProducts(mallId: string): Promise<Product[]> {
    const out: Product[] = [];
    for (let offset = 0; ; offset += 100) {
      const r = await this.api(mallId, 'GET', `/products?limit=100&offset=${offset}&fields=product_no,product_name,price,sold_out`);
      for (const p of r.products ?? []) out.push({ product_no: Number(p.product_no), product_name: String(p.product_name), price: Math.round(Number(p.price)), sold_out: p.sold_out === 'T' });
      if ((r.products ?? []).length < 100 || offset >= 9900) return out;
    }
  }
  async wishlistCount(mallId: string, n: number) { return Number((await this.api(mallId, 'GET', `/products/${n}/wishlist/customers/count`)).count ?? 0); }
  async cartCount(mallId: string, n: number) { return Number((await this.api(mallId, 'GET', `/products/${n}/carts/count`)).count ?? 0); }

  async wishlistMembers(mallId: string, n: number) {
    // VERIFY(P8): 페이지 넘김이 없고 요청 제한 100건. 찜 100명 초과 상품은 회원별 찜 목록 + 로그인 웹훅으로 보완해야 한다.
    const r = await this.api(mallId, 'GET', `/products/${n}/wishlist/customers?limit=100`);
    const ids = (r.wishlist ?? r.customers ?? []).map((x: any) => String(x.member_id)).filter(Boolean);
    const count = await this.wishlistCount(mallId, n);
    if (count > ids.length) console.warn(`[P8] 상품 ${n}: 찜 ${count}명 중 ${ids.length}명만 받음. 보완 경로 필요`);
    return ids;
  }
  async cartMembers(mallId: string, n: number) {
    const ids: string[] = [];
    for (let offset = 0; offset <= 10000; offset += 100) {
      const r = await this.api(mallId, 'GET', `/products/${n}/carts?limit=100&offset=${offset}`);
      const rows = r.carts ?? [];
      for (const x of rows) if (x.member_id) ids.push(String(x.member_id));
      if (rows.length < 100) break;
    }
    return [...new Set(ids)];
  }
  async smsConsented(mallId: string, ids: string[]) {
    const ok = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const q = encodeURIComponent(ids.slice(i, i + 100).join(','));
      // VERIFY(P9): 몰의 개인정보 제공 설정에 따라 막히는지 확인 필요
      const r = await this.api(mallId, 'GET', `/customersprivacy?member_id=${q}&fields=member_id,sms&limit=100`);
      for (const c of r.customersprivacy ?? []) if (c.sms === 'T') ok.add(String(c.member_id));
    }
    return ok;
  }
  async sendSms(mallId: string, msg: { member_ids: string[]; content: string; is_ad: boolean }) {
    const { sender_no, shop_no } = this.row(mallId);
    if (!sender_no) throw new Error('판매자 문자 발신번호가 등록되지 않았어요.');
    // VERIFY: 요청 필드명 (sender_no, recipients/member_id, exclude_unsubscriber, type)
    const r = await this.api(mallId, 'POST', '/sms', { shop_no, request: { sender_no, content: msg.content, member_id: msg.member_ids, exclude_unsubscriber: 'T', type: 'LMS' } });
    return { queue_ref: String(r?.sms?.queue_code ?? '') };
  }
  async createCoupon(mallId: string, s: CouponSpec) {
    const { shop_no } = this.row(mallId);
    // VERIFY(P3): 쿠폰 생성 필드명. 정액 할인, 특정 상품 한정, 기간 지정, 회원 지정 발급용
    const r = await this.api(mallId, 'POST', '/coupons', { shop_no, request: {
      coupon_name: s.name, benefit_type: 'A', benefit_price: String(s.discount_amount), issue_type: 'M',
      available_period_type: 'F', available_begin_datetime: s.available_from, available_end_datetime: s.available_until,
      available_product: 'I', available_product_list: [s.product_no], available_scope: 'P',
    } });
    return { coupon_no: String(r.coupon.coupon_no) };
  }
  async issueCoupon(mallId: string, couponNo: string, ids: string[]) {
    const { shop_no } = this.row(mallId);
    await this.api(mallId, 'POST', `/coupons/${couponNo}/issues`, { shop_no, request: { issued_member_scope: 'M', member_id: ids, allow_duplication: 'F' } });
  }
  async listCouponHolders(mallId: string, couponNo: string) {
    const ids: string[] = [];
    for (let offset = 0; offset <= 10000; offset += 500) {
      const r = await this.api(mallId, 'GET', `/coupons/${couponNo}/issues?limit=500&offset=${offset}`);
      const rows = r.issues ?? [];
      for (const x of rows) if (x.member_id) ids.push(String(x.member_id));
      if (rows.length < 500) break;
    }
    return ids;
  }
  async getOrder(mallId: string, orderId: string): Promise<OrderInfo | null> {
    try { return mapOrder((await this.api(mallId, 'GET', `/orders/${encodeURIComponent(orderId)}?embed=items,coupons`)).order); }
    catch (e) { if (String(e).includes(' 404')) return null; throw e; }
  }
  async listOrdersWithCoupon(mallId: string, couponNo: string, sinceIso: string) {
    const out: OrderInfo[] = [];
    const start = sinceIso.slice(0, 10), end = new Date().toISOString().slice(0, 10);
    for (let offset = 0; offset <= 15000; offset += 1000) {
      const r = await this.api(mallId, 'GET', `/orders?start_date=${start}&end_date=${end}&embed=items,coupons&limit=1000&offset=${offset}`);
      const rows = r.orders ?? [];
      for (const o of rows) { const m = mapOrder(o); if (m && m.coupon_nos.includes(couponNo)) out.push(m); }
      if (rows.length < 1000) break;
    }
    return out;
  }
  async verifyMember(_mallId: string, _token: string): Promise<string | null> {
    // VERIFY(P2): Front SDK의 암호화 회원 ID를 서버에서 검증·복호화하는 방법을 PoC로 확정하기 전까지는
    // 모든 신청을 거절한다 (fail-closed). 위조 신청이 확정 수량을 부풀리는 것을 막기 위해서다.
    return null;
  }
}

function mapOrder(o: any): OrderInfo | null {
  if (!o) return null;
  // VERIFY: 결제·취소 여부 필드명 (paid, canceled), 쿠폰 번호 위치
  const cancelled = o.canceled === 'T' || o.order_status?.startsWith?.('C');
  return {
    order_id: String(o.order_id),
    member_id: String(o.member_id ?? ''),
    coupon_nos: (o.coupons ?? []).map((c: any) => String(c.coupon_no)),
    items: (o.items ?? []).map((i: any) => ({ product_no: Number(i.product_no), qty: Number(i.quantity), amount: Math.round(Number(i.payment_amount ?? i.product_price * i.quantity)) })),
    status: cancelled ? 'cancelled' : o.paid === 'T' ? 'paid' : 'pending',
    paid_at: new Date(o.payment_date ?? o.order_date).toISOString(),
  };
}
