// 데모 동작: 모의 쇼핑몰 위에서 시간 넘기기, 다른 고객 신청·결제 흉내, 고객 주문. 실제 문자·결제는 일어나지 않는다.

import { and, eq, notInArray } from "drizzle-orm";
import { schema } from "@/db";
import { DEMO_MALL, DEMO_PRODUCTS } from "./cafe24/mock";
import { HOUR, fmtKst, won } from "./time";
import { UserError, type Ctx } from "./engine/context";
import { activeCampaignForProduct } from "./engine/campaigns";
import { createPledge } from "./engine/pledges";
import { tick } from "./engine/scheduler";
import type { Demo } from "./server";

export const demoProduct = (no: number) => DEMO_PRODUCTS.find((p) => p.productNo === no) ?? null;
export const isDemoMember = (m: string) => /^m\d{1,3}$/.test(m);

/** 시간을 한 번에 건너뛰지 않고 1시간씩 흘려보낸다. 그래야 08시 발송 같은 예약이 실제처럼 실행된다 */
export async function advance(ctx: Ctx, demo: Demo, to: string, productNo: number) {
  const c = await activeCampaignForProduct(ctx, DEMO_MALL, productNo);
  const now = demo.clock.now().getTime();
  let target: number;
  if (to === "deadline") {
    if (!c) throw new UserError("none", "공구가 없어요");
    target = Math.max(now, c.deadlineAt.getTime() + 1000);
  } else if (to === "payend") {
    if (!c?.payUntil) throw new UserError("none", "아직 결제 기간이 아니에요");
    target = c.payUntil.getTime() + 1000;
  } else {
    target = now + Math.min(240, Math.max(1, Number(to) || 1)) * HOUR;
  }
  while (demo.clock.now().getTime() < target) {
    demo.clock.set(new Date(Math.min(target, demo.clock.now().getTime() + HOUR)));
    await tick(ctx);
  }
  return demo.clock.now();
}

export async function simulatePledges(ctx: Ctx, demo: Demo, productNo: number, n: number) {
  const c = await activeCampaignForProduct(ctx, DEMO_MALL, productNo);
  if (!c || c.state !== "open") return "진행 중인 공구가 없어요";
  const pledged = ctx.db.select({ m: schema.pledges.memberId }).from(schema.pledges).where(eq(schema.pledges.campaignId, c.id));
  const invited = await ctx.db.select({ memberId: schema.invitations.memberId }).from(schema.invitations)
    .where(and(eq(schema.invitations.campaignId, c.id), notInArray(schema.invitations.memberId, pledged)));
  let k = 0;
  for (const { memberId } of invited.slice(0, Math.min(50, n))) {
    await createPledge(ctx, c.id, { member_token: demo.world.encryptMember(DEMO_MALL, memberId), qty: 1 + (k % Math.min(2, c.perMemberLimit)) }, `sim-${memberId}`);
    k++;
  }
  return `다른 고객 ${k}명이 신청했어요`;
}

export async function simulatePayments(ctx: Ctx, demo: Demo, productNo: number, rate: number) {
  const c = await activeCampaignForProduct(ctx, DEMO_MALL, productNo);
  if (!c || c.state !== "reached") return "결제 기간인 공구가 없어요";
  const rows = await ctx.db.select({ memberId: schema.pledges.memberId, qty: schema.pledges.qty }).from(schema.pledges)
    .where(and(eq(schema.pledges.campaignId, c.id), eq(schema.pledges.state, "coupon_issued")));
  const k = Math.round(rows.length * Math.min(1, Math.max(0, rate)));
  for (const r of rows.slice(0, k)) await demo.world.placeOrder(DEMO_MALL, r.memberId, c.productNo, r.qty, c.couponNo!);
  return `${k}명이 쿠폰으로 결제했어요`;
}

/** 고객이 주문서에서 결제. 공구 쿠폰을 갖고 있으면 신청 수량만큼 쿠폰을 자동 적용한다 */
export async function checkout(ctx: Ctx, demo: Demo, member: string, productNo: number) {
  const c = await activeCampaignForProduct(ctx, DEMO_MALL, productNo);
  const holds = c?.couponNo ? (await demo.world.forMall(DEMO_MALL).listCouponHolders(c.couponNo)).includes(member) : false;
  const [pl] = c ? await ctx.db.select({ qty: schema.pledges.qty }).from(schema.pledges).where(and(eq(schema.pledges.campaignId, c.id), eq(schema.pledges.memberId, member))) : [];
  try {
    const o = await demo.world.placeOrder(DEMO_MALL, member, productNo, holds ? pl?.qty ?? 1 : 1, holds ? c!.couponNo! : undefined);
    return `${o.orderId} 결제 완료 · ${won(o.items[0].amount)}${holds ? " (공구 쿠폰 적용)" : " (정가)"}`;
  } catch (e) {
    return (e as Error).message;
  }
}

export function memberState(demo: Demo, member: string) {
  return {
    now: demo.clock.now(),
    inbox: demo.world.smsLog.filter((s) => s.mallId === DEMO_MALL && s.memberIds.includes(member)).map((s) => ({ at: fmtKst(s.at), content: s.content })),
    coupons: demo.world.couponsOf(DEMO_MALL, member).map((c) => `${c.name} −${won(c.discountAmount)}${c.used ? " (사용함)" : ""}`),
  };
}
