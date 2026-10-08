// 공구 개설 규칙. 기획서 '핵심 정책':
// 확정 수량 = 결제 기간 안에 쿠폰으로 결제한 수량, 실제 마감 시각이 지나야 판정, 결제 기간 48·72시간,
// 초대 문자가 나간 뒤 최소 24시간 모집, 예상 출고일 필수(전자상거래법 고지), 원가 미만은 판매자 확인 후에만.

import { nextAllowedSendTime } from "./messaging";

export type CampaignState = "open" | "reached" | "failed" | "settled";

export interface CampaignInput {
  productNo: number;
  targetQty: number;
  dealPrice: number;
  costPrice?: number | null; // 원가 (선택, 고객에게 안 보임)
  perMemberLimit: number;
  deadlineAt: Date;
  payWindowHours: number; // 48 | 72
  shipEta: string; // YYYY-MM-DD
  confirmBelowCost?: boolean;
}

export interface Issue {
  field: keyof CampaignInput | "general";
  level: "error" | "warning";
  message: string;
}

export const PAY_WINDOW_OPTIONS = [48, 72] as const;
export const MAX_PER_MEMBER = 5;
const HOUR = 3_600_000;
const MIN_RECRUIT_HOURS = 24;
const MAX_OPEN_DAYS = 30;

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const isInt = (v: unknown): v is number => Number.isInteger(v);

/** listPrice: 카페24에 등록된 실제 판매가 */
export function validateCampaignInput(input: CampaignInput, listPrice: number, now: Date): Issue[] {
  const issues: Issue[] = [];
  const err = (field: Issue["field"], message: string) => issues.push({ field, level: "error", message });
  const warn = (field: Issue["field"], message: string) => issues.push({ field, level: "warning", message });

  if (!isInt(input.targetQty) || input.targetQty < 1) err("targetQty", "목표 수량은 1개 이상 정수로 입력해 주세요.");
  if (!isInt(input.dealPrice) || input.dealPrice <= 0) err("dealPrice", "공구가를 입력해 주세요.");
  else if (input.dealPrice >= listPrice) err("dealPrice", `공구가는 정가(${won(listPrice)})보다 낮아야 해요.`);
  if (input.costPrice != null && isInt(input.dealPrice) && input.dealPrice < input.costPrice) {
    if (input.confirmBelowCost) warn("dealPrice", `공구가가 원가(${won(input.costPrice)})보다 낮아요. 팔수록 손해예요.`);
    else err("dealPrice", `공구가가 원가(${won(input.costPrice)})보다 낮아요. 팔수록 손해예요. 그래도 열려면 원가 미만 확인에 체크해 주세요.`);
  }
  if (!isInt(input.perMemberLimit) || input.perMemberLimit < 1 || input.perMemberLimit > MAX_PER_MEMBER) err("perMemberLimit", `1인 최대 수량은 1~${MAX_PER_MEMBER}개로 정해 주세요.`);
  else if (isInt(input.targetQty) && input.perMemberLimit > input.targetQty) warn("perMemberLimit", "1인 한도가 목표 수량보다 커요.");
  if (!(PAY_WINDOW_OPTIONS as readonly number[]).includes(input.payWindowHours)) err("payWindowHours", "결제 기간은 48시간 또는 72시간이에요.");

  const dl = input.deadlineAt;
  if (!(dl instanceof Date) || Number.isNaN(dl.getTime())) err("deadlineAt", "마감 일시를 확인해 주세요.");
  else if (dl.getTime() < now.getTime() + MIN_RECRUIT_HOURS * HOUR) err("deadlineAt", `마감은 지금부터 ${MIN_RECRUIT_HOURS}시간 이후로 잡아 주세요.`);
  else if (dl.getTime() - nextAllowedSendTime(now).getTime() < MIN_RECRUIT_HOURS * HOUR) err("deadlineAt", "초대 문자가 나간 뒤 최소 24시간은 모집할 수 있게 마감을 늦춰 주세요. 밤 9시~오전 8시에는 문자를 보낼 수 없어요.");
  else if (dl.getTime() - now.getTime() > MAX_OPEN_DAYS * 24 * HOUR) err("deadlineAt", `마감은 ${MAX_OPEN_DAYS}일 안으로 정해 주세요.`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.shipEta))) err("shipEta", "예상 출고일을 입력해 주세요. 고객 신청 화면에 그대로 보여요.");
  else if (dl instanceof Date && !Number.isNaN(dl.getTime()) && new Date(`${input.shipEta}T23:59:59+09:00`) < dl) err("shipEta", "예상 출고일은 마감일 이후여야 해요.");

  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");
export const errorMessages = (issues: Issue[]) => issues.filter((i) => i.level === "error").map((i) => i.message);
