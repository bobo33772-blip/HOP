// 예약 문자 발송. 광고 문자는 21~08시에 보내지 않고, 판정 결과·결제 마감 전 알림 문자도 같은 시간대를 피한다.
// status: scheduled → sending(선점) → sent | scheduled(재시도) | failed

import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { schema } from "@/db";
import { isNightKst, nextAllowedSendTime } from "../core/messaging";
import { recordIssue, type Ctx } from "./context";

const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 10 * 60_000;
// 카페24 SMS 잔액 부족은 판매자가 충전하면 풀린다. 3번(30분)에 포기하지 않고 30분마다 24시간 동안 다시 보낸다 (판매자는 다시 보내기 버튼이 없다)
const LOW_BALANCE_ATTEMPTS = 48;
const LOW_BALANCE_RETRY_MS = 30 * 60_000;
export const isLowSmsBalance = (e: unknown) => /SMS quantity is not enough/i.test(String(e));

export async function releaseDueMessages(ctx: Ctx): Promise<number> {
  const now = ctx.clock.now();
  const due = await ctx.db
    .select({ m: schema.messages, c: { mallId: schema.campaigns.mallId, state: schema.campaigns.state, deadlineAt: schema.campaigns.deadlineAt } })
    .from(schema.messages)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.messages.campaignId))
    .where(and(eq(schema.messages.status, "scheduled"), lte(schema.messages.sendAfter, now)))
    .orderBy(asc(schema.messages.sendAfter));

  let sent = 0;
  for (const { m, c } of due) {
    const fail = async (error: string, kind: string) => {
      await ctx.db.update(schema.messages).set({ status: "failed", error }).where(eq(schema.messages.id, m.id));
      await recordIssue(ctx, m.campaignId, kind, { messageId: m.id, reason: error });
    };
    // 마감이 지난 공구의 초대(광고) 문자는 보내지 않는다. 참여할 수 없는 공구를 광고하게 되기 때문이다
    if (m.kind === "invite_ad" && (c.state !== "open" || now >= c.deadlineAt)) { await fail("마감 후라 보내지 않음", "invite_not_sent"); continue; }
    if (isNightKst(now)) {
      await ctx.db.update(schema.messages).set({ sendAfter: nextAllowedSendTime(now) }).where(eq(schema.messages.id, m.id));
      continue;
    }
    if (m.kind === "invite_ad" && !m.content.startsWith("(광고)")) { await fail("(광고) 표기 누락으로 발송 차단", "ad_label_missing"); continue; }
    // 결제 마감 전 알림은 보내는 시점에 아직 결제하지 않은 신청자(쿠폰 받은 상태)에게만. 아무도 없거나 이미 확정된 공구면 보내지 않고 닫는다
    let recipients = m.recipients;
    if (m.kind === "pay_reminder") {
      const unpaid = c.state === "reached"
        ? new Set((await ctx.db.select({ memberId: schema.pledges.memberId }).from(schema.pledges)
            .where(and(eq(schema.pledges.campaignId, m.campaignId), eq(schema.pledges.state, "coupon_issued")))).map((x) => x.memberId))
        : new Set<string>();
      recipients = m.recipients.filter((id) => unpaid.has(id));
      if (!recipients.length) {
        await ctx.db.update(schema.messages).set({ status: "sent", sentAt: now, recipients: [] })
          .where(and(eq(schema.messages.id, m.id), eq(schema.messages.status, "scheduled")));
        continue;
      }
    }

    // 보내기 전에 선점한다 → 서버가 여러 대이거나 작업이 겹쳐도 같은 문자를 두 번 보내지 않는다
    const claimed = await ctx.db.update(schema.messages).set({ status: "sending" })
      .where(and(eq(schema.messages.id, m.id), eq(schema.messages.status, "scheduled"))).returning({ id: schema.messages.id });
    if (!claimed.length) continue;
    const [mall] = await ctx.db.select({ sender: schema.malls.smsSender }).from(schema.malls).where(eq(schema.malls.mallId, c.mallId));
    try {
      if (!mall?.sender) throw new Error("판매자 문자 발신번호가 등록되지 않았어요.");
      const api = await ctx.shop(c.mallId);
      const refs: string[] = [];
      for (let i = 0; i < recipients.length; i += 100) {
        const r = await api.sendSms({ senderNo: mall.sender, memberIds: recipients.slice(i, i + 100), content: m.content, isAd: m.kind === "invite_ad" });
        refs.push(r.queueRef);
      }
      await ctx.db.update(schema.messages).set({ status: "sent", sentAt: now, recipients, queueRef: refs.join(","), attempts: m.attempts + 1, error: null }).where(eq(schema.messages.id, m.id));
      sent++;
    } catch (e) {
      const attempts = m.attempts + 1;
      const low = isLowSmsBalance(e);
      const final = attempts >= (low ? LOW_BALANCE_ATTEMPTS : MAX_ATTEMPTS);
      await ctx.db.update(schema.messages)
        .set({ status: final ? "failed" : "scheduled", attempts, error: String(e), sendAfter: new Date(now.getTime() + (low ? LOW_BALANCE_RETRY_MS : RETRY_AFTER_MS)) })
        .where(eq(schema.messages.id, m.id));
      if (final) await recordIssue(ctx, m.campaignId, "sms_failed", { messageId: m.id, error: String(e) });
      ctx.log("sms 발송 실패", { id: m.id, attempts, error: String(e) });
    }
  }
  return sent;
}

export async function retryMessage(ctx: Ctx, messageId: string) {
  // 발송 중 서버가 꺼져 'sending'에 멈춘 문자도 운영자가 다시 보낼 수 있다
  const r = await ctx.db.update(schema.messages).set({ status: "scheduled", attempts: 0, sendAfter: ctx.clock.now() })
    .where(and(eq(schema.messages.id, messageId), inArray(schema.messages.status, ["failed", "sending"]))).returning();
  return r.length > 0;
}
