// 공구 조건 시나리오 · 예상 결과 공식 (#125)

import { describe, expect, it } from "vitest";
import {
  ASSUME, DISCOUNT_STEPS, baseRate, curve, dealPriceFor, discountOf, mallRatesFrom, outcome, poissonAtLeast, scenarios, sold, surePaid, targetForMoq, value,
  type MallRates, type PastCampaign, type ScenarioBase,
} from "@/lib/core/scenario";

// 접시 4P: 정가 52,000원 · 공급가 21,000원 · 장바구니 1,000명(알림 신청 0)
const base: ScenarioBase = { listPrice: 52000, costPrice: 21000, moq: null, perMemberLimit: 2, audience: { alert: 0, cart: 1000, reachable: 1000 } };
const FIXTURES: [string, ScenarioBase][] = [
  ["기본", base],
  ["원가 모름", { ...base, costPrice: null }],
  ["최소 생산 30", { ...base, moq: 30 }],
  ["관심 고객 적음", { ...base, audience: { alert: 20, cart: 60, reachable: 60 } }],
  ["지난 공구 실측", { ...base, history: { pledgeRate: 0.1, payRate: 0.75, avgQty: 1.5, campaigns: 2 } }],
  ["비싼 이불", { listPrice: 129000, costPrice: 52000, moq: 10, perMemberLimit: 2, audience: { alert: 0, cart: 200, reachable: 120 } }],
];
/** 시나리오가 고를 수 있는 후보 (scenario.ts의 candidates와 같은 범위) */
const grid = (b: ScenarioBase, days: number) => DISCOUNT_STEPS.filter((p) => b.costPrice == null || dealPriceFor(b.listPrice, p) > b.costPrice).flatMap((p) => {
  const deal = dealPriceFor(b.listPrice, p), lo = Math.max(2, b.perMemberLimit), e = outcome(b, deal, lo, days).expectedPledged;
  return [6, 7, 8, 9, 10, 11, 12].map((k) => outcome(b, deal, Math.max(lo, Math.round((e * k) / 10)), days));
});

describe("기본 재료", () => {
  it("공구가는 반올림하고 늘 정가보다 낮다. 싼 상품은 단위를 줄여 할인 단계가 겹치지 않는다", () => {
    expect(dealPriceFor(52000, 25)).toBe(39000);
    expect(dealPriceFor(129000, 35)).toBe(84000);
    expect(dealPriceFor(52000, 0)).toBe(51500);
    expect(dealPriceFor(3000, 10)).toBe(2700);
    expect(dealPriceFor(800, 50)).toBe(400);
    expect(new Set(DISCOUNT_STEPS.map((p) => dealPriceFor(3000, p))).size).toBe(DISCOUNT_STEPS.length);
    expect(discountOf(1000, 1200)).toBe(0); // 정가보다 비싸면 할인 0%로 (음수 아님)
  });

  it("신청률 기본값은 알림 신청 10% · 장바구니 5%를 인원 비율로 섞는다", () => {
    expect(baseRate(base)).toEqual({ rate: ASSUME.cartRate, from: "default" });
    expect(baseRate({ ...base, audience: { alert: 100, cart: 100, reachable: 150 } }).rate).toBeCloseTo(0.075);
  });

  it("포아송 꼬리 확률: 평균보다 훨씬 낮은 목표는 거의 1, 훨씬 높으면 거의 0, 큰 평균에서도 넘치지 않는다", () => {
    expect(poissonAtLeast(50, 0)).toBe(1);
    expect(poissonAtLeast(0, 3)).toBe(0);
    expect(poissonAtLeast(50, 20)).toBeGreaterThan(0.999);
    expect(poissonAtLeast(50, 100)).toBeLessThan(0.001);
    expect(poissonAtLeast(5, 5)).toBeCloseTo(0.5595, 3);
    expect(poissonAtLeast(5000, 4900)).toBeGreaterThan(0.9);
  });

  it("결제가 90% 확률로 넘는 수량은 평균보다 여유를 둔다", () => {
    expect(surePaid(167, 0.6)).toBe(Math.floor(167 * 0.6 - ASSUME.moqZ * Math.sqrt(167 * 0.6 * 0.4)));
    expect(surePaid(167, 0.6)).toBeLessThan(100);
    expect(surePaid(0, 0.6)).toBe(0);
  });
});

describe("예상 결과", () => {
  it("목표는 신청 기준: 목표가 낮을수록 성사 가능성이 높고, 할인이 클수록 예상 신청이 늘어난다", () => {
    const low = outcome(base, 41500, 20, 5), high = outcome(base, 41500, 120, 5);
    expect(low.reachProb).toBeGreaterThan(high.reachProb);
    expect(outcome(base, 31000, 20, 5).expectedPledged).toBeGreaterThan(low.expectedPledged);
    expect(low.expectedPledged).toBe(Math.round(1000 * 0.05 * 1.2)); // 20% 할인 · 5일 · 1.2개
  });

  it("못 채울 것 같아도 0으로 뚝 떨어지지 않고, 성사되면 신청은 목표 이상", () => {
    const o = outcome(base, 41500, 70, 5);
    expect(o.reachProb).toBeGreaterThan(0);
    expect(o.reachProb).toBeLessThan(1);
    expect(o.ifReached.pledged).toBeGreaterThanOrEqual(70);
    expect(o.ifReached.paid).toBeGreaterThanOrEqual(o.minPaid);
  });

  it("기대 이익은 신청률 경우마다 따로 계산해 더한다 (최소 생산 수량 때문에 남는 재고가 평균에 묻히지 않게)", () => {
    const o = outcome({ ...base, moq: 60 }, 41500, 40, 5);
    // 손으로 계산: 20% 할인 · 5일 → 신청 인원 1000 × 5% = 50명(보통). 낮을 때 30명 · 보통 50명 · 높을 때 70명
    // 목표 40개 = 34명(1.2개씩). 성사되면 신청 max(인원 × 1.2, 40) = 40 · 60 · 84개 → 결제 60%: 24 · 36 · 50개
    // 만드는 수량은 셋 다 최소 생산 60개 → 이익 = 결제 × 41,500 − 60 × 21,000
    const cases = [[30, 24], [50, 36], [70, 50]].map(([n, paid]) => ({ p: poissonAtLeast(n, 34) / 3, profit: paid * 41500 - 60 * 21000 }));
    expect(cases[0].profit).toBeLessThan(0); // 신청이 적은 경우엔 남는 재고 때문에 손해
    expect(o.expectedProfit).toBe(Math.round(cases.reduce((x, c) => x + c.p * c.profit, 0)));
    expect(o.reachProb).toBeCloseTo(cases.reduce((x, c) => x + c.p, 0), 10);
    expect(o.ifReached.produce).toBe(60);
  });

  it("최소 생산 수량: sure(목표만큼만 모여도 90%) · likely(성사되면 평균으로는) · no · 모르면 null", () => {
    expect(outcome(base, 41500, 50, 5).moqMet).toBeNull();
    const t = targetForMoq({ ...base, moq: 30 })!;
    expect(outcome({ ...base, moq: 30 }, 41500, t, 5).moqMet).toBe("sure");
    const likely = outcome({ ...base, moq: 40 }, 41500, 40, 5);
    expect(likely.moqMet).toBe("likely");
    expect(likely.minPaid).toBe(24);
    expect(likely.ifReached.paid).toBeGreaterThanOrEqual(40);
    expect(outcome({ ...base, moq: 500 }, 41500, 40, 5).moqMet).toBe("no");
  });

  it("원가를 모르면 이익은 비우고 기대 매출로 고른다", () => {
    const o = outcome({ ...base, costPrice: null }, 41500, 40, 5);
    expect(o.expectedProfit).toBeNull();
    expect(o.ifReached.profit).toBeNull();
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

  it("관심 고객이 0명이면 성사 가능성 0, '-0원' 없이 0", () => {
    const o = outcome({ ...base, moq: 100, audience: { alert: 0, cart: 0, reachable: 0 } }, 41500, 10, 5);
    expect(o.reachProb).toBe(0);
    expect(Object.is(o.expectedProfit, -0)).toBe(false);
    expect(Object.is(o.expectedRevenue, -0)).toBe(false);
  });

  it("할인율별 그래프는 공구가가 같은 단계를 하나로 묶고, 목표를 못 채워도 매끄럽게 바뀐다", () => {
    const pts = curve(base, 80, 5);
    expect(pts).toHaveLength(12);
    expect(new Set(pts.map((p) => p.o.dealPrice)).size).toBe(pts.length);
    expect(pts.filter((p) => p.o.reachProb > 0 && p.o.reachProb < 1).length).toBeGreaterThan(3);
  });
});

describe("시나리오 3가지", () => {
  it.each(FIXTURES)("%s: 💰 최대는 7일 후보 중 기대 값이 가장 크고, 원가보다 낮은 공구가 · 성사 가능성 30% 미만은 고르지 않는다", (_, b) => {
    const best = scenarios(b)[1];
    expect(best.key).toBe("best");
    if (!best.outcome) return expect(best.note).toBeTruthy();
    expect(best.outcome.days).toBe(7);
    expect(best.outcome.reachProb).toBeGreaterThanOrEqual(ASSUME.minReach);
    expect(value(best.outcome)).toBeGreaterThan(0);
    if (b.costPrice != null) expect(best.outcome.dealPrice).toBeGreaterThan(b.costPrice);
    for (const o of grid(b, 7)) if (o.reachProb >= ASSUME.minReach && value(o) > 0) expect(value(best.outcome)).toBeGreaterThanOrEqual(value(o));
  });

  it.each(FIXTURES)("%s: ⚡ 빠르게는 💰보다 덜 팔리지 않고, 손해 없는 조건 중 그 기간에서 가장 많이 팔린다", (_, b) => {
    const [fast, best] = scenarios(b);
    expect(fast.key).toBe("fast");
    if (!fast.outcome) return expect(fast.note).toBeTruthy();
    expect(value(fast.outcome)).toBeGreaterThan(0);
    expect(fast.outcome.reachProb).toBeGreaterThanOrEqual(ASSUME.minReach);
    if (best.outcome) expect(sold(fast.outcome)).toBeGreaterThanOrEqual(sold(best.outcome));
    for (const o of grid(b, fast.outcome.days)) if (o.reachProb >= ASSUME.minReach && value(o) > 0) expect(sold(fast.outcome)).toBeGreaterThanOrEqual(sold(o) - 1e-9);
  });

  it.each(FIXTURES)("%s: ⚡와 💰는 같은 조건을 두 번 보여 주지 않는다", (_, b) => {
    const [fast, best] = scenarios(b);
    if (fast.outcome && best.outcome) expect([fast.outcome.dealPrice, fast.outcome.targetQty, fast.outcome.days]).not.toEqual([best.outcome.dealPrice, best.outcome.targetQty, best.outcome.days]);
  });

  it("결제율이 낮아도 📦 목표는 끝까지 찾아 90% 여유를 지키고, 카드는 'sure'만 고른다", () => {
    const low = { ...base, moq: 30, history: { pledgeRate: 0.3, payRate: 0.05, avgQty: null, campaigns: 3 } as MallRates };
    const t = targetForMoq(low)!;
    expect(surePaid(t, 0.05)).toBeGreaterThanOrEqual(30);
    expect(t).toBeGreaterThan(30 * 20);
    const m = scenarios(low)[2];
    if (m.outcome) expect(m.outcome.moqMet).toBe("sure");
  });

  it("목표는 1인 최대 수량 · 2개 이상, 예상 신청의 60% 이상 (몇 개만 모여도 진행하는 목표는 추천하지 않는다)", () => {
    for (const s of scenarios(base)) if (s.outcome) {
      expect(s.outcome.targetQty).toBeGreaterThanOrEqual(2);
      const e = outcome(base, s.outcome.dealPrice, 2, s.outcome.days).expectedPledged;
      expect(s.outcome.targetQty).toBeGreaterThanOrEqual(Math.round(e * 0.6));
    }
  });

  it("📦 최소 생산 수량: 목표만큼만 모여도 90% 확률로 채우는 목표 이상 · 성사 가능성 50% 이상, 없으면 이유", () => {
    const b = { ...base, moq: 30 };
    const t = targetForMoq(b)!;
    expect(t).toBeGreaterThan(50); // 30 ÷ 60% = 50보다 여유를 둔다
    expect(surePaid(t, 0.6)).toBeGreaterThanOrEqual(30);
    expect(surePaid(t - 1, 0.6)).toBeLessThan(30);
    const moq = scenarios(b)[2];
    expect(moq.outcome!.targetQty).toBeGreaterThanOrEqual(t);
    expect(moq.outcome!.reachProb).toBeGreaterThanOrEqual(0.5);
    expect(moq.outcome!.moqMet).toBe("sure");
    expect(scenarios(base)[2].note).toMatch(/최소 생산 수량을 넣으면/);
    expect(scenarios({ ...b, moq: 5000 })[2].note).toMatch(/어려워/);
  });

  it("이익을 내며 성사될 조건이 없으면 💰 · ⚡를 비우고 이유를 적는다 (성사 가능성 0%짜리를 추천하지 않는다)", () => {
    const weak = scenarios({ listPrice: 30000, costPrice: 12000, moq: 100, perMemberLimit: 2, audience: { alert: 100, cart: 200, reachable: 300 } });
    expect(weak[1].outcome).toBeNull();
    expect(weak[1].note).toMatch(/어려워/);
    expect(weak[0].outcome).toBeNull();
    const nobody = scenarios({ ...base, audience: { alert: 0, cart: 0, reachable: 0 } });
    expect(nobody.every((s) => s.outcome == null)).toBe(true);
  });

  it("원가가 정가에 가까우면 이유를 적고 추천하지 않는다", () => {
    const tight = scenarios({ ...base, costPrice: 51800 });
    expect(tight[1].outcome).toBeNull();
    expect(tight[1].note).toMatch(/원가/);
  });

  it("원가를 모르면 '매출 최대'로 고르고 이익은 비운다", () => {
    const s = scenarios({ ...base, costPrice: null });
    expect(s[1].title).toBe("매출 최대");
    expect(s[1].outcome!.expectedProfit).toBeNull();
    expect(s.every((x) => x.outcome == null || x.outcome.ifReached.profit == null)).toBe(true);
  });
});

describe("이 쇼핑몰의 지난 공구 실측", () => {
  const past: PastCampaign = { invitedSent: 200, invitedPledgers: 20, pledgers: 20, pledgedQty: 30, couponIssued: 20, paidMembers: 15, discountPct: 20, days: 5, forPay: true };
  it("할인 20% · 5일 기준으로 맞춘 신청률 · 결제율 · 1인 평균 수량", () => {
    expect(mallRatesFrom([past])).toEqual({ pledgeRate: 0.1, payRate: 0.75, avgQty: 1.5, campaigns: 1 });
    expect(mallRatesFrom([{ ...past, discountPct: 40 }])!.pledgeRate).toBeCloseTo(0.05); // 40% 할인으로 잰 10%는 20% 기준으로 5%
    expect(mallRatesFrom([{ ...past, days: 7 }])!.pledgeRate).toBeCloseTo(0.1 / 1.12);
  });
  it("여러 공구는 초대 인원으로 가중하고, 초대 문자가 안 나간 공구는 신청률에서 뺀다", () => {
    const r = mallRatesFrom([{ ...past, invitedSent: 100, invitedPledgers: 5 }, { ...past, invitedSent: 300, invitedPledgers: 45 }])!;
    expect(r.pledgeRate).toBeCloseTo(50 / 400);
    expect(mallRatesFrom([past, { ...past, invitedSent: 0, invitedPledgers: 0 }])!.campaigns).toBe(1);
    expect(mallRatesFrom([{ ...past, invitedPledgers: 0 }])!.pledgeRate).toBe(0.005);
  });
  it("결제율은 결제 기간이 끝난 공구만 · 쿠폰 10명 이상, 1인 평균은 신청 10명 이상일 때만", () => {
    expect(mallRatesFrom([{ ...past, forPay: false }])!.payRate).toBeNull(); // '그래도 진행'이나 결제 기간 중인 공구
    expect(mallRatesFrom([{ ...past, couponIssued: 5, paidMembers: 5 }])!.payRate).toBeNull();
    expect(mallRatesFrom([{ ...past, pledgers: 5, pledgedQty: 9 }])!.avgQty).toBeNull();
  });
  it("초대가 30명 미만이면 쓰지 않는다", () => expect(mallRatesFrom([{ ...past, invitedSent: 20 }])).toBeNull());
  it("실측이 있으면 신청률 · 결제율 · 1인 평균이 예상과 목표에 반영된다", () => {
    const h: MallRates = { pledgeRate: 0.1, payRate: 0.75, avgQty: 1.5, campaigns: 1 };
    const hb = { ...base, history: h };
    expect(baseRate(hb)).toEqual({ rate: 0.1, from: "mall" });
    expect(outcome(hb, 41500, 10, 5).expectedPledged).toBe(Math.round(1000 * 0.1 * 1.5));
    expect(outcome(base, 41500, 10, 5).expectedPledged).toBe(Math.round(1000 * 0.05 * 1.2));
    expect(outcome(hb, 41500, 40, 5).minPaid).toBe(30);
    expect(targetForMoq({ ...hb, moq: 30 })!).toBeLessThan(targetForMoq({ ...base, moq: 30 })!);
    expect(scenarios(hb)[1].outcome!.targetQty).toBeGreaterThan(scenarios(base)[1].outcome!.targetQty);
    // 결제율 · 1인 평균을 잴 수 없었으면 기본값
    const partial = { ...base, history: { ...h, payRate: null, avgQty: null } };
    expect(outcome(partial, 41500, 50, 5).minPaid).toBe(30);
    expect(outcome(partial, 41500, 10, 5).expectedPledged).toBe(Math.round(1000 * 0.1 * 1.2));
  });
});
