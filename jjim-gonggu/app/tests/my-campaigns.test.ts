// 위젯 '장바구니에 담은 다른 상품도 공구 중이에요' (#60): 로그인 회원 본인이 초대받았거나 신청한 공구 중 모집 중 · 쿠폰 받음만.

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { HOUR } from "@/lib/time";
import { getCampaign, openCampaign } from "@/lib/engine/campaigns";
import { tick } from "@/lib/engine/scheduler";
import { myOtherCampaigns } from "@/lib/engine/my-campaigns";
import { MALL, PRODUCT, baseInput, openAndFill, pledge, range, setup, type Env } from "./helpers";

const DAY = 24 * HOUR;
const mine = (env: Env, member: string, exclude?: number) =>
  myOtherCampaigns(env.ctx, MALL, { member_token: env.world.encryptMember(MALL, member), exclude }).then((r) => r.campaigns);

/** 102: 장바구니 m100~m139(짝수만 수신 동의 → 초대) 중 40명이 신청, 103: m100 · m102가 장바구니에 담음 · 마감은 102보다 이틀 늦게 */
async function twoCampaigns() {
  const env = await setup();
  env.world.addCart(MALL, 103, "m100");
  env.world.addCart(MALL, 103, "m102");
  const c102 = await openAndFill(env, range(100, 139), 1);
  const { campaign: c103 } = await openCampaign(env.ctx, "op", MALL, { ...baseInput(env.clock), productNo: 103, deadlineAt: new Date(env.clock.now().getTime() + 7 * DAY) });
  return { env, c102, c103 };
}

describe("담아 둔 다른 상품의 공구 (#60)", () => {
  it("초대받은 다른 상품의 모집 중 공구를 보여 주고, 지금 보는 상품은 뺀다", async () => {
    const { env } = await twoCampaigns();
    const [o] = await mine(env, "m100", PRODUCT);
    expect(o).toMatchObject({ productNo: 103, state: "open", source: "cart", path: "/product/103", pledgedQty: 0, targetQty: 30, dealPrice: 39000, mine: null });
    expect(await mine(env, "m100", PRODUCT)).toHaveLength(1);
    expect((await mine(env, "m100", 103)).map((x) => [x.productNo, x.mine?.state])).toEqual([[PRODUCT, "pledged"]]);
  });

  it("초대받지 않은 회원에게는 없고, 초대 없이 직접 신청한 공구는 보인다", async () => {
    const { env, c102 } = await twoCampaigns();
    expect(await mine(env, "m150")).toEqual([]);
    await pledge(env, c102.id, "m150", 2);
    expect((await mine(env, "m150", 103)).map((x) => [x.productNo, x.source, x.mine])).toEqual([[PRODUCT, null, { state: "pledged", qty: 2 }]]);
  });

  it("쿠폰 받은 공구가 먼저(결제 마감과 함께), 결제를 마쳤거나 마감이 지난 공구는 빠진다", async () => {
    const { env, c102 } = await twoCampaigns();
    env.clock.advance(5 * DAY);
    await tick(env.ctx); // 102 달성 → 쿠폰
    const list = await mine(env, "m100");
    expect(list.map((x) => [x.productNo, x.state, x.mine?.state ?? null])).toEqual([[PRODUCT, "reached", "coupon_issued"], [103, "open", null]]);
    expect(list[0].payUntil).toEqual((await getCampaign(env.ctx, c102.id)).payUntil);

    await env.world.placeOrder(MALL, "m100", PRODUCT, 1, (await getCampaign(env.ctx, c102.id)).couponNo!);
    expect((await mine(env, "m100")).map((x) => x.productNo)).toEqual([103]);
    env.clock.advance(2 * DAY + 1); // 103 마감이 지났다 (판정 전이어도 모집 중으로 보이지 않게)
    expect(await mine(env, "m100")).toEqual([]);
  });

  it("위조 토큰은 401, 연결이 끊긴 몰은 404", async () => {
    const { env } = await twoCampaigns();
    await expect(myOtherCampaigns(env.ctx, MALL, { member_token: "aGFjazptMg.forged" })).rejects.toThrow(/본인 확인/);
    await env.db.update(schema.malls).set({ uninstalledAt: env.clock.now() }).where(eq(schema.malls.mallId, MALL));
    await expect(mine(env, "m100")).rejects.toThrow(/연결된 쇼핑몰/);
  });
});
