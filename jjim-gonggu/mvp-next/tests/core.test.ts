import { describe, expect, it } from "vitest";
import { canExtend, hasErrors, judge, settleIfDue, validateCampaignInput, type CampaignInput } from "@/lib/core/campaign";
import { canCancel, checkPledge, expectedConfirmed, summarize } from "@/lib/core/pledge";
import { decideSend, formatAdMessage, isNightKst, nextAllowedSendTime } from "@/lib/core/messaging";
import { canOpenAnother, successFee } from "@/lib/core/billing";

const now = new Date("2026-10-06T03:00:00Z"); // KST 12:00
const h = (n: number) => new Date(now.getTime() + n * 3_600_000);

const base: CampaignInput = {
  productNo: 101, targetQty: 100, dealPrice: 40_000, listPrice: 50_000, costPrice: 25_000,
  deadlineAt: h(72), payWindowHours: 72, perMemberLimit: 2, shipEta: h(72 + 72 + 24 * 14),
};

describe("공구 개설 검증", () => {
  it("정상 입력은 통과", () => expect(validateCampaignInput(base, now)).toEqual([]));
  it("공구가가 정가 이상이면 오류", () => expect(hasErrors(validateCampaignInput({ ...base, dealPrice: 50_000 }, now))).toBe(true));
  it("원가 미만은 경고만", () => {
    const issues = validateCampaignInput({ ...base, dealPrice: 20_000 }, now);
    expect(hasErrors(issues)).toBe(false);
    expect(issues[0]).toMatchObject({ field: "dealPrice", level: "warning" });
  });
  it("마감이 24시간 안이면 오류", () => expect(hasErrors(validateCampaignInput({ ...base, deadlineAt: h(5) }, now))).toBe(true));
  it("출고일이 결제 기간 전이면 오류", () => expect(hasErrors(validateCampaignInput({ ...base, shipEta: h(80) }, now))).toBe(true));
});

describe("마감 판정", () => {
  it("마감 전에는 목표를 채워도 open", () => expect(judge("open", 150, 100, h(1), now)).toBe("open"));
  it("마감 후 달성", () => expect(judge("open", 100, 100, h(-1), now)).toBe("reached"));
  it("마감 후 미달", () => expect(judge("open", 99, 100, h(-1), now)).toBe("failed"));
  it("결제 기간이 끝나면 settled", () => {
    expect(settleIfDue("reached", h(-71), 72, now)).toBe("reached");
    expect(settleIfDue("reached", h(-72), 72, now)).toBe("settled");
  });
  it("연장은 한 번만, 사유 필수", () => {
    expect(canExtend("open", false, h(10), h(34), "", now)).toMatch(/사유/);
    expect(canExtend("open", true, h(10), h(34), "원단 입고 지연", now)).toMatch(/한 번/);
    expect(canExtend("open", false, h(10), h(34), "원단 입고 지연", now)).toBeNull();
  });
});

describe("참여 신청", () => {
  const c = { campaignState: "open" as const, deadlineAt: h(5), perMemberLimit: 2, memberExistingQty: 0, qty: 1, now };
  it("정상", () => expect(checkPledge(c)).toBeNull());
  it("1인 한도 초과", () => expect(checkPledge({ ...c, memberExistingQty: 2 })).toBe("limit"));
  it("마감 후 거부", () => expect(checkPledge({ ...c, deadlineAt: h(-1) })).toBe("closed"));
  it("마감 전 취소만", () => {
    expect(canCancel("pledged", "open", h(1), now)).toBe(true);
    expect(canCancel("pledged", "reached", h(-1), now)).toBe(false);
  });
  it("확정 수량은 결제 완료분만", () => {
    const s = summarize([
      { state: "paid", qty: 2, paidAmount: 80_000 },
      { state: "coupon_issued", qty: 1 },
      { state: "cancelled", qty: 1 },
      { state: "expired", qty: 1 },
    ]);
    expect(s).toEqual({ pledged: 4, confirmedQty: 2, cancelled: 1, expired: 1, unpaid: 1, revenue: 80_000 });
    expect(expectedConfirmed(100, 10)).toBe(60);
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
  it("수신 미동의자에게 광고 문자 금지", () => {
    expect(decideSend({ isAd: true, smsConsent: false, now })).toEqual({ send: false, reason: "no_consent" });
    expect(decideSend({ isAd: false, smsConsent: false, now }).send).toBe(true);
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
