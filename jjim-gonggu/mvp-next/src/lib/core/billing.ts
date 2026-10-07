// 요금제와 성공 수수료. 수수료는 확정 결제액(결제 완료분)에만 붙고, 미달로 진행 안 된 공구는 0원.

export type Plan = "trial" | "starter" | "growth";

export const PLANS: Record<Plan, { monthlyFee: number; feeRate: number; campaignsPerMonth: number | null; label: string }> = {
  trial: { monthlyFee: 0, feeRate: 0.03, campaignsPerMonth: 1, label: "체험" },
  starter: { monthlyFee: 29_000, feeRate: 0.015, campaignsPerMonth: 3, label: "스타터" },
  growth: { monthlyFee: 79_000, feeRate: 0.01, campaignsPerMonth: null, label: "그로스" },
};

export function successFee(plan: Plan, confirmedRevenue: number): number {
  return Math.round(confirmedRevenue * PLANS[plan].feeRate);
}

export function canOpenAnother(plan: Plan, openedThisMonth: number): boolean {
  const cap = PLANS[plan].campaignsPerMonth;
  return cap === null || openedThisMonth < cap;
}
