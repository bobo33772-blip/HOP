// 마감 판정 → 쿠폰 발급 → 결과 안내 (F7·F8). 실제 마감 시각 이후에만, 한 번만 판정한다.

import { and, eq, lte } from "drizzle-orm";
import { schema } from "@/db";
import { nextAllowedSendTime } from "../core/messaging";
import { HOUR, fmtKst } from "../time";
import { audit, recordIssue, UserError, type Ctx } from "./context";
import { getCampaign, getMall, pledgedQty, type Campaign } from "./campaigns";

/** 마감 시각이 지난 진행 중 공구를 모두 판정한다 */
export async function judgeDue(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.state, "open"), lte(schema.campaigns.deadlineAt, ctx.clock.now())));
  const done: string[] = [];
  for (const r of rows) if (await judge(ctx, r.id, "scheduler")) done.push(r.id);
  return done;
}

/** 운영자 수동 실행용. 마감 전에는 판정하지 않는다 (가짜 마감 금지) */
export async function judgeNow(ctx: Ctx, campaignId: string, actor: string) {
  const c = await getCampaign(ctx, campaignId);
  if (ctx.clock.now() < c.deadlineAt) throw new UserError("before_deadline", "마감 시각 전에는 판정할 수 없어요.", 409);
  if (c.state !== "open") throw new UserError("already_judged", "이미 판정한 공구예요.", 409);
  await judge(ctx, campaignId, actor);
  return getCampaign(ctx, campaignId);
}

async function judge(ctx: Ctx, id: string, actor: string): Promise<boolean> {
  const now = ctx.clock.now();
  const c = await getCampaign(ctx, id);
  const total = await pledgedQty(ctx, id);
  const reached = total >= c.targetQty;
  // 상태 전이는 한 번만 일어난다 (스케줄러 중복 실행 대비)
  const changed = await ctx.db.update(schema.campaigns)
    .set({ state: reached ? "reached" : "failed", judgedAt: now, payUntil: reached ? new Date(now.getTime() + c.payWindowHours * HOUR) : null })
    .where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.state, "open"))).returning();
  if (!changed.length) return false;
  await audit(ctx, actor, reached ? "campaign.reached" : "campaign.failed", id, { pledged: total, target: c.targetQty }, c.mallId);

  const pledgers = (await ctx.db.select({ memberId: schema.pledges.memberId }).from(schema.pledges)
    .where(and(eq(schema.pledges.campaignId, id), eq(schema.pledges.state, "pledged")))).map((x) => x.memberId);
  if (reached) {
    await issueCoupons(ctx, changed[0], pledgers);
  } else {
    await ctx.db.update(schema.pledges).set({ state: "not_reached", updatedAt: now }).where(and(eq(schema.pledges.campaignId, id), eq(schema.pledges.state, "pledged")));
  }
  await queueResult(ctx, changed[0], pledgers, total);
  return true;
}

/** 100명씩 나눠 발급하고, 발급 내역과 대조해 빠진 회원은 한 번 더 발급한다. 그래도 빠지면 이슈로 남긴다 */
async function issueCoupons(ctx: Ctx, c: Campaign, memberIds: string[]) {
  const now = ctx.clock.now();
  const api = await ctx.shop(c.mallId);
  const issue = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 100) {
      try { await api.issueCoupon(c.couponNo!, ids.slice(i, i + 100)); }
      catch (e) { ctx.log("쿠폰 발급 묶음 실패", { campaign: c.id, error: String(e) }); }
    }
  };
  await issue(memberIds);
  let holders = new Set(await api.listCouponHolders(c.couponNo!));
  let missing = memberIds.filter((m) => !holders.has(m));
  if (missing.length) {
    await issue(missing);
    holders = new Set(await api.listCouponHolders(c.couponNo!));
    missing = memberIds.filter((m) => !holders.has(m));
  }
  for (const m of memberIds) {
    if (!holders.has(m)) continue;
    await ctx.db.update(schema.pledges).set({ state: "coupon_issued", updatedAt: now })
      .where(and(eq(schema.pledges.campaignId, c.id), eq(schema.pledges.memberId, m), eq(schema.pledges.state, "pledged")));
  }
  if (missing.length) await recordIssue(ctx, c.id, "coupon_missing", { count: missing.length, members: missing });
}

/** 결과 안내 문자. 광고성 여부(P5) 결론 전이라 수신 동의 고객에게만 보낸다 */
async function queueResult(ctx: Ctx, c: Campaign, pledgers: string[], total: number) {
  if (!pledgers.length) return;
  const mall = await getMall(ctx, c.mallId);
  const ok = new Set((await (await ctx.shop(c.mallId)).consents(pledgers)).filter((x) => x.sms).map((x) => x.memberId));
  const to = pledgers.filter((m) => ok.has(m));
  if (!to.length) return;
  const brand = mall.brandName || mall.mallId;
  const content = c.state === "reached"
    ? `[${brand}] ${c.productName} 공동구매가 목표를 달성했어요 (${total}/${c.targetQty}개). 회원님 계정에 할인 쿠폰을 넣어 드렸어요. ${fmtKst(c.payUntil)}까지 결제해 주세요.\n${ctx.productUrl(c.mallId, c.productNo)}`
    : `[${brand}] ${c.productName} 공동구매가 목표(${c.targetQty}개)에 못 미쳐 진행되지 않아요. 결제된 금액은 없어요. 신청해 주셔서 감사합니다.`;
  await ctx.db.insert(schema.messages).values({ campaignId: c.id, kind: "result", recipients: to, content, sendAfter: nextAllowedSendTime(ctx.clock.now()) });
}
