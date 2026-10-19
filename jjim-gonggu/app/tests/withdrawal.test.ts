// 회원 탈퇴 웹훅(90147) → 회원 조회로 확인 → 그 몰 기록에서 회원 ID 즉시 파기 (#29). 숫자(확정 수량 · 리포트)는 그대로 남는다.

import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { HOUR } from "@/lib/time";
import { getCampaign } from "@/lib/engine/campaigns";
import { tick } from "@/lib/engine/scheduler";
import { buildReport } from "@/lib/engine/report";
import { requestAlert } from "@/lib/engine/alerts";
import { purgeExpired } from "@/lib/engine/retention";
import { MEMBER_WITHDRAWN, forgetMember, sweepWithdrawn } from "@/lib/engine/withdrawal";
import { MALL, PRODUCT, openAndFill, range, setup, type Env } from "./helpers";

/** m1~m40 신청 → 달성 → m2가 쿠폰으로 결제, m2는 다른 상품(103)에 공구 알림도 신청 */
async function reachedWithM2() {
  const env = await setup();
  const c = await openAndFill(env, range(1, 40), 1);
  env.clock.advance(5 * 24 * HOUR);
  await tick(env.ctx);
  await env.world.placeOrder(MALL, "m2", PRODUCT, 1, (await getCampaign(env.ctx, c.id)).couponNo!);
  env.world.setSoldOut(MALL, 103, true); // 알림은 품절 상품만 (#67)
  await requestAlert(env.ctx, MALL, 103, { member_token: env.world.encryptMember(MALL, "m2") });
  return { env, c };
}

/** 회원 ID가 남아 있는 곳의 수 */
async function traces(env: Env, memberId: string) {
  const db = env.db;
  const n = async (q: Promise<unknown[]>) => (await q).length;
  return {
    pledges: await n(db.select().from(schema.pledges).where(eq(schema.pledges.memberId, memberId))),
    invitations: await n(db.select().from(schema.invitations).where(eq(schema.invitations.memberId, memberId))),
    orders: await n(db.select().from(schema.orderLinks).where(eq(schema.orderLinks.memberId, memberId))),
    alerts: await n(db.select().from(schema.productAlerts).where(and(eq(schema.productAlerts.mallId, MALL), eq(schema.productAlerts.memberId, memberId)))),
    messages: await n(db.select().from(schema.messages).where(sql`jsonb_exists(${schema.messages.recipients}, ${memberId})`)),
    audit: await n(db.select().from(schema.auditLogs).where(eq(schema.auditLogs.actor, `customer:${memberId}`))),
  };
}
const none = { pledges: 0, invitations: 0, orders: 0, alerts: 0, messages: 0, audit: 0 };

describe("회원 탈퇴 (#29)", () => {
  it("탈퇴가 확인되면 신청 · 초대 · 주문 · 알림 · 문자 수신자 · 감사 기록에서 회원 ID가 사라지고, 확정 수량 · 리포트 숫자는 그대로다", async () => {
    const { env, c } = await reachedWithM2();
    expect(await traces(env, "m2")).not.toEqual(none);
    const before = await buildReport(env.ctx, c.id);

    env.world.withdrawMember(MALL, "m2");
    expect(await forgetMember(env.ctx, MALL, "m2")).toEqual({ forgotten: true });

    expect(await traces(env, "m2")).toEqual(none);
    expect(await traces(env, "m20")).not.toEqual(none); // 비슷한 ID(m20)는 건드리지 않는다
    const after = await buildReport(env.ctx, c.id);
    expect(after.confirmed).toEqual(before.confirmed);
    expect(after.funnel).toEqual(before.funnel);
  });

  it("아직 회원이면(위조 · 잘못 온 웹훅) 아무것도 지우지 않는다", async () => {
    const { env } = await reachedWithM2();
    const before = await traces(env, "m2");
    expect(await forgetMember(env.ctx, MALL, "m2")).toEqual({ forgotten: false });
    expect(await traces(env, "m2")).toEqual(before);
  });

  it("카페24 회원 조회가 실패해 처리 못 한 탈퇴 웹훅은 매일 파기 때 다시 처리한다", async () => {
    const { env } = await reachedWithM2();
    env.world.withdrawMember(MALL, "m2");
    env.world.failNextMemberLookup = true;
    await expect(forgetMember(env.ctx, MALL, "m2")).rejects.toThrow(/회원 조회 실패/);
    // 웹훅 라우트처럼 받은 원문을 '처리 안 됨'으로 저장해 둔 상태
    await env.db.insert(schema.webhookEvents).values({ traceId: "t-90147", eventNo: MEMBER_WITHDRAWN, mallId: MALL, payload: { event_no: MEMBER_WITHDRAWN, resource: { mall_id: MALL, member_id: "m2" } }, error: "회원 조회 실패" });
    expect((await purgeExpired(env.ctx)).withdrawals).toBe(1);
    expect(await traces(env, "m2")).toEqual(none);
    const [ev] = await env.db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.traceId, "t-90147"));
    expect(ev.processedAt).not.toBeNull();
    expect(JSON.stringify(ev.payload)).not.toContain('"m2"'); // 웹훅 원문의 회원 ID도 지운다
    expect((await purgeExpired(env.ctx)).withdrawals).toBe(0); // 한 번만
  });

  it("탈퇴 웹훅이 오지 않아도(개인정보 권한 없음) 매일 파기 때 회원 조회로 확인해 지운다", async () => {
    const { env, c } = await reachedWithM2();
    const before = await buildReport(env.ctx, c.id);
    env.world.withdrawMember(MALL, "m2"); // 웹훅 없이 탈퇴만
    expect((await purgeExpired(env.ctx)).withdrawals).toBe(1);
    expect(await traces(env, "m2")).toEqual(none);
    expect(await traces(env, "m3")).not.toEqual(none); // 아직 회원은 그대로
    expect((await buildReport(env.ctx, c.id)).confirmed).toEqual(before.confirmed);
    expect((await purgeExpired(env.ctx)).withdrawals).toBe(0); // 한 번만
  });

  it("회원이 많으면 하루 상한만큼 확인하고, 날마다 다음 묶음으로 돌아가며 모두 본다", async () => {
    const { env } = await reachedWithM2();
    env.world.withdrawMember(MALL, "m2");
    env.world.withdrawMember(MALL, "m39");
    let found = 0;
    // 확인 대상: 알림 신청 · 신청 · 초대(장바구니) 회원. 하루 10명씩이면 한 바퀴에 (대상 수 / 10)일
    const people = new Set([...(await env.db.select({ m: schema.pledges.memberId }).from(schema.pledges)), ...(await env.db.select({ m: schema.invitations.memberId }).from(schema.invitations))].map((r) => r.m)).size;
    for (let d = 0; d <= 2 * Math.ceil(people / 10) && found < 2; d++) {
      found += (await sweepWithdrawn(env.ctx, { max: 10 })).forgotten;
      env.clock.advance(24 * HOUR);
    }
    expect(found).toBe(2);
    expect(await traces(env, "m39")).toEqual(none);
  });

  it("탈퇴로 보이는 회원이 지나치게 많으면(회원 조회 응답 이상) 지우지 않고 멈춘다", async () => {
    const { env } = await reachedWithM2();
    for (const m of range(1, 40)) env.world.withdrawMember(MALL, m); // 신청자 전원이 '없음'으로 읽히는 상황
    const r = await sweepWithdrawn(env.ctx);
    expect(r).toMatchObject({ forgotten: 0, suspended: [MALL] });
    expect(await traces(env, "m2")).not.toEqual(none); // 아무것도 지우지 않았다
  });
});
