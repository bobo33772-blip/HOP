// 판매자가 모집 중인 공구를 취소한다 (#65). 가격 · 목표를 잘못 넣고 열면 마감까지 그 상품으로 새 공구를 열 수 없어서다(#47의 DB 규칙).
// 지우지 않고 '취소됨'으로 남긴다: 초대 문자가 이미 나갔고, 신청한 고객이 있고, 운영 기록도 남겨야 해서.
// 모집 중 · 마감 전에만 된다. 달성 뒤에는 고객 계정에 쿠폰이 들어갔고 결제한 고객도 있을 수 있어 앱에서 취소하지 않는다(운영자가 카페24에서 쿠폰 회수 · 환불).

import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { nextAllowedSendTime } from "../core/messaging";
import { audit, UserError, type Ctx } from "./context";
import { getMall, type Campaign } from "./campaigns";

const C = schema.campaigns, P = schema.pledges;

/** 취소 이유 최대 길이 (감사 기록에 남긴다) */
export const CANCEL_REASON_MAX = 300;

export async function cancelCampaign(ctx: Ctx, actor: string, campaignId: string, body: { reason?: unknown }) {
  const reason = String(body.reason ?? "").trim().slice(0, CANCEL_REASON_MAX);
  if (!reason) throw new UserError("reason_required", "취소 이유를 적어 주세요. 예: 공구가를 잘못 넣었어요");
  const now = ctx.clock.now();

  // 공구 줄을 잠그고 상태를 다시 본다. 판정 · 신청 · 신청 취소도 같은 줄을 잠그므로 서로 엇갈리지 않는다 (#46)
  const { c, pledgers } = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.select().from(C).where(eq(C.id, campaignId)).for("update");
    if (!row) throw new UserError("not_found", "공구를 찾을 수 없어요.", 404);
    if (row.state !== "open" || now >= row.deadlineAt) {
      throw new UserError("not_cancellable", "모집 중이고 마감 전인 공구만 취소할 수 있어요. 달성한 공구는 운영자에게 문의해 주세요.", 409);
    }
    // 신청은 '공구 취소로 끝남'으로 바꾼다 (진행률 · 확정 수량에서 빠진다). 고객이 직접 취소한 것(cancelled)과 구분한다
    const ps = await tx.update(P).set({ state: "campaign_cancelled", updatedAt: now })
      .where(and(eq(P.campaignId, row.id), eq(P.state, "pledged"))).returning({ memberId: P.memberId });
    // 끝난 시각은 judged_at에 둔다 → 보관 기간이 지나면 다른 끝난 공구처럼 회원 ID를 지운다
    const [done] = await tx.update(C).set({ state: "cancelled", judgedAt: now }).where(and(eq(C.id, row.id), eq(C.state, "open"))).returning();
    // 아직 안 나간 문자(초대 예약 등)는 보내지 않는다. 보내는 중인 문자는 멈출 수 없다
    await tx.delete(schema.messages).where(and(eq(schema.messages.campaignId, row.id), eq(schema.messages.status, "scheduled")));
    // 공구를 열 때 초대를 보내며 지운 알림 신청을 되살린다 → 다음 공구 때 다시 초대받는다
    const asked = await tx.select({ memberId: schema.invitations.memberId }).from(schema.invitations)
      .where(and(eq(schema.invitations.campaignId, row.id), eq(schema.invitations.source, "alert")));
    for (let i = 0; i < asked.length; i += 500) {
      await tx.insert(schema.productAlerts).values(asked.slice(i, i + 500).map((a) => ({ mallId: row.mallId, productNo: row.productNo, memberId: a.memberId, createdAt: now })))
        .onConflictDoNothing();
    }
    return { c: done, pledgers: ps.map((p) => p.memberId) };
  });

  await audit(ctx, actor, "campaign.cancelled", c.id, { reason, pledgers: pledgers.length }, c.mallId);
  const notified = await queueCancelled(ctx, c, pledgers);
  return { campaign: c, pledgers: pledgers.length, notified };
}

/** 취소 안내 문자: 신청했던 회원에게만 (정보성). 결과 문자처럼 개인정보 권한이 있는 몰에서는 수신 동의 고객에게만 보낸다 */
async function queueCancelled(ctx: Ctx, c: Campaign, pledgers: string[]): Promise<number> {
  if (!pledgers.length) return 0;
  const mall = await getMall(ctx, c.mallId);
  const api = await ctx.shop(c.mallId);
  const ok = api.privacy ? new Set((await api.consents(pledgers)).filter((x) => x.sms).map((x) => x.memberId)) : new Set(pledgers);
  const to = pledgers.filter((m) => ok.has(m));
  if (!to.length) return 0;
  const brand = mall.brandName || mall.mallId;
  const content = `[${brand}] 신청하신 ${c.productName} 공동구매가 판매자 사정으로 취소되었습니다. 결제된 금액은 없습니다. 신청해 주셔서 감사합니다.\n${ctx.productUrl(c.mallId, c.productNo)}`;
  await ctx.db.insert(schema.messages).values({ campaignId: c.id, kind: "cancel", recipients: to, content, sendAfter: nextAllowedSendTime(ctx.clock.now()) });
  return to.length;
}
