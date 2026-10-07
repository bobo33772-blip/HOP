import { audit, recordIssue } from '../db.ts';
import type { OrderInfo } from '../cafe24/port.ts';
import type { Ctx } from '../context.ts';
import { getCampaign, type Campaign } from './campaigns.ts';

// VERIFY(PoC): 카페24 주문 웹훅 이벤트 번호. 기획서 연동 인벤토리 I-09 기준.
export const PAID_EVENTS = new Set([90023, 90025]);
export const CANCEL_EVENTS = new Set([90026, 90029]);

/**
 * 웹훅 본문은 믿지 않는다. 주문번호만 꺼내 카페24 API로 주문을 다시 조회한 뒤 반영한다.
 * 그래서 위조된 웹훅이 와도 가짜 결제가 확정 수량에 들어가지 않는다.
 */
export async function handleOrderWebhook(ctx: Ctx, body: any): Promise<{ handled: number }> {
  const ev = Number(body?.event_no);
  const mallId = String(body?.resource?.mall_id ?? '');
  const orderId = String(body?.resource?.order_id ?? '');
  if (!PAID_EVENTS.has(ev) && !CANCEL_EVENTS.has(ev)) return { handled: 0 };
  if (!/^[a-z0-9_-]{1,64}$/i.test(mallId) || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return { handled: 0 };
  const known = ctx.db.prepare('SELECT 1 FROM malls WHERE mall_id = ?').get(mallId);
  if (!known) return { handled: 0 };
  const order = await ctx.cafe24.getOrder(mallId, orderId);
  if (!order) return { handled: 0 };
  return { handled: applyOrder(ctx, mallId, order, 'webhook') };
}

/** 주문 하나를 공구 확정 수량에 반영한다. 같은 주문이 여러 번 와도 결과는 같다 */
export function applyOrder(ctx: Ctx, mallId: string, order: OrderInfo, source: 'webhook' | 'reconcile'): number {
  const now = ctx.clock.now().toISOString();
  if (!order.coupon_nos.length || order.status === 'pending') return 0; // 입금 전 주문은 확정 수량에 넣지 않는다
  const camps = ctx.db.prepare(`SELECT * FROM campaigns WHERE mall_id = ? AND state IN ('reached','settled') AND coupon_no IN (${order.coupon_nos.map(() => '?').join(',')})`)
    .all(mallId, ...order.coupon_nos) as Campaign[];
  let n = 0;
  for (const c of camps) {
    const items = order.items.filter(i => i.product_no === c.product_no);
    if (!items.length) continue;
    const qty = items.reduce((a, i) => a + i.qty, 0);
    const amount = items.reduce((a, i) => a + i.amount, 0);
    const late = c.pay_until != null && order.paid_at > c.pay_until;
    const status = order.status === 'cancelled' ? 'cancelled' : late ? 'late' : 'paid';
    const prev = ctx.db.prepare('SELECT status FROM order_links WHERE order_id = ?').get(order.order_id) as { status: string } | undefined;
    ctx.db.prepare(`INSERT INTO order_links (order_id, campaign_id, member_id, qty, amount, status, source, paid_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(order_id) DO UPDATE SET status = excluded.status, qty = excluded.qty, amount = excluded.amount, updated_at = excluded.updated_at`)
      .run(order.order_id, c.id, order.member_id, qty, amount, status, source, order.paid_at, now);
    const pledgeState = status === 'paid' ? 'paid' : status === 'cancelled' ? (c.state === 'reached' ? 'coupon_issued' : 'expired') : null;
    if (pledgeState) {
      ctx.db.prepare("UPDATE pledges SET state = ?, updated_at = ? WHERE campaign_id = ? AND member_id = ? AND state IN ('coupon_issued','paid','expired')")
        .run(pledgeState, now, c.id, order.member_id);
    }
    if (source === 'reconcile' && (!prev || prev.status !== status)) {
      recordIssue(ctx.db, ctx.clock.now(), c.id, 'reconcile_fixed', { order_id: order.order_id, before: prev?.status ?? null, after: status });
    }
    n++;
  }
  return n;
}

/** 야간 대사: 쿠폰을 쓴 주문을 카페24에서 다시 읽어 웹훅 유실·취소를 바로잡는다 */
export async function reconcileCampaign(ctx: Ctx, campaignId: string, actor = 'scheduler') {
  const c = getCampaign(ctx, campaignId);
  if (!c.coupon_no || !['reached', 'settled'].includes(c.state)) return { checked: 0 };
  const orders = await ctx.cafe24.listOrdersWithCoupon(c.mall_id, c.coupon_no, c.opened_at);
  const seen = new Set<string>();
  for (const o of orders) { applyOrder(ctx, c.mall_id, o, 'reconcile'); seen.add(o.order_id); }
  // 목록에 없지만 우리가 결제로 기록한 주문은 개별 조회로 다시 확인한다
  const ours = ctx.db.prepare("SELECT order_id FROM order_links WHERE campaign_id = ? AND status != 'cancelled'").all(c.id) as { order_id: string }[];
  for (const { order_id } of ours) {
    if (seen.has(order_id)) continue;
    const o = await ctx.cafe24.getOrder(c.mall_id, order_id);
    if (o) applyOrder(ctx, c.mall_id, o, 'reconcile');
    else recordIssue(ctx.db, ctx.clock.now(), c.id, 'reconcile_mismatch', { order_id, detail: '카페24에서 주문을 찾을 수 없음' });
  }
  audit(ctx.db, ctx.clock.now(), actor, 'campaign.reconcile', c.id, { orders: orders.length });
  return { checked: orders.length };
}

export async function reconcileRecent(ctx: Ctx) {
  const since = new Date(ctx.clock.now().getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const rows = ctx.db.prepare("SELECT id FROM campaigns WHERE state IN ('reached','settled') AND judged_at >= ?").all(since) as { id: string }[];
  for (const r of rows) await reconcileCampaign(ctx, r.id);
  return rows.length;
}

/** 결제 기간이 끝난 공구를 확정한다. 확정 직전에 한 번 더 대사한다 */
export async function settleDue(ctx: Ctx): Promise<string[]> {
  const now = ctx.clock.now().toISOString();
  const rows = ctx.db.prepare("SELECT id FROM campaigns WHERE state = 'reached' AND pay_until <= ?").all(now) as { id: string }[];
  const out: string[] = [];
  for (const r of rows) {
    await reconcileCampaign(ctx, r.id);
    const u = ctx.db.prepare("UPDATE campaigns SET state = 'settled', settled_at = ? WHERE id = ? AND state = 'reached'").run(now, r.id);
    if (!u.changes) continue;
    ctx.db.prepare("UPDATE pledges SET state = 'expired', updated_at = ? WHERE campaign_id = ? AND state = 'coupon_issued'").run(now, r.id);
    audit(ctx.db, ctx.clock.now(), 'scheduler', 'campaign.settled', r.id);
    out.push(r.id);
  }
  return out;
}
