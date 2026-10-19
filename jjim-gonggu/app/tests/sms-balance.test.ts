// 카페24 SMS 잔액 부족 (테스트몰에서 실제로 받은 422): 30분마다 다시 보내다가 충전되면 나간다. 화면에는 판매자 말로 보인다.

import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { openCampaign } from "@/lib/engine/campaigns";
import { tick } from "@/lib/engine/scheduler";
import { smsError } from "@/app/console/format";
import { MALL, baseInput, setup } from "./helpers";

const MIN = 60_000;

describe("SMS 잔액 부족", () => {
  it("3번에 포기하지 않고 30분마다 다시 보내다가, 충전되면 보낸다", async () => {
    const env = await setup();
    const { campaign } = await openCampaign(env.ctx, "op", MALL, baseInput(env.clock));
    env.world.smsBalanceEmpty = true;
    const invite = async () => (await env.db.select().from(schema.messages).where(and(eq(schema.messages.campaignId, campaign.id), eq(schema.messages.kind, "invite_ad"))))[0];
    for (let i = 0; i < 5; i++) { await tick(env.ctx); env.clock.advance(30 * MIN); }
    const m = await invite();
    expect(m.status).toBe("scheduled");
    expect(m.attempts).toBe(5);
    env.world.smsBalanceEmpty = false; // 판매자가 충전
    await tick(env.ctx);
    expect((await invite()).status).toBe("sent");
    expect(env.world.smsLog.length).toBeGreaterThan(0);
  });

  it("화면에는 카페24 원문 대신 판매자 말로 보인다", () => {
    const raw = `Error: cafe24 422 /sms: {"error":{"code":422,"message":"Available SMS quantity is not enough."}}`;
    expect(smsError(raw, "scheduled")).toMatch(/SMS 잔액이 부족해요.*충전/);
    expect(smsError(raw, "failed")).not.toMatch(/422|quantity/);
    expect(smsError("Error: cafe24 500 /sms: boom", "scheduled")).toBe("문자를 보내지 못해 잠시 뒤 다시 보내요.");
  });
});
