// 확정 리포트 (F10)와 4주 판정표. 리포트에는 회원 ID 등 개인정보를 넣지 않는다.

import { and, count, countDistinct, eq, inArray, ne, sql, sum } from "drizzle-orm";
import { schema } from "@/db";
import { expectedConfirmed } from "../core/pledge";
import type { CampaignState } from "../core/campaign";
import type { Ctx } from "./context";
import { getCampaign, pledgedQty } from "./campaigns";

const n = (v: unknown) => Number(v ?? 0);

/** 확정 리포트: 결제 완료 기준 확정 수량과 4주 성공 기준에 쓰는 퍼널 숫자 */
export async function buildReport(ctx: Ctx, campaignId: string) {
  const c = await getCampaign(ctx, campaignId);
  const { db } = ctx;
  const P = schema.pledges, O = schema.orderLinks;

  const [[inv], [sentInvite], [pl], [invPl], [paid], [cancelled], [late], [issued], [issues]] = await Promise.all([
    db.select({ v: count() }).from(schema.invitations).where(eq(schema.invitations.campaignId, c.id)),
    db.select({ v: count() }).from(schema.messages).where(and(eq(schema.messages.campaignId, c.id), eq(schema.messages.kind, "invite_ad"), eq(schema.messages.status, "sent"))),
    db.select({ v: count() }).from(P).where(and(eq(P.campaignId, c.id), ne(P.state, "cancelled"))),
    db.select({ v: count() }).from(P)
      .innerJoin(schema.invitations, and(eq(schema.invitations.campaignId, P.campaignId), eq(schema.invitations.memberId, P.memberId)))
      .where(and(eq(P.campaignId, c.id), ne(P.state, "cancelled"))),
    db.select({ members: countDistinct(O.memberId), qty: sum(O.qty), revenue: sum(O.amount) }).from(O).where(and(eq(O.campaignId, c.id), eq(O.status, "paid"))),
    db.select({ v: count() }).from(O).where(and(eq(O.campaignId, c.id), eq(O.status, "cancelled"))),
    db.select({ v: count() }).from(O).where(and(eq(O.campaignId, c.id), eq(O.status, "late"))),
    db.select({ v: count() }).from(P).where(and(eq(P.campaignId, c.id), inArray(P.state, ["coupon_issued", "paid", "expired"]))),
    db.select({ v: count() }).from(schema.issues).where(and(eq(schema.issues.campaignId, c.id), eq(schema.issues.resolved, false))),
  ]);

  const invited = n(inv.v);
  const invitedSent = n(sentInvite.v) > 0 ? invited : 0;
  const paidMembers = n(paid.members), confirmedQty = n(paid.qty), revenue = n(paid.revenue);
  const couponIssued = n(issued.v);
  const pledged = await pledgedQty(ctx, c.id);
  const rate = (a: number, b: number) => (b ? a / b : null);
  const state = c.state as CampaignState;

  return {
    campaign: {
      id: c.id, mallId: c.mallId, productNo: c.productNo, productName: c.productName, state,
      listPrice: c.listPrice, dealPrice: c.dealPrice, targetQty: c.targetQty, deadlineAt: c.deadlineAt,
      payUntil: c.payUntil, shipEta: c.shipEta, settledAt: c.settledAt,
      decision: c.decidedAt ? { qty: c.decisionQty, note: c.decisionNote, at: c.decidedAt } : null,
      proceededAt: c.proceededAt, // 미달 뒤 그래도 진행한 시각 (성사로 세지 않는다)
    },
    funnel: { invited, invitedSent, pledgers: n(pl.v), invitedPledgers: n(invPl.v), pledgedQty: pledged, couponIssued, paidMembers },
    confirmed: {
      qty: confirmedQty, revenue, unpaidMembers: Math.max(0, couponIssued - paidMembers),
      cancelledOrders: n(cancelled.v), lateOrders: n(late.v),
      expected: state === "reached" ? expectedConfirmed(pledged, confirmedQty) : null,
    },
    rates: {
      inviteToPledge: rate(n(invPl.v), invitedSent),
      pledgeToPaid: rate(paidMembers, couponIssued),
      // 성사: 목표를 채워 달성한 공구만. 미달 · 그래도 진행 · 판매자가 취소한 공구(#65)는 성사가 아니다
      reached: state === "open" ? null : (state === "reached" || state === "settled") && !c.proceededAt,
    },
    openIssues: n(issues.v),
    final: state === "settled" || state === "failed" || state === "cancelled",
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

/** 4주 성공 기준 판정표 (기획서 '4주 MVP · 목표'와 같은 기준). 결과를 보기 전에 정해 둔 기준으로만 판정한다 */
export async function pilotScorecard(ctx: Ctx) {
  const camps = await ctx.db.select({ id: schema.campaigns.id, mallId: schema.campaigns.mallId, state: schema.campaigns.state, proceededAt: schema.campaigns.proceededAt }).from(schema.campaigns);
  // 판매자가 모집 중에 취소한 공구(#65): 성사율에서는 미달처럼 분모에 넣는다(미달될 것 같은 공구를 취소해 성사율을 올릴 수 없게).
  // 파일럿 규모(연 공구 수)와 '다시 생각' 판단에서는 뺀다. 따로 "취소 N건"으로 보여 준다
  const cancelled = camps.filter((c) => c.state === "cancelled").length;
  const run = camps.filter((c) => c.state !== "cancelled");
  const malls = new Set(run.map((c) => c.mallId)).size;
  const judged = camps.filter((c) => c.state !== "open");
  // 미달 뒤 그래도 진행한 공구는 성사가 아니다. 쿠폰도 원하는 사람만 받아 결제율이 높게 나오니 신청→결제에서도 뺀다
  const reached = judged.filter((c) => (c.state === "reached" || c.state === "settled") && !c.proceededAt).length;
  const proceeded = camps.filter((c) => c.proceededAt).length;
  const reps = await Promise.all(camps.map((c) => buildReport(ctx, c.id)));
  const sum = (f: (r: Report) => number, rs = reps) => rs.reduce((a, r) => a + f(r), 0);
  const sent = sum((r) => r.funnel.invitedSent), invP = sum((r) => r.funnel.invitedPledgers);
  const notProceeded = reps.filter((r) => !r.campaign.proceededAt);
  const issued = sum((r) => r.funnel.couponIssued, notProceeded), paid = sum((r) => r.funnel.paidMembers, notProceeded);
  const [acc] = await ctx.db.select({ v: count() }).from(schema.issues)
    .where(and(inArray(schema.issues.kind, ["coupon_missing", "reconcile_mismatch", "judge_incomplete"]), eq(schema.issues.resolved, false)));
  // 원씽: 확정 수량(결제 기간 안 쿠폰 결제)이 목표 수량 이상인 공구로 생산·발주를 결정한 판매자.
  // 신청으로 달성했어도 결제가 목표에 못 미치면 "목표가 차서 실제로 돈을 내고 → 그 숫자로 발주"가 아니다 (기획서 v2 1번, 검증 보고서 L-1)
  const oneThing = new Set(reps.filter((x) => x.campaign.decision && x.confirmed.qty >= x.campaign.targetQty).map((x) => x.campaign.mallId)).size;
  const r = (a: number, b: number) => (b ? a / b : null);
  const accuracy = n(acc.v);
  const rows = [
    { key: "one_thing", label: "목표 수량 이상 결제된 공구로 생산을 결정한 판매자", value: oneThing as number | string | null, kind: "count", goal: "1곳 이상", pass: oneThing >= 1 },
    { key: "scale", label: "파일럿 몰 · 연 공구", value: `${malls}몰 · ${run.length}건`, kind: "text", goal: "3몰 · 3건 이상", pass: malls >= 3 && run.length >= 3 },
    { key: "reach_rate", label: "공구 성사율", value: r(reached, judged.length), kind: "rate", goal: "60% 이상", pass: judged.length > 0 && reached / judged.length >= 0.6 },
    { key: "invite_to_pledge", label: "초대 → 신청", value: r(invP, sent), kind: "rate", goal: "5% 이상", pass: sent > 0 && invP / sent >= 0.05 },
    { key: "pledge_to_paid", label: "신청 → 결제", value: r(paid, issued), kind: "rate", goal: "50% 이상", pass: issued > 0 && paid / issued >= 0.5 },
    { key: "accuracy", label: "쿠폰 누락 · 대사 불일치", value: accuracy, kind: "count", goal: "0건", pass: accuracy === 0 },
  ];
  const ended = reps.filter((x) => x.campaign.state !== "open" && x.campaign.state !== "cancelled");
  const allLowPledge = ended.length >= 3 && ended.every((x) => (x.rates.inviteToPledge ?? 0) < 0.02);
  // 보완 (기획서 v2 7번): 성사율과 신청 전환은 됐는데 결제 전환이 50% 미만. 우리 쪽 오류(쿠폰 누락 등)가 없을 때만 고객 반응으로 본다
  const pass = (k: string) => rows.find((x) => x.key === k)!.pass;
  const payOnlyLow = pass("reach_rate") && pass("invite_to_pledge") && pass("accuracy") && !pass("pledge_to_paid");
  const verdict = rows.every((x) => x.pass) ? "go" : allLowPledge ? "rethink" : payOnlyLow ? "iterate" : "in_progress";
  return { rows, verdict, proceeded, cancelled };
}
