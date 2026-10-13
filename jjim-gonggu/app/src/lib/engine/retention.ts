// 보관 기간이 지난 개인정보 파기. 개인정보 처리방침(/privacy)의 '보유 기간'과 같은 숫자를 쓴다 — 바꾸면 방침도 같이 고친다.
// 매일 03:00 대사 뒤에 돈다. 여러 번 돌아도 결과가 같다.

import { and, eq, inArray, isNotNull, like, lt, notLike, or } from "drizzle-orm";
import { schema } from "@/db";
import { DAY } from "../time";
import type { Ctx } from "./context";

export const RETENTION = {
  /** 공구가 끝난(실패 판정 또는 결제 기간 종료) 뒤 고객 회원 ID를 지우기까지 */
  campaignDays: 180,
  /** 공구가 열리지 않은 '공구 알림' 신청을 지우기까지 (열리면 초대와 함께 바로 지운다) */
  alertDays: 180,
  /** 앱 삭제 뒤 그 몰의 모든 데이터를 지우기까지 */
  uninstalledDays: 30,
  /** 받은 웹훅 원문 */
  webhookDays: 90,
  /** 감사 기록 */
  auditDays: 365,
} as const;

export async function purgeExpired(ctx: Ctx) {
  const now = ctx.clock.now().getTime();
  const before = (days: number) => new Date(now - days * DAY);
  const C = schema.campaigns;
  let anonymized = 0, mallsDeleted = 0;

  // 1) 끝난 지 오래된 공구: 초대 대상·문자 수신자 목록을 지우고, 신청·주문의 회원 ID를 익명 값으로 바꾼다 (수량·금액 통계만 남긴다)
  const old = await ctx.db.select({ id: C.id }).from(C).where(or(
    and(eq(C.state, "failed"), lt(C.judgedAt, before(RETENTION.campaignDays))),
    and(eq(C.state, "settled"), lt(C.settledAt, before(RETENTION.campaignDays))),
  ));
  if (old.length) {
    const ids = old.map((r) => r.id);
    await ctx.db.delete(schema.invitations).where(inArray(schema.invitations.campaignId, ids));
    await ctx.db.update(schema.messages).set({ recipients: [] }).where(inArray(schema.messages.campaignId, ids));
    const P = schema.pledges, O = schema.orderLinks;
    const pl = await ctx.db.select({ id: P.id }).from(P).where(and(inArray(P.campaignId, ids), notLike(P.memberId, "anon:%")));
    for (const p of pl) await ctx.db.update(P).set({ memberId: `anon:${p.id}` }).where(eq(P.id, p.id));
    await ctx.db.update(O).set({ memberId: "anon" }).where(and(inArray(O.campaignId, ids), notLike(O.memberId, "anon%")));
    anonymized = pl.length;
  }

  // 2) 앱을 지운 지 오래된 몰: 그 몰의 데이터를 모두 지운다
  const gone = await ctx.db.select({ mallId: schema.malls.mallId }).from(schema.malls)
    .where(and(isNotNull(schema.malls.uninstalledAt), lt(schema.malls.uninstalledAt, before(RETENTION.uninstalledDays))));
  for (const { mallId } of gone) {
    const cs = (await ctx.db.select({ id: C.id }).from(C).where(eq(C.mallId, mallId))).map((r) => r.id);
    if (cs.length) {
      await ctx.db.delete(schema.orderLinks).where(inArray(schema.orderLinks.campaignId, cs));
      await ctx.db.delete(schema.pledges).where(inArray(schema.pledges.campaignId, cs));
      await ctx.db.delete(schema.invitations).where(inArray(schema.invitations.campaignId, cs));
      await ctx.db.delete(schema.messages).where(inArray(schema.messages.campaignId, cs));
      await ctx.db.delete(schema.issues).where(inArray(schema.issues.campaignId, cs));
      await ctx.db.delete(C).where(eq(C.mallId, mallId));
    }
    await ctx.db.delete(schema.productAlerts).where(eq(schema.productAlerts.mallId, mallId));
    await ctx.db.delete(schema.demandSnapshots).where(eq(schema.demandSnapshots.mallId, mallId));
    await ctx.db.delete(schema.collectionRuns).where(eq(schema.collectionRuns.mallId, mallId));
    await ctx.db.delete(schema.oauthStates).where(eq(schema.oauthStates.mallId, mallId));
    await ctx.db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.mallId, mallId));
    await ctx.db.delete(schema.auditLogs).where(eq(schema.auditLogs.mallId, mallId));
    await ctx.db.delete(schema.malls).where(eq(schema.malls.mallId, mallId));
    mallsDeleted++;
  }

  // 3) 오래 기다려도 공구가 열리지 않은 알림 신청
  await ctx.db.delete(schema.productAlerts).where(lt(schema.productAlerts.createdAt, before(RETENTION.alertDays)));

  // 4) 오래된 웹훅 원문·감사 기록
  await ctx.db.delete(schema.webhookEvents).where(lt(schema.webhookEvents.receivedAt, before(RETENTION.webhookDays)));
  await ctx.db.delete(schema.auditLogs).where(lt(schema.auditLogs.at, before(RETENTION.auditDays)));
  // 고객 회원 ID가 actor에 남는 감사 기록은 공구 보관 기간에 맞춘다
  await ctx.db.delete(schema.auditLogs).where(and(like(schema.auditLogs.actor, "customer:%"), lt(schema.auditLogs.at, before(RETENTION.campaignDays))));

  return { anonymized, mallsDeleted };
}
