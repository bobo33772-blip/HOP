// 공구(캠페인) 상태 머신과 개설 규칙.
// 기획서 '핵심 정책': 확정 수량 = 결제 기간 안에 쿠폰으로 결제한 수량,
// 실제 마감 시각이 지나야 판정, 연장은 1회·사유 공개, 미달 시 판매자가 '그래도 진행' 선택 가능.

export type CampaignState = "draft" | "open" | "reached" | "failed" | "forced" | "settled";

export interface CampaignInput {
  productNo: number;
  targetQty: number;
  dealPrice: number;
  listPrice: number; // 실제로 판매했던 정가
  costPrice?: number | null; // 원가 (선택, 입력하면 원가 미만 경고)
  deadlineAt: Date;
  payWindowHours: number;
  perMemberLimit: number;
  shipEta: Date; // 예상 출고일 (전자상거래법 고지 의무 → 필수)
}

export interface Issue {
  field: keyof CampaignInput | "general";
  level: "error" | "warning";
  message: string;
}

export const DEFAULT_PAY_WINDOW_HOURS = 72;
const MIN_OPEN_HOURS = 24;
const MAX_OPEN_DAYS = 30;

export function validateCampaignInput(input: CampaignInput, now: Date): Issue[] {
  const issues: Issue[] = [];
  const err = (field: Issue["field"], message: string) => issues.push({ field, level: "error", message });
  const warn = (field: Issue["field"], message: string) => issues.push({ field, level: "warning", message });

  if (!Number.isInteger(input.targetQty) || input.targetQty < 1) err("targetQty", "목표 수량은 1개 이상이어야 해요.");
  if (!Number.isInteger(input.listPrice) || input.listPrice <= 0) err("listPrice", "정가를 입력해 주세요.");
  if (!Number.isInteger(input.dealPrice) || input.dealPrice <= 0) err("dealPrice", "공구가를 입력해 주세요.");
  else if (input.dealPrice >= input.listPrice) err("dealPrice", "공구가는 정가보다 낮아야 해요.");
  if (input.costPrice != null && input.dealPrice < input.costPrice) {
    warn("dealPrice", "공구가가 원가보다 낮아요. 팔수록 손해일 수 있어요.");
  }

  const hoursLeft = (input.deadlineAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft < MIN_OPEN_HOURS) err("deadlineAt", `마감은 지금부터 ${MIN_OPEN_HOURS}시간 이후로 정해 주세요.`);
  if (hoursLeft > MAX_OPEN_DAYS * 24) err("deadlineAt", `마감은 ${MAX_OPEN_DAYS}일 안으로 정해 주세요.`);

  if (input.payWindowHours < 24 || input.payWindowHours > 168) err("payWindowHours", "결제 기간은 24~168시간 사이여야 해요.");
  if (!Number.isInteger(input.perMemberLimit) || input.perMemberLimit < 1) err("perMemberLimit", "1인 한도는 1개 이상이어야 해요.");
  else if (input.perMemberLimit > input.targetQty) warn("perMemberLimit", "1인 한도가 목표 수량보다 커요.");

  const payEnd = input.deadlineAt.getTime() + input.payWindowHours * 3_600_000;
  if (input.shipEta.getTime() < payEnd) err("shipEta", "예상 출고일은 결제 기간이 끝난 뒤여야 해요.");

  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");

/** 마감 판정: 실제 마감 시각이 지나야만 판정한다 (가짜 카운트다운 금지). */
export function judge(state: CampaignState, pledgedQty: number, targetQty: number, deadlineAt: Date, now: Date): CampaignState {
  if (state !== "open") return state;
  if (now.getTime() < deadlineAt.getTime()) return "open";
  return pledgedQty >= targetQty ? "reached" : "failed";
}

export function canExtend(state: CampaignState, alreadyExtended: boolean, oldDeadline: Date, newDeadline: Date, reason: string, now: Date): string | null {
  if (state !== "open") return "진행 중인 공구만 연장할 수 있어요.";
  if (alreadyExtended) return "연장은 한 번만 할 수 있어요.";
  if (!reason.trim()) return "연장 사유를 적어 주세요. 참여자에게 공개돼요.";
  if (newDeadline.getTime() <= oldDeadline.getTime()) return "새 마감은 기존 마감보다 뒤여야 해요.";
  if (newDeadline.getTime() - now.getTime() > MAX_OPEN_DAYS * 86_400_000) return `마감은 ${MAX_OPEN_DAYS}일 안으로 정해 주세요.`;
  return null;
}

/** 결제 기간이 끝났으면 정산(settled)으로 넘긴다. */
export function settleIfDue(state: CampaignState, judgedAt: Date | null, payWindowHours: number, now: Date): CampaignState {
  if ((state === "reached" || state === "forced") && judgedAt) {
    if (now.getTime() >= judgedAt.getTime() + payWindowHours * 3_600_000) return "settled";
  }
  return state;
}

export const TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  draft: ["open"],
  open: ["reached", "failed"],
  reached: ["settled"],
  failed: ["forced"],
  forced: ["settled"],
  settled: [],
};

export function assertTransition(from: CampaignState, to: CampaignState) {
  if (!TRANSITIONS[from].includes(to)) throw new Error(`invalid campaign transition ${from} → ${to}`);
}
