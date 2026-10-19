// 마감 판정 → 쿠폰 발급 → 결과 안내 (F7·F8). 실제 마감 시각 이후에만, 한 번만 판정한다.

import { and, eq, inArray, lte } from "drizzle-orm";
import { schema } from "@/db";
import { nextAllowedSendTime } from "../core/messaging";
import { proceedInfo } from "../core/campaign";
import type { PledgeState } from "../core/pledge";
import { HOUR, fmtKst } from "../time";
import { audit, recordIssue, UserError, type Ctx } from "./context";
import { getCampaign, getMall, pledgedQty, type Campaign } from "./campaigns";

/** 판정은 됐지만 쿠폰 발급·결과 안내가 카페24 오류로 끝나지 않은 공구. 끝날 때까지 다시 시도하고, 그동안 판정표 기술 정확성에 잡힌다 */
export const JUDGE_INCOMPLETE = "judge_incomplete";

/** 마감 시각이 지난 진행 중 공구를 모두 판정하고, 멈춘 판정 뒤처리를 이어서 끝낸다. 한 공구가 실패해도 나머지는 계속한다 */
export async function judgeDue(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.state, "open"), lte(schema.campaigns.deadlineAt, ctx.clock.now())));
  const done: string[] = [];
  for (const r of rows) {
    try { if (await judge(ctx, r.id, "scheduler")) done.push(r.id); }
    catch (e) { ctx.log("마감 판정 실패", { campaign: r.id, error: String(e) }); }
  }
  const stuck = await ctx.db.selectDistinct({ id: schema.issues.campaignId }).from(schema.issues)
    .where(and(eq(schema.issues.kind, JUDGE_INCOMPLETE), eq(schema.issues.resolved, false)));
  for (const s of stuck) {
    if (!s.id || done.includes(s.id)) continue;
    const c = await getCampaign(ctx, s.id);
    if (c.state === "reached" || c.state === "failed") await finishJudged(ctx, c);
  }
  return done;
}

/** 운영자 수동 실행용. 마감 전에는 판정하지 않는다 (가짜 마감 금지). 뒤처리가 멈춘 공구는 이어서 끝낸다 */
export async function judgeNow(ctx: Ctx, campaignId: string, actor: string) {
  const c = await getCampaign(ctx, campaignId);
  if (ctx.clock.now() < c.deadlineAt) throw new UserError("before_deadline", "마감 시각 전에는 판정할 수 없어요.", 409);
  if (c.state !== "open") {
    if (!(await isIncomplete(ctx, c.id)) || (c.state !== "reached" && c.state !== "failed")) throw new UserError("already_judged", "이미 판정한 공구예요.", 409);
    await audit(ctx, actor, "campaign.judge_retry", c.id, undefined, c.mallId);
    await finishJudged(ctx, c);
    return getCampaign(ctx, campaignId);
  }
  await judge(ctx, campaignId, actor);
  return getCampaign(ctx, campaignId);
}

export async function isIncomplete(ctx: Ctx, campaignId: string) {
  const [row] = await ctx.db.select({ id: schema.issues.id }).from(schema.issues)
    .where(and(eq(schema.issues.campaignId, campaignId), eq(schema.issues.kind, JUDGE_INCOMPLETE), eq(schema.issues.resolved, false))).limit(1);
  return !!row;
}

async function judge(ctx: Ctx, id: string, actor: string): Promise<boolean> {
  const now = ctx.clock.now();
  const c = await getCampaign(ctx, id);
  // 결제 기한 = 판정 + 결제 기간. 단 쿠폰 기간은 공구를 열 때 "마감 + 결제 기간 + 여유 24시간"으로 정해지므로,
  // 판정이 늦어지면 마감 + 결제 기간에서 끊는다 (기한 안인데 쿠폰이 끝나 결제 못 하는 일을 막는다)
  const payUntil = new Date(Math.min(now.getTime(), c.deadlineAt.getTime()) + c.payWindowHours * HOUR);
  // 공구 줄을 잠그고 신청 수량을 센 뒤 상태를 바꾼다. 신청·취소도 같은 줄을 잠그므로 판정과 엇갈리지 않는다.
  // 상태 전이는 한 번만 일어난다 (스케줄러 중복 실행 대비)
  let total = 0;
  const changed = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.select({ state: schema.campaigns.state }).from(schema.campaigns).where(eq(schema.campaigns.id, id)).for("update");
    if (row?.state !== "open") return [];
    total = await pledgedQty(ctx, id, tx);
    const reached = total >= c.targetQty;
    return tx.update(schema.campaigns)
      .set({ state: reached ? "reached" : "failed", judgedAt: now, payUntil: reached ? payUntil : null })
      .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.state, "open"))).returning();
  });
  if (!changed.length) return false;
  const reached = changed[0].state === "reached";
  await audit(ctx, actor, reached ? "campaign.reached" : "campaign.failed", id, { pledged: total, target: c.targetQty }, c.mallId);
  if (!reached) {
    await ctx.db.update(schema.pledges).set({ state: "not_reached", updatedAt: now }).where(and(eq(schema.pledges.campaignId, id), eq(schema.pledges.state, "pledged")));
  }
  await finishJudged(ctx, changed[0]);
  return true;
}

/** 판정 뒤처리: 달성이면 쿠폰 발급, 그리고 결과·결제 마감 전 안내 예약. 여러 번 실행해도 결과가 같다.
 *  카페24 오류로 멈추면 확인할 일(judge_incomplete)로 남기고, 정기 작업이나 운영자 수동 판정이 다시 시도한다 */
async function finishJudged(ctx: Ctx, c: Campaign): Promise<boolean> {
  try {
    // 미달이면 결과 안내가 늦어지는 사이 '그래도 살래요'를 누른 신청자(still_wanted)도 안내를 받는다
    const states = c.state === "reached" ? ["pledged", "coupon_issued", "paid"] : ["not_reached", "still_wanted"];
    const rows = await ctx.db.select({ memberId: schema.pledges.memberId, state: schema.pledges.state }).from(schema.pledges)
      .where(and(eq(schema.pledges.campaignId, c.id), inArray(schema.pledges.state, states)));
    if (c.state === "reached") await issueCoupons(ctx, c, rows.filter((r) => r.state === "pledged").map((r) => r.memberId));
    const [queued] = await ctx.db.select({ id: schema.messages.id }).from(schema.messages)
      .where(and(eq(schema.messages.campaignId, c.id), eq(schema.messages.kind, "result"))).limit(1);
    if (!queued) await queueResult(ctx, c, rows.map((r) => r.memberId), await pledgedQty(ctx, c.id));
    await ctx.db.update(schema.issues).set({ resolved: true })
      .where(and(eq(schema.issues.campaignId, c.id), eq(schema.issues.kind, JUDGE_INCOMPLETE), eq(schema.issues.resolved, false)));
    return true;
  } catch (e) {
    ctx.log("판정 뒤처리 실패", { campaign: c.id, error: String(e) });
    if (!(await isIncomplete(ctx, c.id))) await recordIssue(ctx, c.id, JUDGE_INCOMPLETE, { state: c.state, error: String(e) });
    return false;
  }
}

/** 100명씩 나눠 발급하고, 발급 내역과 대조해 빠진 회원은 한 번 더 발급한다(이때 실패한 묶음은 1명씩). 그래도 빠지면 이슈로 남긴다.
 *  이미 쿠폰을 가진 회원(앞선 시도에서 발급됨)에게는 다시 발급하지 않는다.
 *  from: 쿠폰을 받으면 coupon_issued로 바꿀 신청 상태 (판정 때는 pledged, 미달 뒤 그래도 진행할 때는 still_wanted) */
export async function issueCoupons(ctx: Ctx, c: Campaign, memberIds: string[], from: PledgeState = "pledged") {
  if (!memberIds.length) return;
  const now = ctx.clock.now();
  const api = await ctx.shop(c.mallId);
  // oneByOne: 묶음이 실패하면 1명씩 다시 보낸다. 발급이 거절되는 회원(탈퇴 등) 한 명 때문에 같은 묶음 99명이 빠지지 않게 (#26)
  const issue = async (ids: string[], oneByOne = false) => {
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      try { await api.issueCoupon(c.couponNo!, batch); }
      catch (e) {
        ctx.log("쿠폰 발급 묶음 실패", { campaign: c.id, size: batch.length, error: String(e) });
        if (oneByOne && batch.length > 1) for (const m of batch) await api.issueCoupon(c.couponNo!, [m]).catch(() => undefined);
      }
    }
  };
  let holders = new Set(await api.listCouponHolders(c.couponNo!));
  await issue(memberIds.filter((m) => !holders.has(m)));
  holders = new Set(await api.listCouponHolders(c.couponNo!));
  let missing = memberIds.filter((m) => !holders.has(m));
  if (missing.length) {
    await issue(missing, true);
    holders = new Set(await api.listCouponHolders(c.couponNo!));
    missing = memberIds.filter((m) => !holders.has(m));
  }
  for (const m of memberIds) {
    if (!holders.has(m)) continue;
    await ctx.db.update(schema.pledges).set({ state: "coupon_issued", updatedAt: now })
      .where(and(eq(schema.pledges.campaignId, c.id), eq(schema.pledges.memberId, m), eq(schema.pledges.state, from)));
  }
  if (missing.length) await recordIssue(ctx, c.id, "coupon_missing", { count: missing.length, members: missing });
}

/** 결과 안내 문자. 광고성 여부(P5) 결론 전이라 수신 동의 고객에게만 보낸다 (개인정보 권한이 없으면 카페24가 수신거부자를 뺀다) */
async function queueResult(ctx: Ctx, c: Campaign, pledgers: string[], total: number) {
  if (!pledgers.length) return;
  const mall = await getMall(ctx, c.mallId);
  const api = await ctx.shop(c.mallId);
  const ok = api.privacy ? new Set((await api.consents(pledgers)).filter((x) => x.sms).map((x) => x.memberId)) : new Set(pledgers);
  const to = pledgers.filter((m) => ok.has(m));
  if (!to.length) return;
  const brand = mall.brandName || mall.mallId;
  const content = c.state === "reached"
    ? `[${brand}] ★ 신청하신 ${c.productName} 공동구매가 목표를 달성했습니다(${total}/${c.targetQty}개).\n☞ 계정에 넣어 드린 할인 쿠폰으로 ${fmtKst(c.payUntil)}까지 결제해 주시기 바랍니다.\n${ctx.productUrl(c.mallId, c.productNo)}`
    : `[${brand}] 신청하신 ${c.productName} 공동구매가 목표(${c.targetQty}개)에 못 미쳐 진행되지 않습니다. 결제된 금액은 없습니다.\n☞ 구매를 원하시면 ${fmtKst(proceedInfo(c, ctx.clock.now()).proceedUntil)}까지 상품 페이지에서 '그래도 살래요'를 눌러 주시기 바랍니다. 진행 여부는 판매자가 정합니다.\n${ctx.productUrl(c.mallId, c.productNo)}`;
  await ctx.db.insert(schema.messages).values({ campaignId: c.id, kind: "result", recipients: to, content, sendAfter: nextAllowedSendTime(ctx.clock.now()) });
  if (c.state === "reached") await queueReminder(ctx, c, to, brand);
}

const REMINDER_BEFORE_MS = 24 * HOUR;

/** 결제 마감 전 알림 (기획서 핵심 정책): 결제 기한 24시간 전, 야간이면 다음 08:00. 미룬 시각이 기한을 넘기면 보내지 않는다.
 *  받는 사람은 보내는 시점에 다시 고른다 (messages.ts: 그때까지 결제하지 않은 신청자만). */
export async function queueReminder(ctx: Ctx, c: Campaign, to: string[], brand: string) {
  if (!c.payUntil) return;
  const sendAfter = nextAllowedSendTime(new Date(c.payUntil.getTime() - REMINDER_BEFORE_MS));
  if (sendAfter >= c.payUntil) return;
  const content = `[${brand}] ※ ${c.productName} 공동구매 결제가 아직 완료되지 않았습니다.\n결제 기한은 ${fmtKst(c.payUntil)}까지입니다. ☞ 쿠폰을 쓰면 공구가로 결제됩니다.\n${ctx.productUrl(c.mallId, c.productNo)}`;
  await ctx.db.insert(schema.messages).values({ campaignId: c.id, kind: "pay_reminder", recipients: to, content, sendAfter });
}
