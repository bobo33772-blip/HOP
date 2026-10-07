import { createTestDb, schema } from "@/db";
import { MockCafe24 } from "@/lib/cafe24/mock";
import { HOUR, manualClock } from "@/lib/time";
import type { Ctx } from "@/lib/engine/context";
import type { CampaignInput } from "@/lib/core/campaign";
import { handleOrderWebhook } from "@/lib/engine/payments";
import { createPledge } from "@/lib/engine/pledges";
import { openCampaign } from "@/lib/engine/campaigns";

export const MALL = "linenco";
export const PRODUCT = 102;

/** 2026-10-12(월) 10:00 KST에서 시작하는 모의 쇼핑몰 1곳: 회원 200명(짝수만 수신 동의), 상품 102 찜 120명·장바구니 40명 */
export async function setup(opts: { members?: number; consentEvery?: number } = {}) {
  const clock = manualClock(new Date("2026-10-12T01:00:00Z"));
  const world = new MockCafe24(clock);
  world.addMall(MALL, [
    { productNo: 101, name: "워싱 린넨 이불 커버 (Q)", price: 129000, soldOut: true },
    { productNo: PRODUCT, name: "스톤웨어 디너 접시 4P", price: 52000, soldOut: true },
    { productNo: 103, name: "린넨 암막 커튼 2장", price: 89000 },
  ]);
  const n = opts.members ?? 200, every = opts.consentEvery ?? 2;
  for (let i = 1; i <= n; i++) world.addMember(MALL, `m${i}`, i % every === 0);
  for (let i = 1; i <= 120; i++) world.addWish(MALL, PRODUCT, `m${i}`);
  for (let i = 100; i <= 139; i++) world.addCart(MALL, PRODUCT, `m${i}`);
  for (let i = 1; i <= 60; i++) world.addWish(MALL, 101, `m${i}`);
  const db = await createTestDb();
  await db.insert(schema.malls).values({ mallId: MALL, brandName: "LINEN & CO.", optOutNumber: "080-000-0000", smsSender: "02-000-0000" });
  const logs: string[] = [];
  const ctx: Ctx = { db, shop: async (m) => world.forMall(m), clock, productUrl: (m, p) => `https://${m}.example/product/${p}`, log: (msg) => { logs.push(msg); } };
  world.onWebhook(async (e) => { await handleOrderWebhook(ctx, e); });
  return { ctx, world, clock, db, logs };
}

export type Env = Awaited<ReturnType<typeof setup>>;

export const baseInput = (clock: { now(): Date }): CampaignInput => ({
  productNo: PRODUCT, targetQty: 30, dealPrice: 39000, costPrice: 28500, perMemberLimit: 2,
  deadlineAt: new Date(clock.now().getTime() + 5 * 24 * HOUR), payWindowHours: 72, shipEta: "2026-11-06",
});

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `m${a + i}`);

export const pledge = (env: Env, id: string, member: string, qty = 1, key = `${member}-k`) =>
  createPledge(env.ctx, id, { member_token: env.world.encryptMember(MALL, member), qty }, key);

export async function openAndFill(env: Env, members: string[], qty = 1, input: Partial<CampaignInput> = {}) {
  const { campaign } = await openCampaign(env.ctx, "op", MALL, { ...baseInput(env.clock), ...input });
  for (const m of members) await pledge(env, campaign.id, m, qty);
  return campaign;
}
