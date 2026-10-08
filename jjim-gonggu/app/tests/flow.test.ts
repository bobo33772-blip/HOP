// 공구 한 번을 처음부터 끝까지: 초대 → 결제 없는 신청 → 마감 판정·쿠폰 → 결제 집계 → 확정 리포트 → 생산 결정.

import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@/db";
import { HOUR } from "@/lib/time";
import { getCampaign, openCampaign, previewCampaign, recordProductionDecision } from "@/lib/engine/campaigns";
import { cancelPledge, createPledge, myPledge } from "@/lib/engine/pledges";
import { judgeNow } from "@/lib/engine/judge";
import { handleOrderWebhook, reconcileCampaign } from "@/lib/engine/payments";
import { buildReport, pilotScorecard } from "@/lib/engine/report";
import { tick } from "@/lib/engine/scheduler";
import { purgeExpired } from "@/lib/engine/retention";
import { MALL, PRODUCT, baseInput, openAndFill, pledge, range, setup } from "./helpers";

const DAY5 = 5 * 24 * HOUR;

describe("개설", () => {
  it("정가 이상·원가 미만(확인 없이)·24시간 안 마감·마감 전 출고일은 막는다", async () => {
    const env = await setup();
    const now = env.clock.now();
    expect((await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), dealPrice: 52000 })).errors.join()).toMatch(/정가/);
    expect((await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), dealPrice: 25000 })).errors.join()).toMatch(/원가/);
    const ok = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), dealPrice: 25000, confirmBelowCost: true });
    expect(ok.errors).toEqual([]);
    expect(ok.warnings.join()).toMatch(/원가/);
    expect((await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), deadlineAt: new Date(now.getTime() + 2 * HOUR) })).errors.join()).toMatch(/24시간/);
    expect((await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), shipEta: "2026-10-13" })).errors.join()).toMatch(/출고일/);
  });

  it("마감은 초대 문자가 나갈 수 있는 시각부터 24시간 이상 남아야 한다", async () => {
    const env = await setup();
    env.clock.set(new Date("2026-10-12T13:00:00Z")); // 22:00 KST → 초대는 다음 날 08:00
    const pv = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), deadlineAt: new Date("2026-10-13T13:30:00Z") });
    expect(pv.errors.join()).toMatch(/최소 24시간/);
  });

  it("발신번호·수신거부 번호가 없으면 열 수 없고, 같은 상품에 진행 중 공구가 있으면 막는다", async () => {
    const env = await setup();
    await env.db.update(schema.malls).set({ smsSender: null }).where(eq(schema.malls.mallId, MALL));
    await expect(openCampaign(env.ctx, "op", MALL, baseInput(env.clock))).rejects.toThrow(/발신번호/);
    await env.db.update(schema.malls).set({ smsSender: "02-000-0000" }).where(eq(schema.malls.mallId, MALL));
    await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    await expect(openCampaign(env.ctx, "op", MALL, baseInput(env.clock))).rejects.toThrow(/이미 진행 중/);
  });
});

describe("초대 문자", () => {
  it("찜 ∪ 장바구니에서 중복을 빼고 수신 동의자에게만, (광고)·수신거부 문구를 붙여 보낸다", async () => {
    const env = await setup();
    const pv = await previewCampaign(env.ctx, MALL, baseInput(env.clock));
    expect(pv.audience).toEqual({ wishlist: 100, cart: 40, unique: 139, reachable: 69, consentChecked: true }); // 찜 목록은 실제 API처럼 100명에서 끊긴다 (P8)
    const { campaign, invited } = await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    expect(invited).toBe(69);
    expect(campaign.couponNo).toBeTruthy();
    await tick(env.ctx);
    expect(env.world.smsLog).toHaveLength(1);
    const sms = env.world.smsLog[0];
    expect(sms.content.startsWith("(광고)[LINEN & CO.]")).toBe(true);
    expect(sms.content).toMatch(/무료수신거부 080-000-0000/);
    expect(sms.memberIds).toHaveLength(69);
    expect(sms.memberIds.every((id) => Number(id.slice(1)) % 2 === 0)).toBe(true);
  });

  it("밤 10시에 연 공구의 초대 문자는 다음 날 08:00에 나간다", async () => {
    const env = await setup();
    env.clock.set(new Date("2026-10-12T13:00:00Z")); // 22:00 KST
    await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    await tick(env.ctx);
    expect(env.world.smsLog).toHaveLength(0);
    env.clock.set(new Date("2026-10-12T23:00:30Z")); // 08:00 KST
    await tick(env.ctx);
    expect(env.world.smsLog).toHaveLength(1);
  });

  it("초대 문자가 마감 전에 못 나갔다면 마감 후에는 보내지 않고 이슈로 남긴다", async () => {
    const env = await setup();
    const { campaign } = await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    env.world.failNextSms = true; // 첫 시도 실패 → 10분 뒤 재시도 예약
    await tick(env.ctx);
    env.clock.advance(DAY5); // 재시도 전에 마감이 지남
    await tick(env.ctx);
    expect(env.world.smsLog.filter((s) => s.isAd)).toHaveLength(0);
    const [m] = await env.db.select().from(schema.messages).where(and(eq(schema.messages.campaignId, campaign.id), eq(schema.messages.kind, "invite_ad")));
    expect(m.status).toBe("failed");
    expect(m.error).toMatch(/마감 후/);
  });
});

describe("신청", () => {
  it("위조 회원 거부, 1인 한도, 같은 요청 재전송은 한 번만, 마감 전 취소 가능", async () => {
    const env = await setup();
    const { ctx, world } = env;
    const { campaign } = await openCampaign(ctx, "op", MALL, baseInput(env.clock));
    await expect(createPledge(ctx, campaign.id, { member_token: "forged.token-value", qty: 1 }, "k1")).rejects.toThrow(/본인 확인/);
    await expect(createPledge(ctx, campaign.id, { member_token: world.encryptMember("othermall", "m2"), qty: 1 }, "k1")).rejects.toThrow(/본인 확인/);
    await expect(pledge(env, campaign.id, "m2", 3)).rejects.toThrow(/최대 2개/);
    const a = await pledge(env, campaign.id, "m2", 2, "same");
    const b = await pledge(env, campaign.id, "m2", 2, "same");
    expect(a.replay).toBe(false);
    expect(b.replay).toBe(true);
    expect(b.campaign.pledgedQty).toBe(2);
    await expect(pledge(env, campaign.id, "m2", 1, "other")).rejects.toThrow(/이미 2개/);
    await cancelPledge(ctx, campaign.id, { member_token: world.encryptMember(MALL, "m2") });
    expect((await myPledge(ctx, campaign.id, { member_token: world.encryptMember(MALL, "m2") })).campaign.pledgedQty).toBe(0);
    await pledge(env, campaign.id, "m2", 1, "again");
    env.clock.advance(DAY5 + 1);
    await expect(pledge(env, campaign.id, "m4", 1)).rejects.toThrow(/마감/);
    await expect(cancelPledge(ctx, campaign.id, { member_token: world.encryptMember(MALL, "m2") })).rejects.toThrow(/마감/);
  });
});

describe("마감 판정", () => {
  it("실제 마감 시각 이후에만, 한 번만 일어난다", async () => {
    const env = await setup();
    const c = await openAndFill(env, range(1, 10));
    await expect(judgeNow(env.ctx, c.id, "op")).rejects.toThrow(/마감 시각 전/);
    env.clock.advance(DAY5);
    const r1 = await tick(env.ctx);
    const r2 = await tick(env.ctx);
    expect(r1.judged).toEqual([c.id]);
    expect(r2.judged).toEqual([]);
  });

  it("미달: 진행 안 됨으로 끝나고, 쿠폰은 발급하지 않고, 동의자에게 결과를 알린다", async () => {
    const env = await setup();
    const c = await openAndFill(env, range(1, 10)); // 10개 < 목표 30개
    env.clock.advance(DAY5);
    await tick(env.ctx);
    expect((await getCampaign(env.ctx, c.id)).state).toBe("failed");
    expect(await (await env.ctx.shop(MALL)).listCouponHolders(c.couponNo!)).toHaveLength(0);
    const result = env.world.smsLog.find((s) => !s.isAd)!;
    expect(result.content).toMatch(/진행되지 않아요. 결제된 금액은 없어요/);
    expect([...result.memberIds].sort()).toEqual(["m10", "m2", "m4", "m6", "m8"]);
  });

  it("달성: 신청자 전원에게 쿠폰을 주고, 빠진 회원은 다시 발급, 끝까지 빠지면 이슈로 남긴다", async () => {
    const env = await setup();
    const c = await openAndFill(env, range(1, 40));
    env.world.dropNextIssue.add("m5");
    env.world.blockIssue.add("m7");
    env.clock.advance(DAY5);
    await tick(env.ctx);
    const holders = new Set(await (await env.ctx.shop(MALL)).listCouponHolders(c.couponNo!));
    expect((await getCampaign(env.ctx, c.id)).state).toBe("reached");
    expect(holders.has("m5")).toBe(true); // 한 번 빠진 회원은 재발급으로 채운다
    expect(holders.has("m7")).toBe(false);
    expect(holders.size).toBe(39);
    const [issue] = await env.db.select().from(schema.issues).where(eq(schema.issues.kind, "coupon_missing"));
    expect((issue.detail as { members: string[] }).members).toEqual(["m7"]);
  });
});

describe("결제 집계", () => {
  async function reachedCampaign() {
    const env = await setup();
    const c = await openAndFill(env, range(1, 40), 1);
    env.clock.advance(DAY5);
    await tick(env.ctx);
    return { env, c, cp: (await getCampaign(env.ctx, c.id)).couponNo! };
  }

  it("쿠폰 주문만, 중복 웹훅은 한 번, 위조 웹훅은 무시, 취소는 뺀다", async () => {
    const { env, c, cp } = await reachedCampaign();
    const o1 = await env.world.placeOrder(MALL, "m1", PRODUCT, 1, cp);
    await env.world.placeOrder(MALL, "m2", PRODUCT, 1, cp);
    await env.world.placeOrder(MALL, "m3", PRODUCT, 1); // 쿠폰 없는 정가 주문
    await handleOrderWebhook(env.ctx, { event_no: 90023, resource: { mall_id: MALL, order_id: o1.orderId } }); // 중복
    await handleOrderWebhook(env.ctx, { event_no: 90023, resource: { mall_id: MALL, order_id: "ORD-FAKE" } }); // 위조
    let rep = await buildReport(env.ctx, c.id);
    expect(rep.confirmed.qty).toBe(2);
    expect(rep.confirmed.revenue).toBe(78000);
    await env.world.cancelOrder(MALL, o1.orderId);
    rep = await buildReport(env.ctx, c.id);
    expect(rep.confirmed.qty).toBe(1);
    expect(rep.confirmed.cancelledOrders).toBe(1);
  });

  it("기한 뒤 결제(쿠폰 여유 시간 안)는 late로 기록하고 확정 수량에서 뺀다", async () => {
    const { env, c, cp } = await reachedCampaign();
    env.clock.advance(72 * HOUR + 60_000); // pay_until 직후, 쿠폰은 여유 24시간 안
    await env.world.placeOrder(MALL, "m6", PRODUCT, 1, cp, { silent: true });
    await reconcileCampaign(env.ctx, c.id);
    const rep = await buildReport(env.ctx, c.id);
    expect(rep.confirmed.qty).toBe(0);
    expect(rep.confirmed.lateOrders).toBe(1);
  });

  it("웹훅이 유실돼도 대사가 채우고, 고친 내역을 남긴다", async () => {
    const { env, c, cp } = await reachedCampaign();
    await env.world.placeOrder(MALL, "m8", PRODUCT, 1, cp, { silent: true });
    expect((await buildReport(env.ctx, c.id)).confirmed.qty).toBe(0);
    await reconcileCampaign(env.ctx, c.id);
    expect((await buildReport(env.ctx, c.id)).confirmed.qty).toBe(1);
    const fixed = await env.db.select().from(schema.issues).where(eq(schema.issues.kind, "reconcile_fixed"));
    expect(fixed).toHaveLength(1);
  });
});

describe("확정 리포트와 4주 판정표", () => {
  it("확정 → 생산 결정 기록까지 끝나면 원씽을 충족한다", async () => {
    const env = await setup();
    const c = await openAndFill(env, range(1, 40), 1);
    await tick(env.ctx); // 초대 문자 발송
    env.clock.advance(DAY5);
    await tick(env.ctx);
    const cp = (await getCampaign(env.ctx, c.id)).couponNo!;
    for (const m of range(1, 25)) await env.world.placeOrder(MALL, m, PRODUCT, 1, cp);
    expect((await buildReport(env.ctx, c.id)).confirmed.expected).toBe(25); // 결제 기간 중 예상 확정 = max(결제, 신청×60%)
    await expect(recordProductionDecision(env.ctx, "op", c.id, { qty: 25, note: "가마 10/30" })).rejects.toThrow(/확정된 공구/);
    env.clock.advance(72 * HOUR);
    await tick(env.ctx);
    expect((await getCampaign(env.ctx, c.id)).state).toBe("settled");
    const rep = await buildReport(env.ctx, c.id);
    expect(rep.confirmed.qty).toBe(25);
    expect(rep.funnel.couponIssued).toBe(40);
    expect(rep.rates.pledgeToPaid).toBe(25 / 40);
    expect(rep.funnel.invitedPledgers).toBe(20); // 짝수 회원만 초대받았다
    expect(rep.rates.inviteToPledge).toBe(20 / 69);
    await expect(recordProductionDecision(env.ctx, "op", c.id, { qty: 25, note: " " })).rejects.toThrow(/근거/);
    await recordProductionDecision(env.ctx, "op", c.id, { qty: 26, note: "가마 10/30 · 여유 1장" });
    const sc = await pilotScorecard(env.ctx);
    expect(sc.rows.find((r) => r.key === "one_thing")!.pass).toBe(true);
    expect(sc.rows.find((r) => r.key === "scale")!.pass).toBe(false); // 아직 1몰 · 1건
  });

  it("개인정보: 고객 전화번호·이름·주소를 담는 열이 없다", async () => {
    const env = await setup();
    const res = await env.db.execute(sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`);
    const rows = ((res as unknown as { rows?: { table_name: string; column_name: string }[] }).rows ?? (res as unknown as { table_name: string; column_name: string }[]));
    const cols = rows.map((r) => `${r.table_name}.${r.column_name}`);
    expect(cols.length).toBeGreaterThan(50);
    const bad = cols.filter((c) => /phone|cellphone|mobile|email|address|customer_name|member_name/i.test(c));
    expect(bad).toEqual([]);
  });
});

describe("개인정보 권한 없는 몰 (장바구니 고객 공구)", () => {
  it("찜·수신 동의를 조회하지 않고 장바구니 고객을 초대하며, 수신거부 고객은 카페24 발송 단계에서 빠진다", async () => {
    const env = await setup();
    env.world.privacy = false;
    const pv = await previewCampaign(env.ctx, MALL, baseInput(env.clock));
    expect(pv.audience).toEqual({ wishlist: 0, cart: 40, unique: 40, reachable: 40, consentChecked: false });
    const { invited } = await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    expect(invited).toBe(40);
    await tick(env.ctx);
    const sms = env.world.smsLog[0];
    expect(sms.isAd).toBe(true);
    expect(sms.memberIds).toHaveLength(20); // m100~m139 중 수신 동의(짝수)만 실제로 받는다
    expect(sms.content).toMatch(/장바구니에 담아 두신 스톤웨어/);
    expect(sms.memberIds.every((id) => Number(id.slice(1)) % 2 === 0)).toBe(true);
  });
});

describe("보관 기간 파기", () => {
  it("끝난 지 180일 지난 공구는 회원 ID를 지우고 수량만 남기며, 앱 삭제 30일 뒤에는 몰 데이터를 모두 지운다", async () => {
    const env = await setup();
    const c = await openAndFill(env, range(1, 10));
    env.clock.advance(DAY5);
    await tick(env.ctx);
    expect((await getCampaign(env.ctx, c.id)).state).toBe("failed");

    env.clock.advance(179 * 24 * HOUR);
    expect((await purgeExpired(env.ctx)).anonymized).toBe(0);

    env.clock.advance(2 * 24 * HOUR);
    expect((await purgeExpired(env.ctx)).anonymized).toBe(10);
    const ps = await env.db.select().from(schema.pledges).where(eq(schema.pledges.campaignId, c.id));
    expect(ps).toHaveLength(10);
    expect(ps.every((p) => p.memberId.startsWith("anon:"))).toBe(true);
    expect(await env.db.select().from(schema.invitations).where(eq(schema.invitations.campaignId, c.id))).toHaveLength(0);
    const msgs = await env.db.select().from(schema.messages).where(eq(schema.messages.campaignId, c.id));
    expect(msgs.every((m) => m.recipients.length === 0)).toBe(true);
    expect((await purgeExpired(env.ctx)).anonymized).toBe(0); // 다시 돌아도 같다

    await env.db.update(schema.malls).set({ uninstalledAt: env.clock.now() }).where(eq(schema.malls.mallId, MALL));
    env.clock.advance(31 * 24 * HOUR);
    expect((await purgeExpired(env.ctx)).mallsDeleted).toBe(1);
    expect(await env.db.select().from(schema.campaigns).where(eq(schema.campaigns.mallId, MALL))).toHaveLength(0);
    expect(await env.db.select().from(schema.pledges)).toHaveLength(0);
    expect(await env.db.select().from(schema.malls).where(eq(schema.malls.mallId, MALL))).toHaveLength(0);
  });
});
