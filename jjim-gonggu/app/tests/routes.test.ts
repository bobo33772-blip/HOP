// 라우트 경계: 운영자 쿠키 서명, 공개 신청 API(CORS·재전송·위조 거부·쿠폰 번호 비공개), 웹훅 키·중복 제거.
// 데모 모드(모의 쇼핑몰 + 메모리 DB)의 서버 전역 컨텍스트를 그대로 쓴다.

import { beforeAll, describe, expect, it } from "vitest";
import { encodeAdminCookie, verifyAdminCookie } from "@/lib/http";
import { getCtx, getDemo } from "@/lib/server";
import { DEMO_MALL } from "@/lib/cafe24/mock";
import { openCampaign } from "@/lib/engine/campaigns";
import { HOUR, kstDate } from "@/lib/time";
import * as campaignRoute from "@/app/api/public/malls/[mall]/products/[no]/campaign/route";
import * as pledgeRoute from "@/app/api/public/campaigns/[id]/pledges/route";
import * as webhookRoute from "@/app/api/cafe24/webhooks/route";

process.env.CAFE24_MOCK = "1";
process.env.ADMIN_TOKEN = "test-admin-token-0123456789abcdef";
process.env.PLEDGE_PER_MINUTE = "1000";

const params = <T,>(v: T) => ({ params: Promise.resolve(v) });
let campaignId = "";

beforeAll(async () => {
  const ctx = await getCtx();
  const demo = (await getDemo())!;
  const now = demo.clock.now();
  const { campaign } = await openCampaign(ctx, "op", DEMO_MALL, {
    productNo: 102, targetQty: 30, dealPrice: 39000, costPrice: 28500, perMemberLimit: 2,
    deadlineAt: new Date(now.getTime() + 5 * 24 * HOUR), payWindowHours: 72, shipEta: kstDate(new Date(now.getTime() + 20 * 24 * HOUR)),
  });
  campaignId = campaign.id;
});

describe("운영자 쿠키", () => {
  it("서명이 맞고 만료 전이면 통과, 위조·만료는 거부", () => {
    const c = encodeAdminCookie();
    expect(verifyAdminCookie(c)).toBe(true);
    expect(verifyAdminCookie(c.slice(0, -2) + "xx")).toBe(false);
    expect(verifyAdminCookie(c, Date.now() + 13 * HOUR)).toBe(false);
    expect(verifyAdminCookie(undefined)).toBe(false);
  });
  it("운영자 토큰을 바꾸면 기존 쿠키는 무효", () => {
    const c = encodeAdminCookie();
    process.env.ADMIN_TOKEN = "another-admin-token-0123456789abcdef";
    expect(verifyAdminCookie(c)).toBe(false);
    process.env.ADMIN_TOKEN = "test-admin-token-0123456789abcdef";
  });
});

describe("공개 API (위젯)", () => {
  it("공구 정보는 CORS가 열려 있고, 쿠폰 번호·원가는 내보내지 않는다", async () => {
    const r = await campaignRoute.GET(new Request("http://t/x"), params({ mall: DEMO_MALL, no: "102" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const text = await r.text();
    expect(JSON.parse(text).campaign.id).toBe(campaignId);
    expect(text).not.toMatch(/couponNo|costPrice|reportToken/);
    const none = await campaignRoute.GET(new Request("http://t/x"), params({ mall: DEMO_MALL, no: "999" }));
    expect(none.status).toBe(404);
  });

  it("결제 없는 신청: 같은 Idempotency-Key 재전송은 한 번만, 위조 토큰은 401", async () => {
    const demo = (await getDemo())!;
    const body = JSON.stringify({ member_token: demo.world.encryptMember(DEMO_MALL, "m62"), qty: 1 });
    const send = (key: string, b = body) => pledgeRoute.POST(new Request("http://t/x", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: b }), params({ id: campaignId }));
    const p1 = await send("abc");
    const p2 = await send("abc");
    expect(p1.status).toBe(201);
    expect(p2.status).toBe(200);
    expect((await p2.json()).campaign.pledgedQty).toBe(1);
    const forged = await send("x", JSON.stringify({ member_token: "aGFjazptMg.forged", qty: 1 }));
    expect(forged.status).toBe(401);
    expect((await forged.json()).message).toMatch(/본인 확인/);
    expect(forged.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("카페24 웹훅", () => {
  const raw = JSON.stringify({ event_no: 90023, resource: { mall_id: DEMO_MALL, order_id: "ORD-NOPE" } });
  const send = (headers: Record<string, string>) => webhookRoute.POST(new Request("http://t/x", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: raw }));

  it("WEBHOOK_API_KEY가 있으면 X-API-Key가 맞아야 받는다", async () => {
    process.env.WEBHOOK_API_KEY = "hook-key";
    expect((await send({})).status).toBe(401);
    const ok = await send({ "X-API-Key": "hook-key", "X-Trace-ID": "t-1" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, handled: 0 }); // 카페24에 없는 주문이라 반영하지 않는다
    delete process.env.WEBHOOK_API_KEY;
  });

  it("같은 trace id는 한 번만 처리한다", async () => {
    await send({ "X-Trace-ID": "t-2" });
    expect(await (await send({ "X-Trace-ID": "t-2" })).json()).toMatchObject({ duplicate: true });
  });
});
