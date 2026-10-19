// 회원 탈퇴 (#29). 카페24 회원 탈퇴 웹훅(90147)을 받으면 본문을 믿지 않고 회원 조회로 정말 없는 회원인지 확인한 뒤,
// 그 몰의 기록에서 회원 ID를 바로 지운다. 확정 수량 · 매출 · 초대→신청 같은 숫자는 그대로 남도록 회원 ID를 익명 값으로 바꾼다.
// 확인이 카페24 오류로 실패하면 웹훅을 '처리 안 됨'으로 남기고, 매일 03:00 파기(retention.ts)가 다시 시도한다.
// 탈퇴 웹훅은 개인정보 권한(mall.read_privacy)이 있어야 개발자센터에서 고를 수 있어, 권한이 없는 지금은 오지 않는다.
// 그래서 매일 파기 때 우리가 가진 회원 ID를 회원 조회로 직접 확인한다(sweepWithdrawn).

import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, like, notLike, sql } from "drizzle-orm";
import { schema } from "@/db";
import { DAY } from "../time";
import type { Ctx } from "./context";

/** [회원] 쇼핑몰 회원이 탈퇴한 경우. VERIFY(#29): 본문 resource의 회원 ID 필드 이름(member_id)을 테스트몰에서 확인 */
export const MEMBER_WITHDRAWN = 90147;

/** verified: 방금 회원 조회로 없는 회원임을 확인했으면 다시 조회하지 않는다 (sweepWithdrawn) */
export async function forgetMember(ctx: Ctx, mallId: string, memberId: string, opts: { verified?: boolean } = {}): Promise<{ forgotten: boolean }> {
  if (!mallId || !memberId) return { forgotten: false };
  const [mall] = await ctx.db.select({ uninstalledAt: schema.malls.uninstalledAt }).from(schema.malls).where(eq(schema.malls.mallId, mallId));
  if (!mall || mall.uninstalledAt) return { forgotten: false }; // 모르는 몰 · 앱을 지운 몰(30일 뒤 몰 전체를 지운다)
  // 아직 회원이면(위조 · 잘못 온 웹훅) 아무것도 지우지 않는다
  if (!opts.verified && (await (await ctx.shop(mallId)).memberExists(memberId))) return { forgotten: false };

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

/** 회원 ID를 묶음 번호로 (같은 ID는 늘 같은 번호) */
const bucketOf = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** 하루에 회원 조회로 확인할 회원 수(몰마다)와 시간 상한. 카페24 호출 한도(10분 3,000회)와 정기 작업 시간을 넘지 않게 */
export const SWEEP_MAX = 300;
export const SWEEP_BUDGET_MS = 20_000;
/** 안전장치: 한 번에 탈퇴로 보이는 회원이 이만큼(명 이상이면서 확인한 회원의 비율 초과)이면 회원 조회 응답이 이상한 것으로 보고 지우지 않는다 */
export const SWEEP_SUSPECT = { min: 5, ratio: 0.2 } as const;

/**
 * 탈퇴 웹훅 없이도 탈퇴 회원을 지운다. 매일 파기 때, 앱을 쓰는 몰마다 우리가 가진 회원 ID(공구 알림 신청 · 아직 익명화하지 않은 신청 · 초대)를
 * 회원 조회로 확인하고, 없는 회원이면 forgetMember로 지운다(아직 회원이면 forgetMember가 아무것도 하지 않는다).
 * 회원이 SWEEP_MAX보다 많으면 묶음으로 나눠 날마다 다음 묶음을 확인해 돌아가며 모두 본다. 시간 상한을 넘으면 멈추고 다음 날 이어서 한다.
 * 회원 조회가 3번 연달아 실패하면(카페24 장애) 그 몰은 그날 건너뛴다.
 * 안전장치: 먼저 조회만 하고, 탈퇴로 보이는 회원이 SWEEP_SUSPECT를 넘으면 그 몰은 지우지 않고 기록만 남긴다
 * (응답 형식이 바뀌어 멀쩡한 회원이 '없음'으로 읽히면 모든 기록을 익명화하는 사고를 막는다).
 */
export async function sweepWithdrawn(ctx: Ctx, opts: { max?: number; budgetMs?: number } = {}): Promise<{ checked: number; forgotten: number; suspended: string[] }> {
  const max = opts.max ?? SWEEP_MAX;
  const deadline = Date.now() + (opts.budgetMs ?? SWEEP_BUDGET_MS);
  const day = Math.floor(ctx.clock.now().getTime() / DAY);
  const C = schema.campaigns, P = schema.pledges, I = schema.invitations, A = schema.productAlerts;
  const malls = await ctx.db.select({ mallId: schema.malls.mallId }).from(schema.malls).where(isNull(schema.malls.uninstalledAt));
  let checked = 0, forgotten = 0, outOfTime = false;
  const suspended: string[] = [];
  for (const { mallId } of malls) {
    if (outOfTime) break;
    const camps = (await ctx.db.select({ id: C.id }).from(C).where(eq(C.mallId, mallId))).map((r) => r.id);
    const rows = [
      ...(await ctx.db.selectDistinct({ m: A.memberId }).from(A).where(eq(A.mallId, mallId))),
      ...(camps.length ? await ctx.db.selectDistinct({ m: P.memberId }).from(P).where(and(inArray(P.campaignId, camps), notLike(P.memberId, "anon%"))) : []),
      ...(camps.length ? await ctx.db.selectDistinct({ m: I.memberId }).from(I).where(and(inArray(I.campaignId, camps), notLike(I.memberId, "anon%"))) : []),
    ];
    const ids = [...new Set(rows.map((r) => r.m))].sort();
    if (!ids.length) continue;
    // 회원이 많으면 k개 묶음으로 나눠 하루에 한 묶음씩 본다. 묶음은 회원 ID의 해시로 정해서, 중간에 누가 지워져도 다른 회원의 차례가 밀리지 않는다
    const k = Math.max(1, Math.ceil(ids.length / max));
    const batch = k === 1 ? ids : ids.filter((id) => bucketOf(id) % k === day % k);
    const api = await ctx.shop(mallId);
    const gone: string[] = [];
    let fails = 0, seen = 0;
    for (const memberId of batch) {
      if (Date.now() >= deadline) { outOfTime = true; break; }
      try {
        seen++;
        if (!(await api.memberExists(memberId))) gone.push(memberId);
        fails = 0;
      } catch (e) {
        ctx.log("탈퇴 회원 확인 실패 (다음 파기 때 다시)", { mallId, error: String(e) });
        if (++fails >= 3) break;
      }
    }
    checked += seen;
    if (gone.length >= SWEEP_SUSPECT.min && gone.length > seen * SWEEP_SUSPECT.ratio) {
      suspended.push(mallId);
      ctx.log("탈퇴로 보이는 회원이 너무 많아 지우지 않음 (회원 조회 응답 확인 필요)", { mallId, checked: seen, gone: gone.length });
      continue;
    }
    for (const memberId of gone) if ((await forgetMember(ctx, mallId, memberId, { verified: true })).forgotten) forgotten++;
  }
  return { checked, forgotten, suspended };
}
