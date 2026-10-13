// 날짜·시간 표시 규칙 (#12): 모든 화면과 문자가 한 가지 모양 "M/D(요일) HH:mm", 한국 시간 고정.

import { describe, expect, it } from "vitest";
import { fmtKst } from "@/lib/time";
import { kst } from "@/app/console/format";

describe("날짜·시간 표시", () => {
  it("fmtKst: 2026-10-17T05:00Z → 10/17(토) 14:00, 빈 값은 –", () => {
    expect(fmtKst(new Date("2026-10-17T05:00:00Z"))).toBe("10/17(토) 14:00");
    expect(fmtKst("2026-10-17T05:00:00Z")).toBe("10/17(토) 14:00");
    expect(fmtKst(null)).toBe("–");
  });

  it("콘솔 화면의 kst는 fmtKst와 같은 모양을 쓴다 (보는 사람 PC 시간대와 무관)", () => {
    expect(kst("2026-10-17T05:00:00Z")).toBe("10/17(토) 14:00");
    expect(kst("2026-10-12T23:05:00Z")).toBe("10/13(화) 08:05");
    expect(kst(null)).toBe("–");
  });
});

describe("공구 상태 이름표 (#10)", () => {
  it("판매자 화면은 CHIP 한 곳의 이름을 쓴다: 모집 중 · 달성 · 결제 기간 · 진행 안 됨 · 확정 완료", async () => {
    const { CHIP } = await import("@/app/console/format");
    expect(Object.fromEntries(Object.entries(CHIP).map(([k, v]) => [k, v[0]]))).toEqual({
      open: "모집 중", reached: "달성 · 결제 기간", failed: "진행 안 됨", settled: "확정 완료",
    });
  });

  it("색: 달성 · 결제 기간은 주황(warn)이라 확정 완료(초록)와 구분된다, 진행 안 됨은 빨강", async () => {
    const { CHIP } = await import("@/app/console/format");
    expect(Object.fromEntries(Object.entries(CHIP).map(([k, v]) => [k, v[1]]))).toEqual({ open: "open", reached: "warn", failed: "bad", settled: "ok" });
  });
});
