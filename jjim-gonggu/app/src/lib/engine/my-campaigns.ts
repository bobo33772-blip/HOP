// 위젯의 '장바구니에 담은 다른 상품도 공구 중이에요' (#60). 로그인 회원 본인이 초대받았거나(장바구니 · 찜 · 알림) 신청한 공구 중
// 지금 참여할 수 있는 것(모집 중)과 결제해야 하는 것(쿠폰 받음)만 돌려준다. 초대 기록은 공구를 열 때 저장해 둔 것이라 카페24를 부르지 않는다.

import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { schema } from "@/db";
import type { CampaignState } from "../core/campaign";
import type { PledgeState } from "../core/pledge";
import type { Ctx } from "./context";
import { getMall, pledgedQty } from "./campaigns";
import { memberOf } from "./pledges";

/** 위젯에 보여 줄 최대 개수 */
export const OTHERS_MAX = 3;

export async function myOtherCampaigns(ctx: Ctx, mallId: string, body: { member_token?: unknown; exclude?: unknown }) {
  await getMall(ctx, mallId); // 연결된 몰만
  const memberId = await memberOf(ctx, mallId, body.member_token);
  const now = ctx.clock.now();
  const C = schema.campaigns, I = schema.invitations, P = schema.pledges;
  const rows = await ctx.db.select({ c: C, source: I.source, pState: P.state, pQty: P.qty }).from(C)
    .leftJoin(I, and(eq(I.campaignId, C.id), eq(I.memberId, memberId)))
    .leftJoin(P, and(eq(P.campaignId, C.id), eq(P.memberId, memberId)))
    .where(and(eq(C.mallId, mallId), inArray(C.state, ["open", "reached"]), or(isNotNull(I.memberId), isNotNull(P.id))));

  // 쿠폰 받은 공구(결제 마감이 가까운 순) → 모집 중(모집 마감이 가까운 순)
  const picked = rows
    .filter((r) => r.c.productNo !== Number(body.exclude))
    .filter((r) => (r.c.state === "open" ? now < r.c.deadlineAt : r.pState === "coupon_issued"))
    .sort((a, b) => (a.c.state === b.c.state ? 0 : a.c.state === "reached" ? -1 : 1)
      || ((a.c.payUntil ?? a.c.deadlineAt).getTime() - (b.c.payUntil ?? b.c.deadlineAt).getTime()))
    .slice(0, OTHERS_MAX);

  const campaigns = await Promise.all(picked.map(async ({ c, source, pState, pQty }) => {
    const url = new URL(ctx.productUrl(mallId, c.productNo));
    return {
      productNo: c.productNo, productName: c.productName, state: c.state as CampaignState, proceeded: !!c.proceededAt,
      // 지금 쇼핑몰 주소 그대로 쓰도록 경로만 (자체 도메인 몰에서 cafe24.com으로 넘어가 로그인이 풀리지 않게)
      path: url.pathname + url.search,
      listPrice: c.listPrice, dealPrice: c.dealPrice, targetQty: c.targetQty, pledgedQty: await pledgedQty(ctx, c.id),
      deadlineAt: c.deadlineAt, payUntil: c.payUntil,
      source: source ?? null, mine: pState ? { state: pState as PledgeState, qty: pQty! } : null,
    };
  }));
  return { campaigns };
}
