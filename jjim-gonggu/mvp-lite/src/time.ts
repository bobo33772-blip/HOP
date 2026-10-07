// 시간 규칙은 모두 한국 시간(KST, UTC+9) 기준이다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };

/** 데모·테스트에서 시간을 앞으로 돌릴 수 있는 시계 */
export function manualClock(start: Date) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    set: (d: Date) => { t = d.getTime(); },
    advance: (ms: number) => { t += ms; },
  };
}

export const HOUR = 60 * 60 * 1000;

function kstParts(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), day: k.getUTCDate(), h: k.getUTCHours(), min: k.getUTCMinutes() };
}

/** 광고성 문자 발송 금지 시간: 21:00 ~ 다음 날 08:00 (정보통신망법 제50조) */
export function isQuietHours(d: Date): boolean {
  const { h } = kstParts(d);
  return h >= 21 || h < 8;
}

/** 지금 보낼 수 없으면 가장 가까운 08:00 KST를 돌려준다 */
export function nextAllowedSendTime(d: Date): Date {
  if (!isQuietHours(d)) return d;
  const p = kstParts(d);
  const base = Date.UTC(p.y, p.m, p.day, 8, 0, 0) - KST_OFFSET_MS;
  return new Date(p.h >= 21 ? base + 24 * HOUR : base);
}

export function fmtKst(d: Date | string | null | undefined): string {
  if (!d) return '–';
  const x = typeof d === 'string' ? new Date(d) : d;
  const p = kstParts(x);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(p.y, p.m, p.day)).getUTCDay()];
  return `${p.m + 1}/${p.day}(${wd}) ${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}
