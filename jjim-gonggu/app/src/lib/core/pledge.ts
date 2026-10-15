// 참여 신청 규칙. 신청에는 구속력이 없고, 확정은 결제 완료 수량으로만 센다.

import type { CampaignState } from "./campaign";

/** still_wanted: 미달 뒤 '그래도 살래요'를 표시한 신청 (판매자가 그래도 진행하면 이 신청만 쿠폰을 받는다)
 *  campaign_cancelled: 판매자가 공구를 취소해 끝난 신청 (#65). cancelled는 고객이 직접 취소한 것 */
export type PledgeState = "pledged" | "cancelled" | "coupon_issued" | "paid" | "expired" | "not_reached" | "still_wanted" | "campaign_cancelled";

/** 진행률(신청 수량)에 들어가는 상태 — 취소·미달은 뺀다 */
export const COUNTED_PLEDGE_STATES: PledgeState[] = ["pledged", "coupon_issued", "paid", "expired"];

export interface PledgeCheck {
  campaignState: CampaignState;
  deadlineAt: Date;
  perMemberLimit: number;
  qty: number;
  now: Date;
}

export type PledgeRejection = "closed" | "limit" | "invalid_qty";

export function checkPledge(c: PledgeCheck): PledgeRejection | null {
  if (c.campaignState !== "open" || c.now.getTime() >= c.deadlineAt.getTime()) return "closed";
  if (!Number.isInteger(c.qty) || c.qty < 1) return "invalid_qty";
  if (c.qty > c.perMemberLimit) return "limit";
  return null;
}

/** 마감 전 취소만 허용. */
export function canCancel(state: PledgeState, campaignState: CampaignState, deadlineAt: Date, now: Date): boolean {
  return state === "pledged" && campaignState === "open" && now.getTime() < deadlineAt.getTime();
}

/** 예상 결제율: 쿠폰을 받은 신청 중 결제까지 가는 비율. 기획서 가정 60%, 파일럿 실측으로 보정한다 */
export const EXPECTED_PAY_RATE = 0.6;

/** 결제 기간 중 판매자에게 보여 줄 '예상 확정 수량' = 결제분과 신청×예상 결제율 중 큰 값 */
export function expectedConfirmed(pledged: number, paid: number, expectedPayRate = EXPECTED_PAY_RATE): number {
  return Math.max(paid, Math.round(pledged * expectedPayRate));
}

/** 목표 수량을 결제로 채우려면 모여야 하는 신청 수량 (공구 조건 화면 안내). 30 / 0.6 같은 소수 오차로 하나 더 올라가지 않게 다듬는다 */
export function pledgesNeeded(targetQty: number, expectedPayRate = EXPECTED_PAY_RATE): number {
  if (!(targetQty > 0)) return 0;
  return Math.ceil(Number((targetQty / expectedPayRate).toFixed(6)));
}
