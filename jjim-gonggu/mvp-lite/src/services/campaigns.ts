import { randomBytes } from 'node:crypto';
import { audit, newId, recordIssue, tx } from '../db.ts';
import { HOUR, fmtKst, nextAllowedSendTime } from '../time.ts';
import { UserError, won, type Ctx } from '../context.ts';

export type CampaignInput = {
  product_no: number;
  target_qty: number;
  deal_price: number;
  cost_price?: number | null;
  per_member_limit: number;
  deadline_at: string;          // ISO
  pay_window_h: number;         // 48 | 72
  ship_eta: string;             // YYYY-MM-DD
  confirm_below_cost?: boolean;
};

export type Campaign = {
  id: string; mall_id: string; product_no: number; product_name: string; list_price: number; deal_price: number;
  cost_price: number | null; target_qty: number; per_member_limit: number; deadline_at: string; pay_window_h: number;
  ship_eta: string; state: 'open' | 'reached' | 'failed' | 'settled'; coupon_no: string | null; report_token: string;
  opened_at: string; judged_at: string | null; pay_until: string | null; settled_at: string | null;
  decision_qty: number | null; decision_note: string | null; decided_at: string | null;
};

export type Mall = { mall_id: string; shop_no: number; brand_name: string; unsubscribe_no: string };

export function getMall(ctx: Ctx, mallId: string): Mall {
  const m = ctx.db.prepare('SELECT mall_id, shop_no, brand_name, unsubscribe_no FROM malls WHERE mall_id = ?').get(mallId) as Mall | undefined;
  if (!m) throw new UserError('mall_not_found', '연결된 쇼핑몰이 아니에요.', 404);
  return m;
}

export function getCampaign(ctx: Ctx, id: string): Campaign {
  const c = ctx.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Campaign | undefined;
  if (!c) throw new UserError('campaign_not_found', '공구를 찾을 수 없어요.', 404);
  return c;
}

/** 진행률에 들어가는 신청 수량 (취소·미달 제외) */
export function pledgedQty(ctx: Ctx, campaignId: string): number {
  const r = ctx.db.prepare("SELECT COALESCE(SUM(qty),0) AS q FROM pledges WHERE campaign_id = ? AND state IN ('pledged','coupon_issued','paid','expired')").get(campaignId) as { q: number };
  return Number(r.q);
}

/** 개설 조건 검사. 문제가 있으면 사람이 읽을 수 있는 이유를 돌려준다 */
export function validateInput(input: CampaignInput, listPrice: number, now: Date): string[] {
  const e: string[] = [];
  const int = (v: unknown) => Number.isInteger(v);
  if (!int(input.target_qty) || input.target_qty < 1) e.push('목표 수량은 1개 이상 정수로 입력해 주세요.');
  if (!int(input.deal_price) || input.deal_price <= 0) e.push('공구가를 입력해 주세요.');
  else if (input.deal_price >= listPrice) e.push(`공구가는 정가(${won(listPrice)})보다 낮아야 해요.`);
  if (input.cost_price != null && int(input.deal_price) && input.deal_price < input.cost_price && !input.confirm_below_cost) {
    e.push(`공구가가 원가(${won(input.cost_price)})보다 낮아요. 팔수록 손해예요. 그래도 열려면 원가 미만 확인에 체크해 주세요.`);
  }
  if (!int(input.per_member_limit) || input.per_member_limit < 1 || input.per_member_limit > 5) e.push('1인 최대 수량은 1~5개로 정해 주세요.');
  if (![48, 72].includes(input.pay_window_h)) e.push('결제 기간은 48시간 또는 72시간이에요.');
  const dl = new Date(input.deadline_at);
  if (Number.isNaN(dl.getTime())) e.push('마감 일시를 확인해 주세요.');
  else if (dl.getTime() < now.getTime() + 24 * HOUR) e.push('마감은 지금부터 24시간 이후로 잡아 주세요.');
  else if (dl.getTime() - nextAllowedSendTime(now).getTime() < 24 * HOUR) e.push('초대 문자가 나간 뒤 최소 24시간은 모집할 수 있게 마감을 늦춰 주세요. 밤 9시~오전 8시에는 문자를 보낼 수 없어요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.ship_eta))) e.push('예상 출고일을 입력해 주세요. 고객 신청 화면에 그대로 보여요.');
  else if (!Number.isNaN(dl.getTime()) && new Date(input.ship_eta + 'T23:59:59+09:00') < dl) e.push('예상 출고일은 마감일 이후여야 해요.');
  return e;
}

type Audience = { wishlist: number; cart: number; unique: number; reachable: number; members: { member_id: string; source: string }[] };

/** 찜 ∪ 장바구니 회원에서 중복을 빼고, 문자 수신 동의자만 남긴다 */
export async function buildAudience(ctx: Ctx, mallId: string, productNo: number): Promise<Audience> {
  const [w, c] = await Promise.all([ctx.cafe24.wishlistMembers(mallId, productNo), ctx.cafe24.cartMembers(mallId, productNo)]);
  const src = new Map<string, string>();
  for (const id of w) src.set(id, 'wishlist');
  for (const id of c) src.set(id, src.has(id) ? 'both' : 'cart');
  const ids = [...src.keys()];
  const ok = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    for (const id of await ctx.cafe24.smsConsented(mallId, ids.slice(i, i + 1000))) ok.add(id);
  }
  const members = ids.filter(id => ok.has(id)).map(id => ({ member_id: id, source: src.get(id)! }));
  return { wishlist: w.length, cart: c.length, unique: ids.length, reachable: members.length, members };
}

export function inviteContent(mall: Mall, c: Pick<Campaign, 'product_name' | 'target_qty' | 'deal_price' | 'list_price' | 'deadline_at' | 'ship_eta'>, link: string): string {
  return `(광고)[${mall.brand_name}] 찜하신 ${c.product_name} 공동구매가 열렸어요. ${c.target_qty}개가 모이면 ${won(c.deal_price)}(정가 ${won(c.list_price)}). ${fmtKst(c.deadline_at)} 마감, 결제는 목표 달성 후에 해요. 예상 출고 ${c.ship_eta}.\n${link}\n무료수신거부 ${mall.unsubscribe_no}`;
}

async function prepare(ctx: Ctx, mallId: string, input: CampaignInput) {
  const mall = getMall(ctx, mallId);
  const product = (await ctx.cafe24.listProducts(mallId)).find(p => p.product_no === Number(input.product_no));
  if (!product) throw new UserError('product_not_found', '상품을 찾을 수 없어요.', 404);
  const errors = validateInput(input, product.price, ctx.clock.now());
  const aud = await buildAudience(ctx, mallId, product.product_no);
  const draft = { product_name: product.product_name, target_qty: input.target_qty, deal_price: input.deal_price, list_price: product.price, deadline_at: input.deadline_at, ship_eta: input.ship_eta };
  return { product, errors, aud, message: inviteContent(mall, draft, ctx.productUrl(mallId, product.product_no)) };
}

/** 열기 전 미리보기: 초대 인원, 문자 내용, 발송 시각, 개당 마진 */
export async function previewCampaign(ctx: Ctx, mallId: string, input: CampaignInput) {
  const { product, errors, aud, message } = await prepare(ctx, mallId, input);
  return {
    product, errors, message,
    audience: { wishlist: aud.wishlist, cart: aud.cart, unique: aud.unique, reachable: aud.reachable },
    send_at: nextAllowedSendTime(ctx.clock.now()).toISOString(),
    margin_per_unit: input.cost_price != null ? input.deal_price - input.cost_price : null,
  };
}

/** 공구 열기: 쿠폰을 먼저 만들고(실패하면 아무것도 저장하지 않음), 초대 대상과 초대 문자를 예약한다 */
export async function openCampaign(ctx: Ctx, actor: string, mallId: string, input: CampaignInput) {
  const mall = getMall(ctx, mallId);
  if (!/^[0-9-]{8,20}$/.test(mall.unsubscribe_no)) throw new UserError('profile_required', '무료수신거부 번호를 먼저 등록해 주세요. 광고 문자에 반드시 들어가야 해요.');
  const pv = await prepare(ctx, mallId, input);
  const aud = pv.aud;
  if (pv.errors.length) throw new UserError('invalid_input', pv.errors.join(' '));
  if (aud.reachable === 0) throw new UserError('no_audience', '문자를 받을 수 있는 찜·장바구니 고객이 없어요.');
  const dup = ctx.db.prepare("SELECT id FROM campaigns WHERE mall_id = ? AND product_no = ? AND state IN ('open','reached')").get(mallId, pv.product.product_no);
  if (dup) throw new UserError('duplicate', '이 상품은 이미 진행 중인 공구가 있어요.', 409);

  const now = ctx.clock.now();
  const deadline = new Date(input.deadline_at);
  const couponUntil = new Date(deadline.getTime() + (input.pay_window_h + 24) * HOUR); // 판정 지연 대비 여유 24시간
  const { coupon_no } = await ctx.cafe24.createCoupon(mallId, {
    name: `[찜 공구] ${pv.product.product_name}`,
    product_no: pv.product.product_no,
    discount_amount: pv.product.price - input.deal_price,
    available_from: deadline.toISOString(),
    available_until: couponUntil.toISOString(),
  });

  const id = newId('cmp');
  try {
    tx(ctx.db, () => {
      ctx.db.prepare(`INSERT INTO campaigns (id, mall_id, product_no, product_name, list_price, deal_price, cost_price, target_qty, per_member_limit,
        deadline_at, pay_window_h, ship_eta, state, coupon_no, report_token, opened_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?)`)
        .run(id, mallId, pv.product.product_no, pv.product.product_name, pv.product.price, input.deal_price, input.cost_price ?? null,
          input.target_qty, input.per_member_limit, deadline.toISOString(), input.pay_window_h, input.ship_eta, coupon_no,
          randomBytes(18).toString('base64url'), now.toISOString());
      const ins = ctx.db.prepare('INSERT INTO invitations (campaign_id, member_id, source) VALUES (?,?,?)');
      for (const m of aud.members) ins.run(id, m.member_id, m.source);
      ctx.db.prepare(`INSERT INTO messages (id, campaign_id, kind, recipients_json, content, status, send_after) VALUES (?,?,?,?,?,'scheduled',?)`)
        .run(newId('msg'), id, 'invite_ad', JSON.stringify(aud.members.map(m => m.member_id)), pv.message, nextAllowedSendTime(now).toISOString());
      audit(ctx.db, now, actor, 'campaign.open', id, { ...input, coupon_no, invited: aud.members.length });
    });
  } catch (e) {
    recordIssue(ctx.db, now, null, 'orphan_coupon', { mall_id: mallId, coupon_no, error: String(e) });
    throw e;
  }
  return { campaign: getCampaign(ctx, id), invited: aud.members.length, send_at: nextAllowedSendTime(now).toISOString() };
}

/** 위젯·문자에 보여 줄 공개 정보 (개인정보 없음) */
export function publicView(ctx: Ctx, c: Campaign) {
  return {
    id: c.id, state: c.state, product_no: c.product_no, product_name: c.product_name,
    list_price: c.list_price, deal_price: c.deal_price, target_qty: c.target_qty, pledged_qty: pledgedQty(ctx, c.id),
    per_member_limit: c.per_member_limit, deadline_at: c.deadline_at, pay_until: c.pay_until, ship_eta: c.ship_eta,
  };
}

export function activeCampaignForProduct(ctx: Ctx, mallId: string, productNo: number): Campaign | null {
  return (ctx.db.prepare("SELECT * FROM campaigns WHERE mall_id = ? AND product_no = ? ORDER BY opened_at DESC LIMIT 1").get(mallId, productNo) as Campaign | undefined) ?? null;
}

/** 원씽 기록: 판매자가 확정 수량을 보고 생산·발주를 결정했다 (운영자가 판매자 확인 후 입력) */
export function recordProductionDecision(ctx: Ctx, actor: string, campaignId: string, body: { qty?: unknown; note?: unknown }) {
  const c = getCampaign(ctx, campaignId);
  if (c.state !== 'settled') throw new UserError('not_settled', '결제 기간이 끝나 확정된 공구만 기록할 수 있어요.', 409);
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1) throw new UserError('bad_qty', '생산·발주 수량을 입력해 주세요.');
  const note = String(body.note ?? '').slice(0, 300);
  if (!note.trim()) throw new UserError('note_required', '확인 근거를 적어 주세요. 예: 발주서 번호, 가마 일정 날짜');
  const now = ctx.clock.now();
  ctx.db.prepare('UPDATE campaigns SET decision_qty = ?, decision_note = ?, decided_at = ? WHERE id = ?').run(qty, note, now.toISOString(), c.id);
  audit(ctx.db, now, actor, 'campaign.production_decided', c.id, { qty, note });
  return getCampaign(ctx, c.id);
}
