import { describe, expect, it } from "vitest";
import { hasErrors, validateCampaignInput, type CampaignInput } from "@/lib/core/campaign";
import { canCancel, checkPledge, expectedConfirmed } from "@/lib/core/pledge";
import { formatAdMessage, isNightKst, isValidOptOutNumber, nextAllowedSendTime } from "@/lib/core/messaging";
import { canOpenAnother, successFee } from "@/lib/core/billing";

const now = new Date("2026-10-06T03:00:00Z"); // KST 12:00
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);
const LIST = 50_000;

const base: CampaignInput = {
  productNo: 101, targetQty: 100, dealPrice: 40_000, costPrice: 25_000,
  deadlineAt: h(72), payWindowHours: 72, perMemberLimit: 2, shipEta: "2026-10-30",
};

describe("공구 개설 검증", () => {
  it("정상 입력은 통과", () => expect(validateCampaignInput(base, LIST, now)).toEqual([]));
  it("공구가가 정가 이상이면 오류", () => expect(hasErrors(validateCampaignInput({ ...base, dealPrice: 50_000 }, LIST, now))).toBe(true));
  it("원가 미만은 확인 체크가 있어야 열 수 있고, 그때는 경고로 남는다", () => {
    expect(hasErrors(validateCampaignInput({ ...base, dealPrice: 20_000 }, LIST, now))).toBe(true);
    const issues = validateCampaignInput({ ...base, dealPrice: 20_000, confirmBelowCost: true }, LIST, now);
    expect(hasErrors(issues)).toBe(false);
    expect(issues[0]).toMatchObject({ field: "dealPrice", level: "warning" });
  });
  it("마감이 24시간 안이면 오류", () => expect(hasErrors(validateCampaignInput({ ...base, deadlineAt: h(5) }, LIST, now))).toBe(true));
  it("결제 기간은 48·72시간만", () => {
    expect(hasErrors(validateCampaignInput({ ...base, payWindowHours: 48 }, LIST, now))).toBe(false);
    expect(hasErrors(validateCampaignInput({ ...base, payWindowHours: 24 }, LIST, now))).toBe(true);
  });
  it("1인 한도는 1~5개", () => expect(hasErrors(validateCampaignInput({ ...base, perMemberLimit: 6 }, LIST, now))).toBe(true));
  it("출고일이 마감 전이면 오류", () => expect(hasErrors(validateCampaignInput({ ...base, shipEta: "2026-10-08" }, LIST, now))).toBe(true));
});

describe("참여 신청", () => {
  const c = { campaignState: "open" as const, deadlineAt: h(5), perMemberLimit: 2, qty: 1, now };
  it("정상", () => expect(checkPledge(c)).toBeNull());
  it("1인 한도 초과", () => expect(checkPledge({ ...c, qty: 3 })).toBe("limit"));
  it("수량은 1 이상 정수", () => expect(checkPledge({ ...c, qty: 1.5 })).toBe("invalid_qty"));
  it("마감 후 거부", () => expect(checkPledge({ ...c, deadlineAt: h(-1) })).toBe("closed"));
  it("마감 전 취소만", () => {
    expect(canCancel("pledged", "open", h(1), now)).toBe(true);
    expect(canCancel("pledged", "reached", h(-1), now)).toBe(false);
  });
  it("예상 확정 수량은 결제분과 신청×60% 중 큰 값", () => {
    expect(expectedConfirmed(100, 10)).toBe(60);
    expect(expectedConfirmed(100, 70)).toBe(70);
  });
});

describe("광고 문자 규칙", () => {
  it("야간(KST 21~08시) 판정", () => {
    expect(isNightKst(new Date("2026-10-06T12:30:00Z"))).toBe(true); // 21:30
    expect(isNightKst(new Date("2026-10-06T22:59:00Z"))).toBe(true); // 07:59
    expect(isNightKst(new Date("2026-10-06T23:00:00Z"))).toBe(false); // 08:00
  });
  it("야간 발송은 다음날 08:00 KST로", () => {
    expect(nextAllowedSendTime(new Date("2026-10-06T12:30:00Z")).toISOString()).toBe("2026-10-06T23:00:00.000Z");
    expect(nextAllowedSendTime(new Date("2026-10-06T17:00:00Z")).toISOString()).toBe("2026-10-06T23:00:00.000Z"); // 02:00 KST
  });
  it("무료수신거부 번호 형식", () => {
    expect(isValidOptOutNumber("080-000-0000")).toBe(true);
    expect(isValidOptOutNumber("")).toBe(false);
  });
  it("(광고) 표기와 수신거부 안내 강제", () => {
    const m = formatAdMessage({ mallName: "도윤백", body: "(광고) 찜하신 숄더백 공구가 열렸어요", optOutNumber: "080-000-0000" });
    expect(m.startsWith("(광고)도윤백\n찜하신")).toBe(true);
    expect(m.endsWith("무료수신거부 080-000-0000")).toBe(true);
  });
});

describe("요금", () => {
  it("성공 수수료", () => expect(successFee("starter", 4_000_000)).toBe(60_000));
  it("체험은 월 1회", () => {
    expect(canOpenAnother("trial", 0)).toBe(true);
    expect(canOpenAnother("trial", 1)).toBe(false);
    expect(canOpenAnother("growth", 99)).toBe(true);
  });
});
