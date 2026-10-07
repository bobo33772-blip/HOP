// 확정 리포트 (F10)와 4주 판정표. 리포트에는 회원 ID 등 개인정보를 넣지 않는다.

import { and, count, countDistinct, eq, inArray, isNotNull, ne, sql, sum } from "drizzle-orm";
import { schema } from "@/db";
import { successFee } from "../core/billing";
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
    },
    funnel: { invited, invitedSent, pledgers: n(pl.v), invitedPledgers: n(invPl.v), pledgedQty: pledged, couponIssued, paidMembers },
    confirmed: {
      qty: confirmedQty, revenue, unpaidMembers: Math.max(0, couponIssued - paidMembers),
      cancelledOrders: n(cancelled.v), lateOrders: n(late.v),
      successFee: successFee("starter", revenue), // 스타터 요금제 기준. 4주 파일럿은 무료라 표시만 한다
      expected: state === "reached" ? expectedConfirmed(pledged, confirmedQty) : null,
    },
    rates: {
      inviteToPledge: rate(n(invPl.v), invitedSent),
      pledgeToPaid: rate(paidMembers, couponIssued),
      reached: state === "open" ? null : state !== "failed",
    },
    openIssues: n(issues.v),
    final: state === "settled" || state === "failed",
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

/** 4주 성공 기준 판정표 (기획서 '4주 MVP · 목표'와 같은 기준). 결과를 보기 전에 정해 둔 기준으로만 판정한다 */
export async function pilotScorecard(ctx: Ctx) {
  const camps = await ctx.db.select({ id: schema.campaigns.id, mallId: schema.campaigns.mallId, state: schema.campaigns.state }).from(schema.campaigns);
  const malls = new Set(camps.map((c) => c.mallId)).size;
  const judged = camps.filter((c) => c.state !== "open");
  const reached = judged.filter((c) => c.state !== "failed").length;
  const reps = await Promise.all(camps.map((c) => buildReport(ctx, c.id)));
  const sum = (f: (r: Report) => number) => reps.reduce((a, r) => a + f(r), 0);
  const sent = sum((r) => r.funnel.invitedSent), invP = sum((r) => r.funnel.invitedPledgers);
  const issued = sum((r) => r.funnel.couponIssued), paid = sum((r) => r.funnel.paidMembers);
  const [acc] = await ctx.db.select({ v: count() }).from(schema.issues)
    .where(and(inArray(schema.issues.kind, ["coupon_missing", "reconcile_mismatch"]), eq(schema.issues.resolved, false)));
  const [decided] = await ctx.db.select({ v: sql<number>`count(distinct ${schema.campaigns.mallId})` }).from(schema.campaigns).where(isNotNull(schema.campaigns.decidedAt));
  const r = (a: number, b: number) => (b ? a / b : null);
  const accuracy = n(acc.v), oneThing = n(decided.v);
  const rows = [
    { key: "one_thing", label: "확정 수량으로 생산을 결정한 판매자", value: oneThing as number | string | null, kind: "count", goal: "1곳 이상", pass: oneThing >= 1 },
    { key: "scale", label: "파일럿 몰 · 연 공구", value: `${malls}몰 · ${camps.length}건`, kind: "text", goal: "3몰 · 3건 이상", pass: malls >= 3 && camps.length >= 3 },
    { key: "reach_rate", label: "공구 성사율", value: r(reached, judged.length), kind: "rate", goal: "60% 이상", pass: judged.length > 0 && reached / judged.length >= 0.6 },
    { key: "invite_to_pledge", label: "초대 → 신청", value: r(invP, sent), kind: "rate", goal: "5% 이상", pass: sent > 0 && invP / sent >= 0.05 },
    { key: "pledge_to_paid", label: "신청 → 결제", value: r(paid, issued), kind: "rate", goal: "50% 이상", pass: issued > 0 && paid / issued >= 0.5 },
    { key: "accuracy", label: "쿠폰 누락 · 대사 불일치", value: accuracy, kind: "count", goal: "0건", pass: accuracy === 0 },
  ];
  const allLowPledge = judged.length >= 3 && reps.filter((x) => x.campaign.state !== "open").every((x) => (x.rates.inviteToPledge ?? 0) < 0.02);
  const others = rows.filter((x) => x.key !== "pledge_to_paid").every((x) => x.pass);
  const verdict = rows.every((x) => x.pass) ? "go" : allLowPledge ? "rethink" : others ? "iterate" : "in_progress";
  return { rows, verdict };
}
