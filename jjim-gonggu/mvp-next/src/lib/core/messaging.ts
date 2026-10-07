// 광고성 문자 규칙 (정보통신망법 제50조): 수신동의자에게만, (광고) 표기, 수신거부 안내, 21시~08시 발송 금지.
// 시스템이 강제한다 — 판매자가 끌 수 없다.

const KST_OFFSET_MS = 9 * 3_600_000;
export const NIGHT_START_HOUR = 21;
export const NIGHT_END_HOUR = 8;

function kstHour(d: Date): number {
  return new Date(d.getTime() + KST_OFFSET_MS).getUTCHours();
}

export function isNightKst(d: Date): boolean {
  const h = kstHour(d);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

/** 야간이면 다음 08:00 KST로 미룬 시각, 아니면 그대로. */
export function nextAllowedSendTime(d: Date): Date {
  if (!isNightKst(d)) return d;
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const target = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), NIGHT_END_HOUR, 0, 0));
  if (kst.getUTCHours() >= NIGHT_START_HOUR) target.setUTCDate(target.getUTCDate() + 1);
  return new Date(target.getTime() - KST_OFFSET_MS);
}

export interface AdMessageInput {
  mallName: string;
  body: string;
  optOutNumber: string; // 무료 수신거부 번호
}

/** 광고 문자 본문: 맨 앞 (광고)+발신 몰 이름, 끝에 무료수신거부 안내를 강제로 붙인다. */
export function formatAdMessage({ mallName, body, optOutNumber }: AdMessageInput): string {
  const clean = body.replace(/^\s*\(광고\)\s*/, "").trim();
  return `(광고)${mallName}\n${clean}\n무료수신거부 ${optOutNumber}`;
}

export type SendDecision =
  | { send: true; at: Date }
  | { send: false; reason: "no_consent" };

export function decideSend(opts: { isAd: boolean; smsConsent: boolean; now: Date }): SendDecision {
  if (opts.isAd && !opts.smsConsent) return { send: false, reason: "no_consent" };
  return { send: true, at: opts.isAd ? nextAllowedSendTime(opts.now) : opts.now };
}
