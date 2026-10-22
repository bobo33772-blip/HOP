// 공구 조건 시나리오 · 예상 결과 (#125). AI가 아니라 정해진 공식이다. 화면에는 늘 '예상'으로 보여 준다.
// - 초대 → 신청: 할인 20%일 때 5%(기획서 기준값), 할인에 비례해 3~15% 사이 (기획서 민감도 범위)
// - 신청 1명 = 1개로 센다 (1인 한도까지 더 사는 고객은 덤으로 본다)
// - 신청 → 결제: EXPECTED_PAY_RATE (60%). 목표 수량(신청 기준)을 못 채우면 공구가 진행되지 않아 결제도 0
// - 만드는 수량 = 예상 결제 수량과 최소 생산 수량 중 큰 값. 남는 재고는 원가만큼 손해로 본다
// 파일럿 실측이 쌓이면 이 비율들을 그 몰의 값으로 바꾼다.

import { EXPECTED_PAY_RATE, pledgesNeeded } from "./pledge";

export const BASE_PLEDGE_RATE = 0.05; // 할인 20%일 때 초대 → 신청
export const BASE_DISCOUNT = 0.2;
export const PLEDGE_RATE_MIN = 0.03;
export const PLEDGE_RATE_MAX = 0.15;
export const DISCOUNT_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const; // 할인율(%) 막대 · 그래프 칸

export interface ScenarioBase {
  listPrice: number;
  costPrice: number | null;
  moq: number | null;
  invited: number; // 초대 문자를 받을 수 있는 인원
}

export interface Outcome {
  discountPct: number;
  dealPrice: number;
  targetQty: number;
  pledged: number; // 예상 신청 수량
  reached: boolean; // 예상 신청이 목표를 넘는가
  paid: number; // 예상 결제 수량 (진행 안 되면 0)
  revenue: number;
  produce: number; // 만들어야 하는 수량 (최소 생산 수량 반영)
  leftover: number; // 남는 재고
  profit: number | null; // 원가를 모르면 null
  marginPerUnit: number | null;
  moqMet: boolean | null; // 최소 생산 수량을 모르면 null
}

/** 할인율에 따른 초대 → 신청 비율 */
export function pledgeRate(discountPct: number): number {
  const r = BASE_PLEDGE_RATE * (discountPct / 100 / BASE_DISCOUNT);
  return Math.min(PLEDGE_RATE_MAX, Math.max(PLEDGE_RATE_MIN, r));
}

/** 정가 × (1 − 할인율)을 500원 단위로 반올림. 정가보다는 늘 낮게 */
export function dealPriceFor(listPrice: number, discountPct: number): number {
  const p = Math.round((listPrice * (1 - discountPct / 100)) / 500) * 500;
  return Math.max(500, Math.min(p, listPrice - 500));
}

export function discountOf(listPrice: number, dealPrice: number): number {
  return listPrice > 0 ? Math.round((1 - dealPrice / listPrice) * 100) : 0;
}

/** 이 조건으로 열면 어떻게 될지 */
export function outcome(b: ScenarioBase, dealPrice: number, targetQty: number): Outcome {
  const discountPct = discountOf(b.listPrice, dealPrice);
  const pledged = Math.round(Math.max(0, b.invited) * pledgeRate(discountPct));
  const reached = targetQty > 0 && pledged >= targetQty;
  const paid = reached ? Math.floor(Number((pledged * EXPECTED_PAY_RATE).toFixed(6))) : 0;
  const produce = paid > 0 ? Math.max(paid, b.moq ?? 0) : 0;
  const marginPerUnit = b.costPrice != null ? dealPrice - b.costPrice : null;
  return {
    discountPct, dealPrice, targetQty, pledged, reached, paid,
    revenue: paid * dealPrice,
    produce, leftover: produce - paid,
    profit: b.costPrice != null ? paid * dealPrice - produce * b.costPrice : null,
    marginPerUnit,
    moqMet: b.moq != null ? paid >= b.moq : null,
  };
}

export type ScenarioKey = "fast" | "profit" | "moq";
export interface Scenario { key: ScenarioKey; title: string; why: string; days: number; outcome: Outcome | null; note?: string }

/** 원가 이상이 되는 가장 큰 할인 (원가를 모르면 제한 없음) */
const affordable = (b: ScenarioBase, pct: number) => b.costPrice == null || dealPriceFor(b.listPrice, pct) >= b.costPrice;
const easyTarget = (pledged: number, share: number) => Math.max(1, Math.floor(pledged * share));

/** 시나리오 3가지: 빠르게 모으기 · 수익률 좋게 · 최소 생산 수량 꼭 채우기 */
export function scenarios(b: ScenarioBase): Scenario[] {
  const pick = (pcts: readonly number[]) => pcts.find((p) => affordable(b, p));

  // ⚡ 할인을 크게, 목표는 예상 신청의 70%로 낮게, 마감 3일
  const fastPct = pick([35, 30, 25, 20, 15, 10, 5]);
  const fast: Scenario = { key: "fast", title: "빠르게 모으기", why: "할인을 크게 · 목표를 낮게 · 마감 3일", days: 3, outcome: null };
  if (fastPct != null) {
    const deal = dealPriceFor(b.listPrice, fastPct);
    fast.outcome = outcome(b, deal, easyTarget(outcome(b, deal, 1).pledged, 0.7));
  } else fast.note = "원가가 정가에 가까워 할인할 여유가 없어요";

  // 💰 할인을 작게(10%), 목표는 예상 신청의 90%, 마감 7일
  const profitDeal = dealPriceFor(b.listPrice, 10);
  const profit: Scenario = { key: "profit", title: "수익률 좋게", why: "할인을 작게 · 1개당 마진 크게 · 마감 7일", days: 7, outcome: null };
  if (affordable(b, 10)) profit.outcome = outcome(b, profitDeal, easyTarget(outcome(b, profitDeal, 1).pledged, 0.9));
  else profit.note = "10%만 할인해도 원가보다 낮아져요";

  // 📦 예상 결제 수량이 최소 생산 수량 이상이 되는 가장 작은 할인. 목표 = 그만큼 결제되려면 필요한 신청
  const moq: Scenario = { key: "moq", title: "최소 생산 수량 꼭 채우기", why: "마진이 줄어도 만들 수 있는 수량부터 · 마감 7일", days: 7, outcome: null };
  if (b.moq == null) moq.note = "최소 생산 수량을 넣으면 계산해요";
  else {
    const target = pledgesNeeded(b.moq);
    const pct = DISCOUNT_STEPS.find((p) => affordable(b, p) && outcome(b, dealPriceFor(b.listPrice, p), target).reached);
    if (pct != null) moq.outcome = outcome(b, dealPriceFor(b.listPrice, pct), target);
    else moq.note = `초대 ${b.invited}명으로는 ${b.moq}개 결제가 어려워 보여요. 최소 생산 수량을 줄이거나 관심 고객이 더 모인 뒤 열어 보세요`;
  }
  return [fast, profit, moq];
}

/** 할인율별 예상 이익(원가를 모르면 매출) — 그래프용. 목표 수량은 그대로 둔다 */
export function curve(b: ScenarioBase, targetQty: number): Outcome[] {
  return DISCOUNT_STEPS.map((p) => outcome(b, dealPriceFor(b.listPrice, p), targetQty));
}
