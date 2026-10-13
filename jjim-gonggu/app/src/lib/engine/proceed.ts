// 미달 뒤 '그래도 진행' (#23). 미달 공구의 신청자가 위젯에서 '그래도 살래요'를 표시하고, 판매자가 그 숫자를 보고
// 원래 공구가 또는 새 가격으로 진행한다. 쿠폰은 표시한 회원에게만 주고, 진행한 시각부터 결제 기간을 센다.
// 4주 판정표의 공구 성사율 · 신청→결제에서는 빼고 따로 센다 (campaigns.proceededAt).

import { and, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@/db";
import { proceedInfo } from "../core/campaign";
import { nextAllowedSendTime } from "../core/messaging";
import type { PledgeState } from "../core/pledge";
import { HOUR, fmtKst, won } from "../time";
import { audit, recordIssue, UserError, type Ctx } from "./context";
import { COUPON_GRACE_HOURS, getCampaign, getMall, publicView, type Campaign } from "./campaigns";
import { issueCoupons, queueReminder } from "./judge";
import { memberOf } from "./pledges";

const P = schema.pledges;

function assertProceedOpen(ctx: Ctx, c: Campaign) {
  if (c.state !== "failed") throw new UserError("not_failed", "목표에 못 미친 공구만 그래도 진행할 수 있어요.", 409);
  if (!proceedInfo(c, ctx.clock.now()).proceedOpen) throw new UserError("proceed_closed", "그래도 진행을 정하는 기간이 지났어요.", 409);
}

/** 위젯: 미달 공구에 신청했던 회원이 '그래도 살래요'를 표시하거나(want) 취소한다. 같은 요청이 다시 와도 결과는 같다 */
export async function setStillWanted(ctx: Ctx, campaignId: string, body: { member_token?: unknown }, want: boolean) {
  const c = await getCampaign(ctx, campaignId);
  const memberId = await memberOf(ctx, c.mallId, body.member_token);
  assertProceedOpen(ctx, c);
  const from: PledgeState = want ? "not_reached" : "still_wanted";
  const to: PledgeState = want ? "still_wanted" : "not_reached";
  const [p] = await ctx.db.select().from(P).where(and(eq(P.campaignId, c.id), eq(P.memberId, memberId)));
  if (!p || (p.state !== from && p.state !== to)) throw new UserError("no_pledge", "이 공구에 신청했던 회원만 표시할 수 있어요.", 404);
  if (p.state === from) await ctx.db.update(P).set({ state: to, updatedAt: ctx.clock.now() }).where(and(eq(P.id, p.id), eq(P.state, from)));
  return { pledge: { qty: p.qty, state: to, createdAt: p.createdAt }, campaign: await publicView(ctx, c) };
}

/** 판매자 화면: '그래도 살래요'를 표시한 회원 수 · 수량 (회원 ID는 내보내지 않는다) */
export async function stillWanted(ctx: Ctx, campaignId: string) {
  const [r] = await ctx.db.select({ members: sql<number>`count(*)`, qty: sql<number>`coalesce(sum(${P.qty}), 0)` })
    .from(P).where(and(eq(P.campaignId, campaignId), eq(P.state, "still_wanted")));
  return { members: Number(r?.members ?? 0), qty: Number(r?.qty ?? 0) };
}

/** 판매자 · 운영자: 미달 공구를 그래도 진행한다. price를 비우면 원래 공구가 */
export async function proceedCampaign(ctx: Ctx, actor: string, campaignId: string, body: { price?: unknown; confirmBelowCost?: unknown }) {
  const c = await getCampaign(ctx, campaignId);
  assertProceedOpen(ctx, c);
  const price = body.price === "" || body.price == null ? c.dealPrice : Number(body.price);
  if (!Number.isInteger(price) || price <= 0) throw new UserError("bad_price", "진행할 가격을 확인해 주세요.");
  if (price >= c.listPrice) throw new UserError("bad_price", `가격은 정가(${won(c.listPrice)})보다 낮아야 해요.`);
  if (c.costPrice != null && price < c.costPrice && body.confirmBelowCost !== true) {
    throw new UserError("below_cost", `원가(${won(c.costPrice)})보다 낮아요. 팔수록 손해예요. 그래도 진행하려면 원가 미만 확인에 체크해 주세요.`, 422);
  }
  const members = (await ctx.db.select({ memberId: P.memberId }).from(P).where(and(eq(P.campaignId, c.id), eq(P.state, "still_wanted")))).map((x) => x.memberId);
  if (!members.length) throw new UserError("no_one_wants", "'그래도 살래요'를 표시한 고객이 없어요.", 409);

  // 처음 만든 쿠폰은 '마감 + 결제 기간 + 24시간'까지라 모자랄 수 있어, 진행한 시각부터 쓸 수 있는 쿠폰을 새로 만든다
  const now = ctx.clock.now();
  const payUntil = new Date(now.getTime() + c.payWindowHours * HOUR);
  const couponNo = await (await ctx.shop(c.mallId)).createCoupon({
    name: `[찜꽁] ${c.productName}`, productNo: c.productNo, discountAmount: c.listPrice - price,
    availableFrom: now, availableUntil: new Date(payUntil.getTime() + COUPON_GRACE_HOURS * HOUR),
  });
  // 상태 전이는 한 번만 (두 번 눌러도 쿠폰을 두 번 주지 않는다)
  const [done] = await ctx.db.update(schema.campaigns).set({ state: "reached", proceededAt: now, payUntil, dealPrice: price, couponNo })
    .where(and(eq(schema.campaigns.id, c.id), eq(schema.campaigns.state, "failed"), isNull(schema.campaigns.proceededAt))).returning();
  if (!done) {
    await recordIssue(ctx, c.id, "orphan_coupon", { mallId: c.mallId, couponNo, error: "already_proceeded" });
    throw new UserError("already_proceeded", "이미 진행한 공구예요.", 409);
  }
  await audit(ctx, actor, "campaign.proceeded", c.id, { price, fromPrice: c.dealPrice, members: members.length, couponNo, previousCouponNo: c.couponNo }, c.mallId);
  await issueCoupons(ctx, done, members, "still_wanted");
  await queueProceeded(ctx, done, c.dealPrice);
  return getCampaign(ctx, c.id);
}

/** 진행 안내 문자와 결제 마감 전 알림. 결과 문자처럼 쿠폰을 받은 수신 동의 고객에게만 보낸다 */
async function queueProceeded(ctx: Ctx, c: Campaign, fromPrice: number) {
  const issued = (await ctx.db.select({ memberId: P.memberId }).from(P).where(and(eq(P.campaignId, c.id), eq(P.state, "coupon_issued")))).map((x) => x.memberId);
  if (!issued.length) return;
  const mall = await getMall(ctx, c.mallId);
  const api = await ctx.shop(c.mallId);
  const ok = api.privacy ? new Set((await api.consents(issued)).filter((x) => x.sms).map((x) => x.memberId)) : new Set(issued);
  const to = issued.filter((m) => ok.has(m));
  if (!to.length) return;
  const brand = mall.brandName || mall.mallId;
  const changed = c.dealPrice !== fromPrice ? ` 수량이 적어 공구가가 ${won(fromPrice)}에서 ${won(c.dealPrice)}으로 바뀌었어요.` : "";
  const content = `[${brand}] ${c.productName} 공동구매를 판매자가 그래도 진행하기로 했어요.${changed} 회원님 계정에 ${won(c.listPrice - c.dealPrice)} 할인 쿠폰을 넣어 드렸어요. ${fmtKst(c.payUntil)}까지 결제해 주세요.\n${ctx.productUrl(c.mallId, c.productNo)}`;
  await ctx.db.insert(schema.messages).values({ campaignId: c.id, kind: "proceed", recipients: to, content, sendAfter: nextAllowedSendTime(ctx.clock.now()) });
  await queueReminder(ctx, c, to, brand);
}
