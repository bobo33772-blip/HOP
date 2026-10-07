// 참여 신청 규칙. 신청에는 구속력이 없고, 확정은 결제 완료 수량으로만 센다.

import type { CampaignState } from "./campaign";

export type PledgeState = "pledged" | "cancelled" | "coupon_issued" | "paid" | "expired" | "not_reached";

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

/** 결제 기간 중 판매자에게 보여 줄 '예상 확정 수량'. 예상 결제율 기본 60% (기획서 가정, 파일럿으로 보정). */
export function expectedConfirmed(pledged: number, paid: number, expectedPayRate = 0.6): number {
  return Math.max(paid, Math.round(pledged * expectedPayRate));
}
