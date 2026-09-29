import { DESTINATIONS, lineOf } from './rules';
import type { Train } from './types';

export function tripLabel(endsAt?: number, closed?: boolean) {
  if (closed) return '여행 끝';
  if (!endsAt) return '';
  const left = endsAt - Date.now();
  if (left <= 0) return '여행 도착';
  // 막차 여행은 하룻밤, 예전 사진 열차는 7일
  if (left < 86400000) return `도착까지 ${untilLabel(endsAt)}`;
  return `여행 D-${Math.ceil(left / 86400000)}`;
}

/** 이 기기 시계 기준 HH:MM (한국 시간 기기에서는 KST) */
export function clock(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 남은 시간: 2시간 14분 · 14분 · 곧 */
export function untilLabel(at: number, now = Date.now()) {
  const min = Math.ceil((at - now) / 60000);
  if (min <= 0) return '곧';
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}시간 ${min % 60}분` : `${h}시간`;
}

/** 도착 시각 말: 오늘 07:30 · 내일 아침 07:30 */
export function arrivalLabel(at: number, now = Date.now()) {
  const a = new Date(at);
  const n = new Date(now);
  const sameDay = a.toDateString() === n.toDateString();
  const tomorrow = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toDateString() === a.toDateString();
  const part = a.getHours() < 12 ? '아침' : a.getHours() < 18 ? '낮' : '저녁';
  return sameDay ? `오늘 ${clock(at)}` : tomorrow ? `내일 ${part} ${clock(at)}` : `${a.getMonth() + 1}월 ${a.getDate()}일 ${clock(at)}`;
}

/** 받침에 맞는 조사: josa('도시락', '을', '를') → '도시락을' */
export function josa(word: string, withFinal: string, withoutFinal: string) {
  const c = word.charCodeAt(word.length - 1);
  const hasFinal = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

export function trainDestination(train: Train) {
  const line = lineOf(train.line);
  if (line) return { id: line.id as string, emoji: line.emoji as string, name: line.name as string };
  if (train.drift) return { id: 'drift', emoji: '🍃', name: '떠돌이' };
  return DESTINATIONS.find((d) => d.id === train.destinationId) ?? DESTINATIONS[0];
}
