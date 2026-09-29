import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { PlayKind } from './types';

/**
 * 오감 놀이 3종 (기획서 v0.4~). 시간 제한 없이 놀고, 만족 게이지를 채우면 티켓 1장.
 * 게이지는 손길(누르기·늘리기·숨·색칠)로 차고, 보통 1분 안팎의 조작이면 찬다.
 */
export const PLAYS: Record<
  PlayKind,
  { name: string; senses: string; blurb: string; luggage: string; emoji: string; tint: string; soft: string; route: `/play/${PlayKind}` }
> = {
  squish: {
    name: '말랑볼 조물조물',
    senses: '촉각 + 청각',
    blurb: '말랑볼을 쭉 늘리고 꾹 누르고, 키캡을 딸깍',
    luggage: '말랑 베개',
    emoji: '🧸',
    tint: '#E98AA2',
    soft: '#FDE4EC',
    route: '/play/squish',
  },
  noodle: {
    name: '면치기 숨쉬기',
    senses: '후각 + 미각',
    blurb: '면을 후루룩 들이쉬고, 생일 초를 끄듯 후~',
    luggage: '도시락',
    emoji: '🍱',
    tint: '#E0A23B',
    soft: '#FDF1D8',
    route: '/play/noodle',
  },
  color: {
    name: '창밖 색 채우기',
    senses: '시각',
    blurb: '보이는 색, 오늘 마음의 색으로 창밖을 칠하기',
    luggage: '스케치북',
    emoji: '🎨',
    tint: '#4FA98A',
    soft: '#DDF2E6',
    route: '/play/color',
  },
};

export const PLAY_ORDER: PlayKind[] = ['squish', 'noodle', 'color'];

/** 만족 게이지 만점 */
export const GAUGE_FULL = 100;

/** 이 시간 동안 손길이 없으면 쉰 시간을 세지 않는다 */
const IDLE_MS = 5000;

/** 서버 play_sessions.id용 uuid v4 */
export function newId() {
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  h[12] = '4';
  h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  const j = (a: number, b: number) => h.slice(a, b).join('');
  return `${j(0, 8)}-${j(8, 12)}-${j(12, 16)}-${j(16, 20)}-${j(20, 32)}`;
}

/**
 * 실제로 만지거나 숨 쉬는 시간만 센다. ping()이 올 때마다 직전 손길과의 간격을 더하고,
 * 5초 넘게 비면 그 간격은 버린다. 누르고 있는 동안처럼 이어지는 동작은 짧은 간격으로 ping한다.
 */
export function useActiveTime() {
  const total = useRef(0);
  const last = useRef<number | null>(null);
  const [ms, setMs] = useState(0);

  const ping = useCallback(() => {
    const now = Date.now();
    if (last.current !== null) {
      const gap = now - last.current;
      if (gap <= IDLE_MS) total.current += gap;
    }
    last.current = now;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setMs(total.current), 1000);
    // 앱을 벗어나면 그 사이 시간은 세지 않는다
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') last.current = null;
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  return { ping, get: useCallback(() => total.current, []), ms };
}

/** 쉰 시간 표시: 42초 · 3분 12초 · 1시간 5분 */
export function restLabel(ms: number) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  if (min < 60) return sec % 60 ? `${min}분 ${sec % 60}초` : `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}
