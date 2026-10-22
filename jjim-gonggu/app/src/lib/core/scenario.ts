// 공구 조건 시나리오 · 예상 결과 (#125). AI가 아니라 정해진 공식이다. 화면에는 늘 '예상'으로 보여 준다.
//
// 목표 수량은 앱의 판정 규칙 그대로 '신청 수량' 기준이다(마감 때 신청 ≥ 목표면 성사, judge.ts). 성사되면 신청의 일부만 결제한다.
//
// 1) 신청률(초대 1명이 신청할 비율): 할인 20% · 모집 5일 기준 알림 신청 고객 10%, 장바구니 고객 5%(기획서 기준값 5% 근처).
//    이 쇼핑몰에 끝난 공구가 있으면 그 실제 값(할인 · 기간을 20% · 5일 기준으로 맞춘 값)을 쓴다.
//    할인에 비례(20% → ×1, 40% → ×2, 0.6~3배 사이), 모집 기간이 길수록 조금 늘어난다(3일 ×0.88 · 5일 ×1 · 7일 ×1.12).
//    판매자가 고르는 가정(낮게 ×0.6 · 보통 · 높게 ×1.6)을 곱한다.
// 2) 1명이 평균 1.2개 신청(1인 한도 이하). 신청 → 결제 60%(EXPECTED_PAY_RATE). 지난 공구가 있으면 그 실제 값.
// 3) 성사 가능성: 신청 인원은 운에 따라 흔들리고(포아송), 신청률 자체도 예상보다 낮거나(×0.6) 높을(×1.4) 수 있어 셋을 같이 본다.
// 4) 성사되면: 결제 = 신청 × 결제율, 만드는 수량 = max(결제, 최소 생산 수량), 이익 = 결제 × 공구가 − 만드는 수량 × 원가.
//    성사 안 되면 만들지 않으니 매출 · 이익 0. 기대 이익 = 성사 가능성 × 성사되면 이익 → 시나리오는 이 값으로 고른다.

import { EXPECTED_PAY_RATE } from "./pledge";

export const ASSUME = {
  alertRate: 0.1, // 할인 20% · 5일, 알림 신청 고객의 신청률
  cartRate: 0.05, // 할인 20% · 5일, 장바구니 고객의 신청률
  baseDiscount: 20,
  avgQty: 1.2,
  payRate: EXPECTED_PAY_RATE,
  maxRate: 0.6, // 신청률 상한 (아무리 할인해도 초대받은 사람의 60%까지)
} as const;
export const LEVELS = { low: 0.6, mid: 1, high: 1.6 } as const;
export type Level = keyof typeof LEVELS;
export const DISCOUNT_STEPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
const SPREAD = [0.6, 1, 1.4]; // 신청률이 예상보다 낮을 때 · 보통 · 높을 때 (같은 무게)

/** 이 쇼핑몰의 지난 공구에서 잰 값. 없으면 기본 가정 */
export interface MallRates { pledgeRate: number; payRate: number | null; avgQty: number | null; campaigns: number }

export interface ScenarioBase {
  listPrice: number;
  costPrice: number | null;
  moq: number | null;
  perMemberLimit: number;
  audience: { alert: number; cart: number; reachable: number }; // reachable: 초대 문자를 받을 수 있는 인원
  history?: MallRates | null;
  level?: Level;
}

export interface Outcome {
  discountPct: number;
  dealPrice: number;
  targetQty: number;
  days: number;
  expectedPledged: number; // 예상 신청 수량 (보통일 때)
  reachProb: number; // 성사 가능성 0~1
  chance: "high" | "mid" | "low";
  ifReached: { pledged: number; paid: number; revenue: number; produce: number; leftover: number; profit: number | null };
  expectedRevenue: number;
  expectedProfit: number | null; // 원가를 모르면 null
  marginPerUnit: number | null;
  minPaid: number; // 신청이 목표만큼만 모였을 때의 결제 수량
  // 최소 생산 수량: sure 목표만큼만 모여도 채움 · likely 예상대로 모이면 채움 · no 성사돼도 못 채움 · null 모름
  moqMet: "sure" | "likely" | "no" | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const discountFactor = (pct: number) => clamp(pct / ASSUME.baseDiscount, 0.6, 3);
export const daysFactor = (days: number) => clamp(0.7 + 0.06 * days, 0.85, 1.2);

/** 정가 × (1 − 할인율)을 500원 단위로 반올림. 정가보다는 늘 낮게 */
export function dealPriceFor(listPrice: number, discountPct: number): number {
  const p = Math.round((listPrice * (1 - discountPct / 100)) / 500) * 500;
  return Math.max(500, Math.min(p, listPrice - 500));
}
export const discountOf = (listPrice: number, dealPrice: number) => (listPrice > 0 ? Math.round((1 - dealPrice / listPrice) * 100) : 0);

/** 할인 20% · 5일 기준 신청률: 지난 공구 실측, 없으면 알림 신청 · 장바구니 비율로 섞은 기본값 */
export function baseRate(b: ScenarioBase): { rate: number; from: "mall" | "default" } {
  if (b.history) return { rate: b.history.pledgeRate, from: "mall" };
  const { alert, cart } = b.audience;
  const share = alert + cart > 0 ? alert / (alert + cart) : 0;
  return { rate: share * ASSUME.alertRate + (1 - share) * ASSUME.cartRate, from: "default" };
}

export function payRateOf(b: ScenarioBase) { return b.history?.payRate ?? ASSUME.payRate; }
export function avgQtyOf(b: ScenarioBase) { return Math.max(1, Math.min(b.history?.avgQty ?? ASSUME.avgQty, b.perMemberLimit || 1)); }

/** P(포아송(λ) ≥ k). 큰 λ에서도 넘치지 않게 로그로 더한다 */
export function poissonAtLeast(lambda: number, k: number): number {
  if (k <= 0) return 1;
  if (!(lambda > 0)) return 0;
  let logp = -lambda, below = 0;
  for (let i = 0; i < k; i++) {
    if (i > 0) logp += Math.log(lambda) - Math.log(i);
    below += Math.exp(logp);
  }
  return clamp(1 - below, 0, 1);
}

/** 이 조건으로 열면 어떻게 될지 */
export function outcome(b: ScenarioBase, dealPrice: number, targetQty: number, days: number): Outcome {
  const discountPct = discountOf(b.listPrice, dealPrice);
  const avg = avgQtyOf(b), pay = payRateOf(b);
  const rate = clamp(baseRate(b).rate * discountFactor(discountPct) * daysFactor(days) * LEVELS[b.level ?? "mid"], 0, ASSUME.maxRate);
  const people = Math.max(0, b.audience.reachable) * rate;
  const needPeople = Math.ceil(Number((Math.max(1, targetQty) / avg).toFixed(6)));
  // 신청률이 낮을 때 · 보통 · 높을 때를 같은 무게로: 각 경우의 성사 확률과, 성사됐을 때의 신청 수량
  let reach = 0, pledgedIf = 0;
  for (const m of SPREAD) {
    const p = poissonAtLeast(people * m, needPeople) / SPREAD.length;
    reach += p;
    pledgedIf += p * Math.max(people * m * avg, targetQty);
  }
  pledgedIf = reach > 0 ? pledgedIf / reach : Math.max(targetQty, 0);
  const pledged = Math.round(pledgedIf);
  const paid = Math.floor(Number((pledged * pay).toFixed(6)));
  const produce = paid > 0 ? Math.max(paid, b.moq ?? 0) : 0;
  const profitIf = b.costPrice != null ? paid * dealPrice - produce * b.costPrice : null;
  const revenueIf = paid * dealPrice;
  return {
    discountPct, dealPrice, targetQty, days,
    expectedPledged: Math.round(people * avg),
    reachProb: reach,
    chance: reach >= 0.75 ? "high" : reach >= 0.4 ? "mid" : "low",
    ifReached: { pledged, paid, revenue: revenueIf, produce, leftover: produce - paid, profit: profitIf },
    expectedRevenue: Math.round(reach * revenueIf),
    expectedProfit: profitIf != null ? Math.round(reach * profitIf) : null,
    marginPerUnit: b.costPrice != null ? dealPrice - b.costPrice : null,
    minPaid: Math.floor(Number((Math.max(0, targetQty) * pay).toFixed(6))),
    moqMet: b.moq == null ? null : Math.floor(Number((Math.max(0, targetQty) * pay).toFixed(6))) >= b.moq ? "sure" : paid >= b.moq ? "likely" : "no",
  };
}

/** 기대 이익(원가를 모르면 기대 매출) — 시나리오를 고르는 기준 */
export const value = (o: Outcome) => o.expectedProfit ?? o.expectedRevenue;

export type ScenarioKey = "fast" | "best" | "moq";
export interface Scenario { key: ScenarioKey; title: string; why: string; outcome: Outcome | null; note?: string }

const affordable = (b: ScenarioBase, pct: number) => b.costPrice == null || dealPriceFor(b.listPrice, pct) > b.costPrice;

/** 목표 수량은 '이만큼은 모여야 진행한다'는 선이라 너무 낮게 잡지 않는다: 1인 최대 수량 · 2개 이상 */
export const minTarget = (b: ScenarioBase) => Math.max(2, b.perMemberLimit || 1);

/**
 * 할인율 × 목표 수량 후보. 목표는 예상 신청의 60~120%(그보다 낮으면 몇 개만 모여도 진행해 버려 의미가 없고,
 * 높으면 거의 성사되지 않는다)와 최소 생산 수량을 채우는 목표
 */
function candidates(b: ScenarioBase, days: number, extraTargets: number[] = []): Outcome[] {
  const out: Outcome[] = [];
  const lo = minTarget(b);
  for (const pct of DISCOUNT_STEPS) {
    if (!affordable(b, pct)) continue;
    const deal = dealPriceFor(b.listPrice, pct);
    const e = outcome(b, deal, lo, days).expectedPledged;
    const ts = new Set<number>(extraTargets.filter((t) => t >= lo));
    for (let k = 6; k <= 12; k++) ts.add(Math.max(lo, Math.round((e * k) / 10)));
    for (const t of ts) out.push(outcome(b, deal, t, days));
  }
  return out;
}
const top = (os: Outcome[], f: (o: Outcome) => number) => os.reduce<Outcome | null>((a, o) => (!a || f(o) > f(a) || (f(o) === f(a) && o.reachProb > a.reachProb) ? o : a), null);

/** 최소 생산 수량만큼 결제되려면 필요한 신청 수량(목표) */
export const targetForMoq = (b: ScenarioBase) => (b.moq ? Math.ceil(Number((b.moq / payRateOf(b)).toFixed(6))) : null);

/**
 * 시나리오 3가지 (판매자가 고르는 방향):
 * ⚡ 빠르게 많이 모으기: 마감 3일, 손해가 나지 않는 조건 중 기대 판매 수량(성사 가능성 × 결제 수량)이 가장 큰 것
 * 💰 수익 최대: 마감 7일, 기대 이익(원가를 모르면 기대 매출)이 가장 큰 것
 * 📦 최소 생산 수량 꼭 채우기: 마감 7일, 성사되면 최소 생산 수량만큼 결제되는 목표 중 성사 가능성 50% 이상에서 기대 이익이 가장 큰 것
 */
export function scenarios(b: ScenarioBase): Scenario[] {
  const money = b.costPrice != null ? "이익" : "매출";
  const tMoq = targetForMoq(b);
  const all3 = candidates(b, 3), all7 = candidates(b, 7, tMoq ? [tMoq] : []);
  const none = all7.length === 0 ? "원가가 정가에 가까워 할인할 여유가 없어요" : undefined;

  const sold = (o: Outcome) => o.reachProb * o.ifReached.paid;
  const fastPool = all3.filter((o) => value(o) >= 0);
  const fast: Scenario = { key: "fast", title: "빠르게 많이 모으기", why: `할인을 크게 · 마감 3일 · 손해 없이 가장 많이 팔리게`, outcome: top(fastPool, sold), note: none ?? (fastPool.length ? undefined : "손해 없이 열 수 있는 조건이 없어요") };

  const best: Scenario = { key: "best", title: `${money} 최대`, why: `기대 ${money}이 가장 큰 할인 · 목표 · 마감 7일`, outcome: top(all7, value), note: none };

  const moq: Scenario = { key: "moq", title: "최소 생산 수량 꼭 채우기", why: "마진이 줄어도 성사되면 최소 생산 수량만큼 결제되게 · 마감 7일", outcome: null };
  if (!tMoq) moq.note = "최소 생산 수량을 넣으면 계산해요";
  else {
    moq.outcome = top(all7.filter((o) => o.targetQty >= tMoq && o.reachProb >= 0.5), value);
    if (!moq.outcome) moq.note = none ?? `초대 ${b.audience.reachable}명으로는 ${b.moq}개 결제가 어려워 보여요. 최소 생산 수량을 줄이거나 관심 고객이 더 모인 뒤 열어 보세요`;
  }
  return [fast, best, moq];
}

/** 할인율별 기대 이익(원가를 모르면 기대 매출) — 그래프용. 목표 수량 · 기간은 그대로 둔다 */
export function curve(b: ScenarioBase, targetQty: number, days: number): Outcome[] {
  return DISCOUNT_STEPS.map((p) => outcome(b, dealPriceFor(b.listPrice, p), targetQty, days));
}

/** 끝난 공구들의 실측 → 할인 20% · 5일 기준 신청률 · 결제율 · 1인 평균 수량. 초대 30명 미만이면 쓰지 않는다 */
export interface PastCampaign { invitedSent: number; invitedPledgers: number; pledgers: number; pledgedQty: number; couponIssued: number; paidMembers: number; discountPct: number; days: number }
export function mallRatesFrom(past: PastCampaign[]): MallRates | null {
  const used = past.filter((c) => c.invitedSent > 0);
  const sent = used.reduce((a, c) => a + c.invitedSent, 0);
  if (sent < 30) return null;
  // 공구마다 할인 · 기간 효과를 빼서 20% · 5일 기준으로 맞춘 뒤 초대 인원으로 가중 평균
  const norm = used.reduce((a, c) => a + c.invitedPledgers / (discountFactor(c.discountPct) * daysFactor(c.days)), 0) / sent;
  const issued = past.reduce((a, c) => a + c.couponIssued, 0), paid = past.reduce((a, c) => a + c.paidMembers, 0);
  const pl = past.reduce((a, c) => a + c.pledgers, 0), q = past.reduce((a, c) => a + c.pledgedQty, 0);
  return {
    pledgeRate: clamp(norm, 0.005, ASSUME.maxRate),
    payRate: issued >= 10 ? clamp(paid / issued, 0.05, 1) : null,
    avgQty: pl >= 10 ? clamp(q / pl, 1, 5) : null,
    campaigns: used.length,
  };
}
