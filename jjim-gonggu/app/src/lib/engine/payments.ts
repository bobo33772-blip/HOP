// 결제 집계 (F9): 주문 웹훅 + 야간 대사 → 확정 수량. 확정 수량 = 결제 기간 안에 공구 쿠폰으로 결제된 수량.

import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { schema } from "@/db";
import type { OrderInfo } from "../cafe24/api";
import { DAY } from "../time";
import { audit, recordIssue, type Ctx } from "./context";
import { getCampaign } from "./campaigns";

// VERIFY(PoC): 카페24 주문 웹훅 이벤트 번호. 기획서 연동 인벤토리 I-09 기준.
export const PAID_EVENTS = new Set([90023, 90025]);
export const CANCEL_EVENTS = new Set([90026, 90029]);

/**
 * 웹훅 본문은 믿지 않는다. 주문번호만 꺼내 카페24 API로 주문을 다시 조회한 뒤 반영한다.
 * 그래서 위조된 웹훅이 와도 가짜 결제가 확정 수량에 들어가지 않는다.
 */
export async function handleOrderWebhook(ctx: Ctx, body: unknown): Promise<{ handled: number }> {
  const b = body as { event_no?: unknown; resource?: { mall_id?: unknown; order_id?: unknown } } | null;
  const ev = Number(b?.event_no);
  const mallId = String(b?.resource?.mall_id ?? "");
  const orderId = String(b?.resource?.order_id ?? "");
  if (!PAID_EVENTS.has(ev) && !CANCEL_EVENTS.has(ev)) return { handled: 0 };
  if (!/^[a-z0-9_-]{1,64}$/i.test(mallId) || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return { handled: 0 };
  const [known] = await ctx.db.select({ id: schema.malls.mallId }).from(schema.malls).where(eq(schema.malls.mallId, mallId));
  if (!known) return { handled: 0 };
  const order = await (await ctx.shop(mallId)).getOrder(orderId);
  if (!order) return { handled: 0 };
  return { handled: await applyOrder(ctx, mallId, order, "webhook") };
}

/** 주문 하나를 공구 확정 수량에 반영한다. 같은 주문이 여러 번 와도 결과는 같다 */
export async function applyOrder(ctx: Ctx, mallId: string, order: OrderInfo, source: "webhook" | "reconcile"): Promise<number> {
  const now = ctx.clock.now();
  if (!order.couponNos.length || order.status === "pending") return 0; // 입금 전 주문은 확정 수량에 넣지 않는다
  const camps = await ctx.db.select().from(schema.campaigns)
    .where(and(eq(schema.campaigns.mallId, mallId), inArray(schema.campaigns.state, ["reached", "settled"]), inArray(schema.campaigns.couponNo, order.couponNos)));
  let n = 0;
  for (const c of camps) {
    const items = order.items.filter((i) => i.productNo === c.productNo);
    if (!items.length) continue;
    const qty = items.reduce((a, i) => a + i.qty, 0);
    const amount = items.reduce((a, i) => a + i.amount, 0);
    const late = c.payUntil != null && order.paidAt > c.payUntil;
    const status = order.status === "cancelled" ? "cancelled" : late ? "late" : "paid";
    const [prev] = await ctx.db.select({ status: schema.orderLinks.status }).from(schema.orderLinks).where(eq(schema.orderLinks.orderId, order.orderId));
    await ctx.db.insert(schema.orderLinks)
      .values({ orderId: order.orderId, campaignId: c.id, memberId: order.memberId, qty, amount, status, source, paidAt: order.paidAt, updatedAt: now })
      .onConflictDoUpdate({ target: schema.orderLinks.orderId, set: { status, qty, amount, updatedAt: now } });
    const pledgeState = status === "paid" ? "paid" : status === "cancelled" ? (c.state === "reached" ? "coupon_issued" : "expired") : null;
    if (pledgeState) {
      await ctx.db.update(schema.pledges).set({ state: pledgeState, updatedAt: now })
        .where(and(eq(schema.pledges.campaignId, c.id), eq(schema.pledges.memberId, order.memberId), inArray(schema.pledges.state, ["coupon_issued", "paid", "expired"])));
    }
    if (source === "reconcile" && (!prev || prev.status !== status)) {
      await recordIssue(ctx, c.id, "reconcile_fixed", { orderId: order.orderId, before: prev?.status ?? null, after: status });
    }
    n++;
  }
  return n;
}

/** 대사: 쿠폰을 쓴 주문을 카페24에서 다시 읽어 웹훅 유실·취소를 바로잡는다 */
export async function reconcileCampaign(ctx: Ctx, campaignId: string, actor = "scheduler") {
  const c = await getCampaign(ctx, campaignId);
  if (!c.couponNo || !["reached", "settled"].includes(c.state)) return { checked: 0 };
  const api = await ctx.shop(c.mallId);
  const orders = await api.listOrdersWithCoupon(c.couponNo, c.openedAt);
  const seen = new Set<string>();
  for (const o of orders) { await applyOrder(ctx, c.mallId, o, "reconcile"); seen.add(o.orderId); }
  // 목록에 없지만 우리가 결제로 기록한 주문은 개별 조회로 다시 확인한다
  const ours = await ctx.db.select({ orderId: schema.orderLinks.orderId }).from(schema.orderLinks)
    .where(and(eq(schema.orderLinks.campaignId, c.id), ne(schema.orderLinks.status, "cancelled")));
  for (const { orderId } of ours) {
    if (seen.has(orderId)) continue;
    const o = await api.getOrder(orderId);
    if (o) await applyOrder(ctx, c.mallId, o, "reconcile");
    else await recordIssue(ctx, c.id, "reconcile_mismatch", { orderId, detail: "카페24에서 주문을 찾을 수 없음" });
  }
  await audit(ctx, actor, "campaign.reconcile", c.id, { orders: orders.length }, c.mallId);
  return { checked: orders.length };
}

/** 최근 14일 안에 판정한 공구 전체 대사 (매일 03:00 KST) */
export async function reconcileRecent(ctx: Ctx) {
  const since = new Date(ctx.clock.now().getTime() - 14 * DAY);
  const rows = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns)
    .where(and(inArray(schema.campaigns.state, ["reached", "settled"]), gte(schema.campaigns.judgedAt, since)));
  for (const r of rows) await reconcileCampaign(ctx, r.id);
  return rows.length;
}

/** 결제 기간 중인 공구만 대사한다. 주문 웹훅을 못 받는 몰(개발 단계 앱 등)에서도 결제가 1시간 안에 반영되게 한다 */
export async function reconcilePaying(ctx: Ctx) {
  const rows = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns).where(eq(schema.campaigns.state, "reached"));
  for (const r of rows) await reconcileCampaign(ctx, r.id);
  return rows.length;
}

/** 결제 기간이 끝난 공구를 확정한다. 확정 직전에 한 번 더 대사한다 */
export async function settleDue(ctx: Ctx): Promise<string[]> {
  const now = ctx.clock.now();
  const rows = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.state, "reached"), lte(schema.campaigns.payUntil, now)));
  const out: string[] = [];
  for (const r of rows) {
    await reconcileCampaign(ctx, r.id);
    const u = await ctx.db.update(schema.campaigns).set({ state: "settled", settledAt: now })
      .where(and(eq(schema.campaigns.id, r.id), eq(schema.campaigns.state, "reached"))).returning();
    if (!u.length) continue;
    await ctx.db.update(schema.pledges).set({ state: "expired", updatedAt: now }).where(and(eq(schema.pledges.campaignId, r.id), eq(schema.pledges.state, "coupon_issued")));
    await audit(ctx, "scheduler", "campaign.settled", r.id, undefined, u[0].mallId);
    out.push(r.id);
  }
  return out;
}
