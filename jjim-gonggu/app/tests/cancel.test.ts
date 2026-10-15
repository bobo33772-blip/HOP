// 판매자가 모집 중인 공구를 취소 (#65): 상태 · 신청 · 같은 상품 새 공구 · 안내 문자 · 안 나간 초대 · 알림 신청 되살리기 · 판정표 · 위젯 공개 정보.

import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { HOUR } from "@/lib/time";
import { getCampaign, openCampaign, pledgedQty, publicView } from "@/lib/engine/campaigns";
import { cancelCampaign } from "@/lib/engine/cancel";
import { requestAlert, waitingCount } from "@/lib/engine/alerts";
import { buildReport, pilotScorecard } from "@/lib/engine/report";
import { tick } from "@/lib/engine/scheduler";
import { MALL, PRODUCT, baseInput, openAndFill, pledge, range, setup } from "./helpers";

const DAY = 24 * HOUR;
const why = { reason: "공구가를 잘못 넣었어요" };

describe("공구 취소 (#65)", () => {
  it("모집 중 공구를 취소하면 '취소됨'이 되고, 신청은 '공구 취소로 끝남', 같은 상품으로 바로 새 공구를 열 수 있다", async () => {
    const env = await setup();
    const c = await openAndFill(env, range(100, 104), 1);
    const r = await cancelCampaign(env.ctx, "seller:u1", c.id, why);
    expect(r).toMatchObject({ pledgers: 5, notified: 3 }); // 개인정보 권한이 있는 몰: 수신 동의(짝수) m100 · m102 · m104에게만
    const done = await getCampaign(env.ctx, c.id);
    expect(done.state).toBe("cancelled");
    expect(done.judgedAt).toEqual(env.clock.now());
    const ps = await env.db.select({ s: schema.pledges.state }).from(schema.pledges).where(eq(schema.pledges.campaignId, c.id));
    expect(new Set(ps.map((p) => p.s))).toEqual(new Set(["campaign_cancelled"]));
    expect(await pledgedQty(env.ctx, c.id)).toBe(0);
    expect((await publicView(env.ctx, done)).state).toBe("cancelled");
    const [log] = await env.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "campaign.cancelled"), eq(schema.auditLogs.target, c.id)));
    expect(log).toMatchObject({ actor: "seller:u1", detail: { reason: why.reason, pledgers: 5 } });
    // 상품 하나에 진행 중 공구는 하나(#47)지만, 취소한 공구는 막지 않는다
    expect((await openCampaign(env.ctx, "op", MALL, baseInput(env.clock))).campaign.state).toBe("open");
  });

  it("이유가 없거나, 마감이 지났거나, 판정이 끝난 공구는 취소되지 않는다", async () => {
    const env = await setup();
    const c = await openAndFill(env, range(100, 139), 1);
    await expect(cancelCampaign(env.ctx, "op", c.id, { reason: "  " })).rejects.toThrow(/이유/);
    env.clock.advance(5 * DAY); // 마감 시각이 지났다 (정기 작업이 판정하기 전)
    await expect(cancelCampaign(env.ctx, "op", c.id, why)).rejects.toThrow(/마감 전인 공구만/);
    await tick(env.ctx); // 달성 → 쿠폰
    expect((await getCampaign(env.ctx, c.id)).state).toBe("reached");
    await expect(cancelCampaign(env.ctx, "op", c.id, why)).rejects.toThrow(/달성한 공구는 운영자에게/);
  });

  it("신청한 회원에게만 취소 안내 문자가 가고, 아직 안 나간 초대 문자는 나가지 않는다", async () => {
    const env = await setup();
    env.clock.advance(12 * HOUR); // 22:00 KST: 초대(광고) 문자는 다음 날 08:00로 예약된다
    const c = await openAndFill(env, ["m100", "m101"], 1);
    await tick(env.ctx);
    expect(env.world.smsLog).toHaveLength(0);
    expect((await cancelCampaign(env.ctx, "op", c.id, why)).notified).toBe(1); // m101은 수신 동의가 없다
    const left = await env.db.select({ kind: schema.messages.kind }).from(schema.messages).where(eq(schema.messages.campaignId, c.id));
    expect(left.map((m) => m.kind)).toEqual(["cancel"]);
    env.clock.advance(10 * HOUR); // 08:00 지나서
    await tick(env.ctx);
    expect(env.world.smsLog).toHaveLength(1);
    expect(env.world.smsLog[0]).toMatchObject({ memberIds: ["m100"], isAd: false });
    expect(env.world.smsLog[0].content).toMatch(/판매자 사정으로 취소됐어요\. 결제된 금액은 없어요/);
  });

  it("알림 신청으로 초대받았던 회원의 알림 신청을 되살린다 (다음 공구 때 다시 초대)", async () => {
    const env = await setup();
    env.world.privacy = false;
    for (const m of ["m1", "m2"]) await requestAlert(env.ctx, MALL, PRODUCT, { member_token: env.world.encryptMember(MALL, m) });
    const { campaign } = await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    expect(await waitingCount(env.ctx, MALL, PRODUCT)).toBe(0); // 초대를 보내며 지웠다
    await cancelCampaign(env.ctx, "op", campaign.id, why);
    expect(await waitingCount(env.ctx, MALL, PRODUCT)).toBe(2);
  });

  it("판정표: 취소는 공구 성사율 분모에 미달처럼 들어가고 '취소 N건'으로 따로 센다. 연 공구 수에서는 빠진다", async () => {
    const env = await setup();
    env.world.addCart(MALL, 103, "m100");
    const reached = await openAndFill(env, range(100, 139), 1);
    const { campaign: wrong } = await openCampaign(env.ctx, "op", MALL, { ...baseInput(env.clock), productNo: 103 });
    await cancelCampaign(env.ctx, "op", wrong.id, why);
    env.clock.advance(5 * DAY);
    await tick(env.ctx);
    expect((await getCampaign(env.ctx, reached.id)).state).toBe("reached");
    const sc = await pilotScorecard(env.ctx);
    expect(sc.cancelled).toBe(1);
    expect(sc.rows.find((r) => r.key === "reach_rate")!.value).toBe(0.5);
    expect(sc.rows.find((r) => r.key === "scale")!.value).toBe("1몰 · 1건");
    const rep = await buildReport(env.ctx, wrong.id);
    expect(rep.rates.reached).toBe(false);
    expect(rep.final).toBe(true);
  });

  it("취소한 뒤에는 신청 · 신청 취소를 받지 않는다", async () => {
    const env = await setup();
    const c = await openAndFill(env, ["m100"], 1);
    await cancelCampaign(env.ctx, "op", c.id, why);
    await expect(pledge(env, c.id, "m102")).rejects.toThrow(/마감/);
  });
});
