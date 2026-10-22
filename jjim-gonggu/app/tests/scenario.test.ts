// 공구 조건 시나리오 · 예상 결과 공식 (#125)

import { describe, expect, it } from "vitest";
import { curve, dealPriceFor, outcome, pledgeRate, scenarios } from "@/lib/core/scenario";

const base = { listPrice: 52000, costPrice: 21000, moq: 30, invited: 1000 };

describe("예상 결과", () => {
  it("초대 → 신청은 할인 20%에서 5%, 할인에 비례하고 3~15% 사이", () => {
    expect(pledgeRate(20)).toBeCloseTo(0.05);
    expect(pledgeRate(40)).toBeCloseTo(0.1);
    expect(pledgeRate(5)).toBe(0.03);
    expect(pledgeRate(90)).toBe(0.15);
  });

  it("공구가는 500원 단위로 반올림하고 늘 정가보다 낮다", () => {
    expect(dealPriceFor(52000, 25)).toBe(39000);
    expect(dealPriceFor(52000, 0)).toBe(51500);
  });

  it("목표를 채우면 신청의 60%가 결제, 최소 생산 수량만큼 만들고 남는 재고는 원가만큼 손해", () => {
    const o = outcome(base, 41500, 40); // 20% 할인 → 신청 50개
    expect(o).toMatchObject({ discountPct: 20, pledged: 50, reached: true, paid: 30, revenue: 30 * 41500, produce: 30, leftover: 0, moqMet: true });
    expect(o.profit).toBe(30 * 41500 - 30 * 21000);
    const small = outcome({ ...base, moq: 50 }, 41500, 40);
    expect(small).toMatchObject({ produce: 50, leftover: 20, moqMet: false });
    expect(small.profit).toBe(30 * 41500 - 50 * 21000);
  });

  it("목표를 못 채우면 진행되지 않아 결제 · 매출 · 이익이 0", () => {
    expect(outcome(base, 41500, 60)).toMatchObject({ reached: false, paid: 0, revenue: 0, produce: 0, profit: 0 });
  });

  it("원가 · 최소 생산 수량을 모르면 이익 · 달성 여부는 비워 둔다", () => {
    expect(outcome({ ...base, costPrice: null, moq: null }, 41500, 40)).toMatchObject({ profit: null, marginPerUnit: null, moqMet: null });
  });

  it("할인율별 그래프는 12칸", () => expect(curve(base, 40)).toHaveLength(12));
});

describe("시나리오 3가지", () => {
  it("빠르게: 할인 크게 · 목표 낮게(예상 신청의 70%) · 3일, 수익률: 10% 할인 · 7일", () => {
    const [fast, profit] = scenarios(base);
    expect(fast).toMatchObject({ key: "fast", days: 3 });
    expect(fast.outcome).toMatchObject({ discountPct: 35, reached: true });
    expect(fast.outcome!.targetQty).toBe(Math.floor(fast.outcome!.pledged * 0.7));
    expect(profit.outcome).toMatchObject({ discountPct: 10, reached: true });
    expect(profit.outcome!.marginPerUnit!).toBeGreaterThan(fast.outcome!.marginPerUnit!);
  });

  it("최소 생산 수량: 예상 결제가 그 수량 이상이 되는 가장 작은 할인, 목표는 그만큼 결제되려면 필요한 신청", () => {
    const moq = scenarios(base)[2];
    expect(moq.outcome).toMatchObject({ targetQty: 50, reached: true, moqMet: true });
    expect(moq.outcome!.discountPct).toBe(20); // 1000명 × 5% = 50개 신청 → 30개 결제
  });

  it("원가보다 낮게는 추천하지 않고, 안 되면 이유를 적는다", () => {
    const tight = scenarios({ ...base, costPrice: 50000 });
    expect(tight[0].outcome).toBeNull();
    expect(tight[0].note).toMatch(/원가/);
    expect(scenarios({ ...base, moq: null })[2].note).toMatch(/최소 생산 수량을 넣으면/);
    expect(scenarios({ ...base, invited: 50 })[2].note).toMatch(/어려워/);
  });
});
