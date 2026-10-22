// 공구 조건 시나리오 · 예상 결과 공식 (#125)

import { describe, expect, it } from "vitest";
import { ASSUME, baseRate, curve, dealPriceFor, mallRatesFrom, outcome, poissonAtLeast, scenarios, targetForMoq, value, type ScenarioBase } from "@/lib/core/scenario";

// 접시 4P: 정가 52,000원 · 공급가 21,000원 · 장바구니 1,000명(알림 신청 0)
const base: ScenarioBase = { listPrice: 52000, costPrice: 21000, moq: null, perMemberLimit: 2, audience: { alert: 0, cart: 1000, reachable: 1000 } };

describe("기본 재료", () => {
  it("공구가는 500원 단위로 반올림하고 늘 정가보다 낮다", () => {
    expect(dealPriceFor(52000, 25)).toBe(39000);
    expect(dealPriceFor(129000, 35)).toBe(84000);
    expect(dealPriceFor(52000, 0)).toBe(51500);
  });

  it("신청률 기본값은 알림 신청 10% · 장바구니 5%를 인원 비율로 섞는다", () => {
    expect(baseRate(base)).toEqual({ rate: ASSUME.cartRate, from: "default" });
    expect(baseRate({ ...base, audience: { alert: 100, cart: 100, reachable: 150 } }).rate).toBeCloseTo(0.075);
  });

  it("포아송 꼬리 확률: 평균보다 훨씬 낮은 목표는 거의 1, 훨씬 높으면 거의 0, 큰 평균에서도 넘치지 않는다", () => {
    expect(poissonAtLeast(50, 0)).toBe(1);
    expect(poissonAtLeast(50, 20)).toBeGreaterThan(0.999);
    expect(poissonAtLeast(50, 100)).toBeLessThan(0.001);
    expect(poissonAtLeast(5, 5)).toBeCloseTo(0.5595, 3);
    expect(poissonAtLeast(5000, 4900)).toBeGreaterThan(0.9);
  });
});

describe("예상 결과", () => {
  it("목표는 신청 기준: 목표가 낮을수록 성사 가능성이 높고, 할인이 클수록 예상 신청이 늘어난다", () => {
    const low = outcome(base, 41500, 20, 5), high = outcome(base, 41500, 120, 5);
    expect(low.reachProb).toBeGreaterThan(high.reachProb);
    expect(outcome(base, 31000, 20, 5).expectedPledged).toBeGreaterThan(low.expectedPledged);
    expect(low.expectedPledged).toBe(Math.round(1000 * 0.05 * 1.2)); // 20% 할인 · 5일 · 1.2개
  });

  it("못 채울 것 같아도 0으로 뚝 떨어지지 않고, 성사 가능성 × 성사되면 이익이 기대 이익", () => {
    const o = outcome(base, 41500, 70, 5);
    expect(o.reachProb).toBeGreaterThan(0);
    expect(o.reachProb).toBeLessThan(1);
    expect(o.expectedProfit).toBe(Math.round(o.reachProb * o.ifReached.profit!));
    expect(o.ifReached.paid).toBe(Math.floor(o.ifReached.pledged * ASSUME.payRate));
    expect(o.ifReached.pledged).toBeGreaterThanOrEqual(70);
  });

  it("최소 생산 수량만큼 만들어 남는 재고는 원가만큼 손해로 본다", () => {
    const o = outcome({ ...base, moq: 200 }, 41500, 40, 5);
    expect(o.ifReached.produce).toBe(200);
    expect(o.ifReached.leftover).toBe(200 - o.ifReached.paid);
    expect(o.ifReached.profit).toBe(o.ifReached.paid * 41500 - 200 * 21000);
    expect(o.moqMet).toBe("no");
  });

  it("원가를 모르면 이익은 비우고 기대 매출로 고른다", () => {
    const o = outcome({ ...base, costPrice: null }, 41500, 40, 5);
    expect(o.expectedProfit).toBeNull();
    expect(value(o)).toBe(o.expectedRevenue);
  });

  it("신청률 가정(보수적 · 기대)과 모집 기간이 결과에 반영된다", () => {
    const mid = outcome(base, 41500, 60, 5);
    expect(outcome({ ...base, level: "low" }, 41500, 60, 5).reachProb).toBeLessThan(mid.reachProb);
    expect(outcome({ ...base, level: "high" }, 41500, 60, 5).reachProb).toBeGreaterThan(mid.reachProb);
    expect(outcome(base, 41500, 60, 7).expectedPledged).toBeGreaterThan(outcome(base, 41500, 60, 3).expectedPledged);
  });

  it("1인 평균 수량은 1인 최대 수량을 넘지 않는다", () => {
    expect(outcome({ ...base, perMemberLimit: 1 }, 41500, 10, 5).expectedPledged).toBe(Math.round(1000 * 0.05));
  });

  it("할인율별 그래프는 12칸이고 목표를 못 채워도 매끄럽게 바뀐다", () => {
    const pts = curve(base, 80, 5);
    expect(pts).toHaveLength(12);
    expect(pts.filter((p) => p.reachProb > 0 && p.reachProb < 1).length).toBeGreaterThan(3);
  });
});

describe("시나리오 3가지", () => {
  it("💰 이익 최대는 모든 후보 중 기대 이익이 가장 크고, 원가보다 낮은 공구가는 고르지 않는다", () => {
    const best = scenarios(base)[1];
    expect(best.key).toBe("best");
    expect(best.outcome!.days).toBe(7);
    for (const pct of [5, 10, 20, 30, 40]) {
      const deal = dealPriceFor(52000, pct), e = outcome(base, deal, 2, 7).expectedPledged;
      for (const k of [0.6, 0.8, 1, 1.2]) expect(value(best.outcome!)).toBeGreaterThanOrEqual(value(outcome(base, deal, Math.max(2, Math.round(e * k)), 7)));
    }
    expect(best.outcome!.dealPrice).toBeGreaterThan(21000);
  });

  it("⚡ 빠르게 많이 모으기: 마감 3일, 손해 없이 기대 판매 수량이 가장 크고, 수익 최대보다 할인이 크거나 같다", () => {
    const [fast, best] = scenarios(base);
    expect(fast.key).toBe("fast");
    expect(fast.outcome!.days).toBe(3);
    expect(value(fast.outcome!)).toBeGreaterThanOrEqual(0);
    expect(fast.outcome!.discountPct).toBeGreaterThanOrEqual(best.outcome!.discountPct);
  });

  it("목표는 1인 최대 수량 · 2개 이상, 예상 신청의 60~120% 안에서 고른다 (몇 개만 모여도 진행하는 목표 1개는 추천하지 않는다)", () => {
    for (const s of scenarios(base)) if (s.outcome) {
      expect(s.outcome.targetQty).toBeGreaterThanOrEqual(2);
      const e = outcome(base, s.outcome.dealPrice, 2, s.outcome.days).expectedPledged;
      expect(s.outcome.targetQty).toBeGreaterThanOrEqual(Math.round(e * 0.6));
    }
  });

  it("📦 최소 생산 수량: 목표가 그만큼 결제되려면 필요한 신청 이상이고 성사 가능성 50% 이상, 없으면 이유", () => {
    const b = { ...base, moq: 30 };
    expect(targetForMoq(b)).toBe(50);
    const moq = scenarios(b)[2];
    expect(moq.outcome!.targetQty).toBeGreaterThanOrEqual(50);
    expect(moq.outcome!.reachProb).toBeGreaterThanOrEqual(0.5);
    expect(moq.outcome!.moqMet).toBe("sure");
    expect(scenarios(base)[2].note).toMatch(/최소 생산 수량을 넣으면/);
    expect(scenarios({ ...b, moq: 5000 })[2].note).toMatch(/어려워/);
  });

  it("원가가 정가에 가까우면 이유를 적고 추천하지 않는다", () => {
    const tight = scenarios({ ...base, costPrice: 51800 });
    expect(tight[1].outcome).toBeNull();
    expect(tight[1].note).toMatch(/원가/);
  });
});

describe("이 쇼핑몰의 지난 공구 실측", () => {
  const past = { invitedSent: 200, invitedPledgers: 20, pledgers: 20, pledgedQty: 30, couponIssued: 20, paidMembers: 15, discountPct: 20, days: 5 };
  it("할인 20% · 5일 기준으로 맞춘 신청률 · 결제율 · 1인 평균 수량", () => {
    expect(mallRatesFrom([past])).toEqual({ pledgeRate: 0.1, payRate: 0.75, avgQty: 1.5, campaigns: 1 });
    // 40% 할인으로 잰 10%는 20% 기준으로 5%
    expect(mallRatesFrom([{ ...past, discountPct: 40 }])!.pledgeRate).toBeCloseTo(0.05);
  });
  it("초대가 30명 미만이면 쓰지 않는다", () => expect(mallRatesFrom([{ ...past, invitedSent: 20 }])).toBeNull());
  it("실측이 있으면 기본값 대신 쓴다", () => {
    const h = mallRatesFrom([past])!;
    expect(baseRate({ ...base, history: h })).toEqual({ rate: 0.1, from: "mall" });
    expect(outcome({ ...base, history: h }, 41500, 10, 5).ifReached.paid).toBe(Math.floor(outcome({ ...base, history: h }, 41500, 10, 5).ifReached.pledged * 0.75));
  });
});
