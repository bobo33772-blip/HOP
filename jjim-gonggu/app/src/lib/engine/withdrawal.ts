// 회원 탈퇴 (#29). 카페24 회원 탈퇴 웹훅(90147)을 받으면 본문을 믿지 않고 회원 조회로 정말 없는 회원인지 확인한 뒤,
// 그 몰의 기록에서 회원 ID를 바로 지운다. 확정 수량 · 매출 · 초대→신청 같은 숫자는 그대로 남도록 회원 ID를 익명 값으로 바꾼다.
// 확인이 카페24 오류로 실패하면 웹훅을 '처리 안 됨'으로 남기고, 매일 03:00 파기(retention.ts)가 다시 시도한다.

import { randomBytes } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { Ctx } from "./context";

/** [회원] 쇼핑몰 회원이 탈퇴한 경우. VERIFY(#29): 본문 resource의 회원 ID 필드 이름(member_id)을 테스트몰에서 확인 */
export const MEMBER_WITHDRAWN = 90147;

export async function forgetMember(ctx: Ctx, mallId: string, memberId: string): Promise<{ forgotten: boolean }> {
  if (!mallId || !memberId) return { forgotten: false };
  const [mall] = await ctx.db.select({ uninstalledAt: schema.malls.uninstalledAt }).from(schema.malls).where(eq(schema.malls.mallId, mallId));
  if (!mall || mall.uninstalledAt) return { forgotten: false }; // 모르는 몰 · 앱을 지운 몰(30일 뒤 몰 전체를 지운다)
  // 아직 회원이면(위조 · 잘못 온 웹훅) 아무것도 지우지 않는다
  if (await (await ctx.shop(mallId)).memberExists(memberId)) return { forgotten: false };

  const anon = `anon:w-${randomBytes(6).toString("hex")}`;
  const quoted = JSON.stringify(memberId); // JSON 안의 "m2"만 바꾼다 ("m20"은 안 건드림)
  const C = schema.campaigns, P = schema.pledges, I = schema.invitations, O = schema.orderLinks, M = schema.messages, S = schema.issues;
  const camps = (await ctx.db.select({ id: C.id }).from(C).where(eq(C.mallId, mallId))).map((r) => r.id);
  if (camps.length) {
    // 신청 · 초대 · 주문은 같은 익명 값으로 바꿔 초대→신청 대조와 결제 회원 수가 그대로 남게 한다
    await ctx.db.update(P).set({ memberId: anon }).where(and(inArray(P.campaignId, camps), eq(P.memberId, memberId)));
    await ctx.db.update(I).set({ memberId: anon }).where(and(inArray(I.campaignId, camps), eq(I.memberId, memberId)));
    await ctx.db.update(O).set({ memberId: anon }).where(and(inArray(O.campaignId, camps), eq(O.memberId, memberId)));
    // 문자 수신자 목록에서는 뺀다 (예약된 문자가 탈퇴 회원에게 가지 않게)
    await ctx.db.update(M).set({ recipients: sql`${M.recipients} - ${memberId}::text` })
      .where(and(inArray(M.campaignId, camps), sql`jsonb_exists(${M.recipients}, ${memberId})`));
    // 확인할 일(쿠폰 누락 회원 목록 등)에 남은 회원 ID
    await ctx.db.update(S).set({ detail: sql`replace(${S.detail}::text, ${quoted}, ${JSON.stringify(anon)})::jsonb` })
      .where(and(inArray(S.campaignId, camps), like(sql`${S.detail}::text`, `%${quoted}%`)));
  }
  await ctx.db.delete(schema.productAlerts).where(and(eq(schema.productAlerts.mallId, mallId), eq(schema.productAlerts.memberId, memberId)));
  await ctx.db.update(schema.auditLogs).set({ actor: "customer:withdrawn" }).where(and(eq(schema.auditLogs.mallId, mallId), eq(schema.auditLogs.actor, `customer:${memberId}`)));
  // 받은 웹훅 원문(이 탈퇴 웹훅 자신 포함)에 남은 회원 ID
  const W = schema.webhookEvents;
  await ctx.db.update(W).set({ payload: sql`replace(${W.payload}::text, ${quoted}, ${JSON.stringify(anon)})::jsonb` })
    .where(and(eq(W.mallId, mallId), like(sql`${W.payload}::text`, `%${quoted}%`)));
  await ctx.db.insert(schema.auditLogs).values({ at: ctx.clock.now(), actor: "cafe24", action: "member.withdrawn", target: anon, detail: null, mallId });
  return { forgotten: true };
}
