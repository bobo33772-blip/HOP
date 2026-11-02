// 발주 결정 보조 1단계 (#133): 확정 수량을 최소 생산 수량 · 생산 메모와 맞춰 읽어 주는 규칙

import { describe, expect, it } from "vitest";
import { orderAdvice, type OrderInput } from "@/lib/core/order";

// 접시: 공구가 39,000원 · 정가 52,000원 · 원가 21,000원 · 가마 1회분 30개
const settled: OrderInput = { state: "settled", confirmedQty: 29, unpaidMembers: 12, payUntilText: null, moq: 30, costPrice: 21000, dealPrice: 39000, listPrice: 52000, note: "가마 11월 1회분 예약" };

describe("확정 뒤 (결제 기간 끝)", () => {
  it("확정 29개 · 최소 생산 30개 → 1개 모자람을 읽어 주고, 메모를 같이 보여 준다", () => {
    const a = orderAdvice(settled)!;
    expect(a.lines[0]).toBe("확정 29개예요. 결제하지 않은 손님 12명은 결제 기간이 끝나 이번 공구에서 빠졌어요.");
    expect(a.lines[1]).toBe("최소 생산 30개에서 1개 모자라요.");
    expect(a.lines[2]).toBe("적어 두신 생산 메모: “가마 11월 1회분 예약”");
  });

  it("선택지 2개: 확정 수량 그대로 · 최소 생산 수량으로 (남는 재고 · 원가 · 이익 함께)", () => {
    const [keep, moq] = orderAdvice(settled)!.options;
    expect(keep).toMatchObject({ key: "confirmed", qty: 29, label: "확정 29개로 발주 (최소 생산보다 적어요)", note: "확정 29개 그대로 · 메모: 가마 11월 1회분 예약" });
    expect(keep.detail).toEqual([`공구 이익 약 ${(29 * (39000 - 21000)).toLocaleString("ko-KR")}원`]);
    expect(moq).toMatchObject({ key: "moq", qty: 30, label: "최소 생산 30개로 발주 · 남는 1개는 정가로 판매" });
    expect(moq.note).toBe("최소 생산 30개 · 확정 29개, 남는 1개는 정가 판매 · 메모: 가마 11월 1회분 예약");
    expect(moq.detail).toEqual([
      "1개 남음 · 원가 21,000원",
      `공구 이익 약 ${(29 * 39000 - 30 * 21000).toLocaleString("ko-KR")}원`,
      "남는 1개를 정가로 다 팔면 +52,000원",
    ]);
  });

  it("최소 생산 수량을 채웠거나 넘었으면 선택지는 확정 수량 하나", () => {
    expect(orderAdvice({ ...settled, confirmedQty: 30 })!.lines[1]).toBe("최소 생산 30개에 딱 맞아요.");
    const over = orderAdvice({ ...settled, confirmedQty: 35 })!;
    expect(over.lines[1]).toBe("최소 생산 30개를 넘었어요.");
    expect(over.options.map((o) => o.key)).toEqual(["confirmed"]);
    expect(over.options[0].label).toBe("확정 35개로 발주");
  });

  it("최소 생산 수량 · 원가 · 메모를 모르면 그 부분만 빼고, 숫자를 지어내지 않는다", () => {
    const a = orderAdvice({ ...settled, moq: null, costPrice: null, note: "  ", unpaidMembers: 0 })!;
    expect(a.lines).toEqual(["확정 29개예요."]);
    expect(a.options).toHaveLength(1);
    expect(a.options[0]).toMatchObject({ qty: 29, note: "확정 29개 그대로", detail: [] });
  });

  it("원가가 공구가보다 높으면 손해로 적는다", () => {
    expect(orderAdvice({ ...settled, moq: null, costPrice: 40000 })!.options[0].detail).toEqual(["공구 이익 손해 29,000원"]);
  });

  it("확정 0개면 발주할 수량이 없다고 하고 선택지는 없다", () => {
    const a = orderAdvice({ ...settled, confirmedQty: 0 })!;
    expect(a.lines[0]).toMatch(/발주할 수량은 없어요/);
    expect(a.options).toEqual([]);
  });

  it("버튼이 채우는 근거는 300자(기록 한도) 안", () => {
    for (const o of orderAdvice({ ...settled, note: "가".repeat(100) })!.options) expect(o.note.length).toBeLessThanOrEqual(300);
  });
});

describe("결제 기간 중", () => {
  const paying: OrderInput = { ...settled, state: "reached", confirmedQty: 18, unpaidMembers: 12, payUntilText: "10/30(목) 14:00" };
  it("지금까지 결제 · 기다리는 손님 · 마감 · 최소 생산까지 남은 수량을 알려 주고, 기록 선택지는 없다", () => {
    const a = orderAdvice(paying)!;
    expect(a.lines).toEqual([
      "결제 기간 중이에요. 지금까지 결제 18개, 결제를 기다리는 손님 12명이에요(결제 마감 10/30(목) 14:00).",
      "최소 생산 30개까지 12개 남았어요.",
      "적어 두신 생산 메모: “가마 11월 1회분 예약”",
      "결제 마감이 지나면 확정 수량으로 발주를 정해요.",
    ]);
    expect(a.options).toEqual([]);
    expect(orderAdvice({ ...paying, confirmedQty: 31 })!.lines[1]).toBe("최소 생산 30개를 이미 채웠어요.");
  });
});

it("모집 중 · 진행 안 됨 · 취소된 공구는 보여 주지 않는다", () => {
  for (const state of ["open", "failed", "cancelled"]) expect(orderAdvice({ ...settled, state })).toBeNull();
});
