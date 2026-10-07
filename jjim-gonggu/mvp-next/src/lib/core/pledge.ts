// 참여 신청 규칙. 신청에는 구속력이 없고, 확정은 결제 완료 수량으로만 센다.

import type { CampaignState } from "./campaign";

export type PledgeState = "pledged" | "coupon_issued" | "paid" | "cancelled" | "expired";

export interface PledgeCheck {
  campaignState: CampaignState;
  deadlineAt: Date;
  perMemberLimit: number;
  memberExistingQty: number; // 이 회원이 이미 신청한(취소 제외) 수량
  qty: number;
  now: Date;
}

export type PledgeRejection = "closed" | "limit" | "invalid_qty";

export function checkPledge(c: PledgeCheck): PledgeRejection | null {
  if (!Number.isInteger(c.qty) || c.qty < 1) return "invalid_qty";
  if (c.campaignState !== "open" || c.now.getTime() >= c.deadlineAt.getTime()) return "closed";
  if (c.memberExistingQty + c.qty > c.perMemberLimit) return "limit";
  return null;
}

/** 마감 전 취소만 허용. */
export function canCancel(state: PledgeState, campaignState: CampaignState, deadlineAt: Date, now: Date): boolean {
  return state === "pledged" && campaignState === "open" && now.getTime() < deadlineAt.getTime();
}

export interface PledgeRow {
  state: PledgeState;
  qty: number;
  paidAmount?: number | null;
}

export function summarize(pledges: PledgeRow[]) {
  let pledged = 0, paid = 0, cancelled = 0, expired = 0, revenue = 0;
  for (const p of pledges) {
    if (p.state === "cancelled") { cancelled += p.qty; continue; }
    pledged += p.qty;
    if (p.state === "paid") { paid += p.qty; revenue += p.paidAmount ?? 0; }
    if (p.state === "expired") expired += p.qty;
  }
  return { pledged, confirmedQty: paid, cancelled, expired, unpaid: pledged - paid - expired, revenue };
}

/** 결제 기간 중 판매자에게 보여 줄 '예상 확정 수량'. 예상 결제율 기본 60% (기획서 가정, 파일럿으로 보정). */
export function expectedConfirmed(pledged: number, paid: number, expectedPayRate = 0.6): number {
  return Math.max(paid, Math.round(pledged * expectedPayRate));
}
