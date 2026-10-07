// 시간 규칙은 모두 한국 시간(KST, UTC+9) 기준이다. 엔진은 Clock을 주입받아 데모·테스트에서 시간을 앞으로 돌릴 수 있다.

const KST_OFFSET_MS = 9 * 3_600_000;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export interface Clock { now(): Date }

export const systemClock: Clock = { now: () => new Date() };

export interface ManualClock extends Clock {
  set(d: Date): void;
  advance(ms: number): void;
}

/** 데모·테스트용: 직접 앞으로 돌리는 시계 */
export function manualClock(start: Date): ManualClock {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    set: (d) => { t = d.getTime(); },
    advance: (ms) => { t += ms; },
  };
}

/** 데모용: 실제 시간과 함께 흐르되, 앞으로 당길 수 있는 시계 */
export function offsetClock(): ManualClock {
  let offset = 0;
  return {
    now: () => new Date(Date.now() + offset),
    set: (d) => { offset = d.getTime() - Date.now(); },
    advance: (ms) => { offset += ms; },
  };
}

function kstParts(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), day: k.getUTCDate(), h: k.getUTCHours(), min: k.getUTCMinutes() };
}

export const kstHour = (d: Date) => kstParts(d).h;

/** KST 날짜 문자열 YYYY-MM-DD */
export const kstDate = (d: Date) => new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** 화면 표시용: 10/12(월) 14:00 */
export function fmtKst(d: Date | string | null | undefined): string {
  if (!d) return "–";
  const p = kstParts(typeof d === "string" ? new Date(d) : d);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(p.y, p.m, p.day)).getUTCDay()];
  return `${p.m + 1}/${p.day}(${wd}) ${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
