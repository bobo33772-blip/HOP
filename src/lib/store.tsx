import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { MOCK_COMMENTS, nextMockPassenger } from './mock';
import { PLAY_ORDER } from './play';
import { FAST_DEV, GROWTH_RULES, RULES, SCHEDULE, STAGE_ORDER, XP, dayKey, destinationFor, kstDayKey, levelFor, lineOf, nextDepartureAt, stageOf, type Growth, type GrowthRules, type LineId, type TrainLine } from './rules';
import type { SlotId } from './room';
import type { Avatar, Crew, Passenger, Photo, PlayKind, Profile, ReportReason, Sticker, Ticket, Train } from './types';

import './storage-polyfill';

const STORAGE_KEY = 'rollroll.state.v1';

export type Schedule = { lastTrain: string; travelMinutes: number; minPlaySeconds: number };

/** 로컬 모드에서만 쓰는 놀이 기록 (서버 모드에서는 play_sessions) */
type LocalPlay = { id: string; kind: PlayKind; startedAt: number; activeMs: number; filled: boolean; detail?: Record<string, unknown> };

export type State = {
  profile: Profile | null;
  films: { day: string; used: number };
  photos: Photo[];
  trains: Train[];
  crews: Crew[];
  friends: string[];
  /** 내가 차단한 사용자 */
  blocked: string[];
  /** 방금 출발한 열차 — 출발 연출 화면을 띄운다 */
  celebrate: string | null;
  /** 방금 성장한 단계 — 성장 연출을 띄운다 */
  evolved: Profile['stage'] | null;
  /** 서버 app_settings.dev_tools — 테스트 도구 노출 여부 */
  devTools: boolean;
  /** 하루 필름 수 (서버 모드에서는 app_settings 값) */
  filmsPerDay: number;
  /** 최근 3일의 내 쉼 티켓 */
  tickets: Ticket[];
  /** 쉰 시간: 이번 막차까지(지난 막차 이후) · 전체 */
  rest: { cycleMs: number; totalMs: number };
  /** 다음 막차 출발 시각 */
  nextDeparture: number;
  /** 막차 · 여행 · 놀이 설정 (서버 모드에서는 app_settings 값) */
  schedule: Schedule;
  plays: LocalPlay[];
  /** 성장: 다녀온 여행 · 성장에 쓰는 쉰 시간(분, 하루 상한) · 함께 탄 말랑볼 */
  growth: Growth;
  growthRules: GrowthRules;
  /** 오늘 밤 노선별 탑승 인원 */
  tonightLines: Partial<Record<TrainLine, number>>;
};

export const initial: State = {
  profile: null,
  films: { day: dayKey(), used: 0 },
  photos: [],
  trains: [],
  crews: [],
  friends: [],
  blocked: [],
  celebrate: null,
  evolved: null,
  devTools: false,
  filmsPerDay: RULES.filmsPerDay,
  tickets: [],
  rest: { cycleMs: 0, totalMs: 0 },
  nextDeparture: nextDepartureAt(),
  schedule: { ...SCHEDULE },
  plays: [],
  growth: { trips: 0, restMinutes: 0, riders: 0 },
  growthRules: { ...GROWTH_RULES },
  tonightLines: {},
};

export type Action =
  | { type: 'hydrate'; state: State }
  | { type: 'createProfile'; nickname: string; avatar: Avatar; birthYear: number }
  | { type: 'takePhoto'; uri: string | number; readyAt: number; baked?: boolean }
  /** 놀이 기록. 시작할 때 · 게이지가 찼을 때(filled) · 나갈 때(final) 같은 session으로 보낸다 */
  | { type: 'recordPlay'; session: string; kind: PlayKind; activeMs: number; filled: boolean; detail?: Record<string, unknown>; final?: boolean }
  /** 오늘 기분(노선)을 고르고 오늘 밤 막차 타기 (티켓 1장 이상, 출발 전까지 바꿀 수 있다) */
  | { type: 'boardTonight'; line: LineId }
  /** 친구 크루에게 내 노선 보여주기 */
  | { type: 'setShareLine'; on: boolean }
  | { type: 'tick'; now: number }
  | { type: 'react'; trainId: string; seat: number; sticker: Sticker }
  | { type: 'comment'; trainId: string; seat: number; body: string }
  | { type: 'poke'; trainId: string; userId: string }
  | { type: 'report'; trainId: string; userId: string; photoId?: string; reason: ReportReason }
  | { type: 'block'; userId: string }
  | { type: 'setRoom'; slot: SlotId; itemId: string }
  | { type: 'deleteAccount' }
  | { type: 'toggleRideAgain'; trainId: string; userId: string }
  | { type: 'closeTrip'; trainId: string }
  | { type: 'dismissCelebrate' }
  | { type: 'dismissEvolved' }
  /** 테스트 도구: 내 열차를 지금 막차로 출발시키고 2분 뒤 도착 */
  | { type: 'devDepartNow' }
  | { type: 'devReset' };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** 경험치는 기록만 (성장은 withGrowth가 정한다) */
function withXp(state: State, gain: number): State {
  if (!state.profile) return state;
  return { ...state, profile: { ...state.profile, xp: state.profile.xp + gain } };
}

/** 로컬 모드 성장: 다녀온 여행 · 하루 상한을 둔 쉰 시간 · 함께 탄 말랑볼 (서버 growth_stats와 같은 기준) */
function withGrowth(state: State): State {
  if (!state.profile) return state;
  const mine = state.trains.filter((t) => isMine(t));
  const trips = mine.filter((t) => t.status === 'arrived').length;
  const perDay = new Map<string, number>();
  for (const p of state.plays) perDay.set(kstDayKey(p.startedAt), (perDay.get(kstDayKey(p.startedAt)) ?? 0) + p.activeMs);
  const cap = state.growthRules.restDailyCap * 60000;
  const restMinutes = Math.floor([...perDay.values()].reduce((a, ms) => a + Math.min(ms, cap), 0) / 60000);
  const riders = new Set(mine.filter((t) => t.status !== 'filling').flatMap((t) => t.seats.filter((p) => p && !p.isMe).map((p) => p!.userId))).size;
  const growth = { trips, restMinutes, riders };
  const next = stageOf(growth, state.growthRules);
  // 내려가지는 않는다
  const up = STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(state.profile.stage);
  return {
    ...state,
    growth,
    profile: up ? { ...state.profile, stage: next } : state.profile,
    evolved: up ? next : state.evolved,
  };
}

function seeded(dest: string, day: string, departsAt: number, count: number, line?: TrainLine): Train {
  const seats: (Passenger | null)[] = Array(RULES.seatsPerTrain).fill(null);
  const taken: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = nextMockPassenger(taken);
    taken.push(p.userId);
    seats[i] = { ...p, luggage: PLAY_ORDER.slice(0, 1 + (i % 3)) };
  }
  return { id: uid(), destinationId: dest, dayKey: day, seats, status: 'filling', createdAt: Date.now(), departsAt, line };
}

const isMine = (t: Train) => t.seats.some((p) => p?.isMe);

/** 다음 막차 시각을 맞춘다 (노선 열차는 탈 사람이 기분을 고를 때 생긴다) */
function ensureTrains(state: State): State {
  const next = nextDepartureAt(state.schedule.lastTrain);
  let trains = state.trains;
  // 예전 버전에서 모집 중이던 열차는 오늘 밤 막차로 함께 떠난다
  if (trains.some((t) => t.status === 'filling' && !t.departsAt)) {
    trains = trains.map((t) => (t.status === 'filling' && !t.departsAt ? { ...t, departsAt: next } : t));
  }
  // 승객이 가짜뿐인 빈 막차(예전 버전이 세워 둔 것)는 치운다
  trains = trains.filter((t) => !(t.status === 'filling' && !t.line && !isMine(t)));
  if (trains.length === state.trains.length && trains.every((t, i) => t === state.trains[i])) trains = state.trains;
  const today = dayKey();
  const films = state.films.day === today ? state.films : { day: today, used: 0 };
  if (trains === state.trains && films === state.films && next === state.nextDeparture) return state;
  return { ...state, trains, films, nextDeparture: next, rest: restFor(state.plays, next, state.rest.totalMs) };
}

function restFor(plays: LocalPlay[], next: number, totalMs: number) {
  const cycleMs = plays.filter((p) => p.startedAt > next - 86400000).reduce((a, p) => a + p.activeMs, 0);
  return { cycleMs, totalMs };
}

/** 내 자리의 짐 = 그 열차에 실린 내 티켓 */
function syncLuggage(state: State, trainId: string): State {
  const luggage = state.tickets.filter((t) => t.trainId === trainId).map((t) => t.kind);
  return {
    ...state,
    trains: state.trains.map((t) => (t.id === trainId ? { ...t, seats: t.seats.map((p) => (p?.isMe ? { ...p, luggage } : p)) } : t)),
  };
}

/** 이 막차 · 이 노선에 내 자리를 잡는다. 다른 노선에 타 있었으면 옮긴다 (출발 전까지) */
function seatMe(state: State, cycle: number, line: TrainLine): { state: State; trainId: string } | null {
  const me = state.profile;
  if (!me) return null;
  let s = state;
  const already = s.trains.find((t) => t.departsAt === cycle && isMine(t));
  if (already && (already.line === line || already.status !== 'filling' || line === 'drift')) return { state: s, trainId: already.id };
  if (already) {
    s = {
      ...s,
      trains: s.trains.map((t) => (t.id === already.id ? { ...t, seats: t.seats.map((p) => (p?.isMe ? null : p)) } : t)),
      tickets: s.tickets.map((t) => (t.trainId === already.id ? { ...t, trainId: undefined } : t)),
    };
  }
  const passenger: Passenger = { userId: me.id, nickname: me.nickname, animal: me.animal, color: me.color, isMe: true, mood: line === 'drift' ? undefined : line };
  const open = s.trains.find((t) => t.status === 'filling' && t.departsAt === cycle && t.line === line && t.seats.some((p) => p === null));
  if (open) {
    const seat = open.seats.findIndex((p) => p === null);
    const seats = open.seats.map((p, i) => (i === seat ? passenger : p));
    return { state: { ...s, trains: s.trains.map((t) => (t.id === open.id ? { ...t, seats } : t)) }, trainId: open.id };
  }
  // 새 노선 열차: 로컬 모드는 같은 기분의 가짜 승객 두 명과 함께
  const day = kstDayKey(cycle);
  const train = seeded(destinationFor(day).id, day, cycle, 2, line);
  train.seats[2] = passenger;
  return { state: { ...s, trains: [...s.trains, train] }, trainId: train.id };
}

function boardCycle(state: State, cycle: number, line: TrainLine): State {
  if (!state.tickets.some((t) => t.cycle === cycle)) return state;
  const seated = seatMe(state, cycle, line);
  if (!seated) return state;
  const next = {
    ...seated.state,
    tickets: seated.state.tickets.map((t) => (t.cycle === cycle && !t.trainId ? { ...t, trainId: seated.trainId } : t)),
  };
  return withLines(syncLuggage(next, seated.trainId));
}

/** 오늘 밤 노선별 인원 */
function withLines(state: State): State {
  const counts: Partial<Record<TrainLine, number>> = {};
  for (const t of state.trains) {
    if (t.status !== 'filling' || t.departsAt !== state.nextDeparture || !t.line) continue;
    counts[t.line] = (counts[t.line] ?? 0) + t.seats.filter(Boolean).length;
  }
  return { ...state, tonightLines: counts };
}

function depart(state: State, trainId: string, now: number): State {
  const arrive = now + state.schedule.travelMinutes * 60000;
  const trains = state.trains.map((t) =>
    t.id === trainId ? { ...t, status: 'departed' as const, departedAt: now, arrivesAt: arrive, endsAt: arrive } : t,
  );
  const train = trains.find((t) => t.id === trainId)!;
  const posts = train.seats.map((p, seat) => ({
    seat,
    reactions: p?.isMe ? {} : { '❤️': 1 + (seat % 3), '✨': seat % 2 },
    comments: p && !p.isMe ? [{ nickname: p.nickname, body: MOCK_COMMENTS[seat % MOCK_COMMENTS.length] }] : [],
  }));
  const crews = [...state.crews, { trainId, posts, pokesSent: [], rideAgain: [] }];
  return withXp({ ...state, trains, crews, celebrate: isMine(train) ? trainId : state.celebrate }, XP.trainDeparted);
}

/** 게이지를 채운 이 놀이 기록으로 티켓이 새로 나오는지 (서버 record_play와 같은 기준) */
function earns(state: State, a: Extract<Action, { type: 'recordPlay' }>) {
  const cur = state.plays.find((p) => p.id === a.session);
  const now = Date.now();
  const startedAt = cur?.startedAt ?? now;
  const activeMs = Math.min(Math.max(cur?.activeMs ?? 0, a.activeMs), now - startedAt + 5000);
  const filled = (cur?.filled ?? false) || a.filled;
  const has = state.tickets.some((t) => t.kind === a.kind && t.cycle === state.nextDeparture);
  return { startedAt, activeMs, filled, earn: filled && !has && activeMs >= state.schedule.minPlaySeconds * 1000, has };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return ensureTrains({ ...initial, ...action.state, schedule: { ...SCHEDULE, ...action.state.schedule } });

    case 'createProfile':
      return ensureTrains({
        ...state,
        profile: {
          id: uid(),
          nickname: action.nickname.trim(),
          ...action.avatar,
          xp: 0,
          stage: 'mallang',
          createdAt: Date.now(),
        },
      });

    case 'takePhoto': {
      const s = ensureTrains(state);
      if (s.films.used >= s.filmsPerDay) return s;
      const now = Date.now();
      const photo: Photo = {
        id: uid(),
        uri: action.uri,
        takenAt: now,
        readyAt: action.readyAt,
        status: 'developing',
        destinationId: destinationFor(kstDayKey(s.nextDeparture)).id,
      };
      return { ...s, films: { ...s.films, used: s.films.used + 1 }, photos: [photo, ...s.photos] };
    }

    case 'recordPlay': {
      const s = ensureTrains(state);
      const { startedAt, activeMs, filled, earn } = earns(s, action);
      const cur = s.plays.find((p) => p.id === action.session);
      const entry: LocalPlay = { id: action.session, kind: action.kind, startedAt, activeMs, filled, detail: action.detail ?? cur?.detail };
      const plays = [entry, ...s.plays.filter((p) => p.id !== action.session)].slice(0, 60);
      const totalMs = s.rest.totalMs + activeMs - (cur?.activeMs ?? 0);
      let next: State = { ...s, plays, rest: restFor(plays, s.nextDeparture, totalMs) };
      if (earn) {
        const mine = next.trains.find((t) => t.departsAt === s.nextDeparture && isMine(t));
        const ticket: Ticket = { id: uid(), kind: action.kind, cycle: s.nextDeparture, earnedAt: Date.now(), trainId: mine?.id, detail: entry.detail };
        next = withXp({ ...next, tickets: [...next.tickets, ticket] }, XP.ticket);
        if (mine) next = syncLuggage(next, mine.id);
      }
      return withGrowth(next);
    }

    case 'boardTonight': {
      const s = ensureTrains(state);
      if (!lineOf(action.line)) return s;
      return boardCycle(s, s.nextDeparture, action.line);
    }

    case 'setShareLine':
      return state.profile ? { ...state, profile: { ...state.profile, shareLine: action.on } } : state;

    case 'tick': {
      let next = ensureTrains(state);
      let changed = next !== state;
      const photos = next.photos.map((p) =>
        p.status === 'developing' && p.readyAt <= action.now ? { ...p, status: 'developed' as const } : p,
      );
      if (photos.some((p, i) => p !== next.photos[i])) {
        next = { ...next, photos };
        changed = true;
      }
      // 가짜 승객 합류: 내가 탄 막차에 빈칸이 있으면 가끔 한 명씩 (서버에서는 3단계 NPC 승객)
      if (FAST_DEV) {
        for (const t of next.trains) {
          if (t.status !== 'filling' || !isMine(t) || Math.random() > 0.35) continue;
          const seat = t.seats.findIndex((p) => p === null);
          if (seat < 0) continue;
          const taken = t.seats.filter(Boolean).map((p) => p!.userId);
          const seats = t.seats.map((p, i) => (i === seat ? { ...nextMockPassenger(taken), luggage: ['squish' as const] } : p));
          next = { ...next, trains: next.trains.map((x) => (x.id === t.id ? { ...x, seats } : x)) };
          changed = true;
        }
      }
      // 막차: 짐을 챙긴 채 탑승을 깜빡했으면 태우고, 막차 시각이 된 열차는 모두 출발
      for (const t of next.trains) {
        if (t.status !== 'filling' || !t.departsAt || t.departsAt > action.now) continue;
        next = boardCycle(next, t.departsAt, 'drift');
        const train = next.trains.find((x) => x.id === t.id)!;
        next = train.seats.some(Boolean) ? depart(next, t.id, action.now) : { ...next, trains: next.trains.filter((x) => x.id !== t.id) };
        changed = true;
      }
      // 도착: 서로 또 타요를 고른 사람끼리 친구
      for (const t of next.trains) {
        if (t.status === 'departed' && t.arrivesAt && t.arrivesAt <= action.now) {
          next = reducer(next, { type: 'closeTrip', trainId: t.id });
          changed = true;
        }
      }
      return changed ? next : state;
    }

    case 'react':
      return {
        ...state,
        crews: state.crews.map((c) => {
          if (c.trainId !== action.trainId) return c;
          return {
            ...c,
            posts: c.posts.map((p) => {
              if (p.seat !== action.seat) return p;
              const reactions = { ...p.reactions };
              if (p.myReaction) reactions[p.myReaction] = Math.max(0, (reactions[p.myReaction] ?? 1) - 1);
              if (p.myReaction === action.sticker) return { ...p, reactions, myReaction: undefined };
              reactions[action.sticker] = (reactions[action.sticker] ?? 0) + 1;
              return { ...p, reactions, myReaction: action.sticker };
            }),
          };
        }),
      };

    case 'comment': {
      const me = state.profile;
      if (!me) return state;
      return {
        ...state,
        crews: state.crews.map((c) =>
          c.trainId !== action.trainId
            ? c
            : {
                ...c,
                posts: c.posts.map((p) =>
                  p.seat !== action.seat
                    ? p
                    : { ...p, comments: [...p.comments.filter((x) => !x.mine), { nickname: me.nickname, body: action.body, mine: true }] },
                ),
              },
        ),
      };
    }

    case 'report':
      // 로컬 모드에는 운영자가 없으니 기록만 하지 않는다
      return state;

    case 'deleteAccount':
      return ensureTrains({ ...initial });

    case 'setRoom':
      return state.profile
        ? { ...state, profile: { ...state.profile, room: { ...state.profile.room, [action.slot]: action.itemId } } }
        : state;

    case 'block':
      return state.blocked.includes(action.userId) ? state : { ...state, blocked: [...state.blocked, action.userId] };

    case 'poke':
      return {
        ...state,
        crews: state.crews.map((c) =>
          c.trainId === action.trainId && !c.pokesSent.includes(action.userId)
            ? { ...c, pokesSent: [...c.pokesSent, action.userId] }
            : c,
        ),
      };

    case 'toggleRideAgain':
      return {
        ...state,
        crews: state.crews.map((c) =>
          c.trainId !== action.trainId
            ? c
            : {
                ...c,
                rideAgain: c.rideAgain.includes(action.userId)
                  ? c.rideAgain.filter((u) => u !== action.userId)
                  : [...c.rideAgain, action.userId],
              },
        ),
      };

    case 'closeTrip': {
      // 서버에서는 도착할 때 모두의 선택을 한꺼번에 계산한다. 로컬에서는 가짜 승객이 절반 확률로 나를 골랐다고 가정.
      const crew = state.crews.find((c) => c.trainId === action.trainId);
      const trains = state.trains.map((t) => (t.id === action.trainId ? { ...t, status: 'arrived' as const } : t));
      if (!crew || crew.closed) return { ...state, trains };
      const mutual = crew.rideAgain.filter((u) => u.charCodeAt(u.length - 1) % 2 === 0 || u.startsWith('m-g'));
      const friends = Array.from(new Set([...state.friends, ...mutual]));
      let next: State = {
        ...state,
        friends,
        crews: state.crews.map((c) => (c.trainId === action.trainId ? { ...c, closed: true } : c)),
        trains,
      };
      next = withXp(next, XP.friend * (friends.length - state.friends.length));
      return withGrowth(next);
    }

    case 'dismissCelebrate':
      return { ...state, celebrate: null };
    case 'dismissEvolved':
      return { ...state, evolved: null };

    case 'devDepartNow': {
      const s = ensureTrains(state);
      const now = Date.now();
      const boarded = boardCycle(s, s.nextDeparture, 'drift');
      const mine = boarded.trains.find((t) => t.status === 'filling' && t.departsAt === s.nextDeparture && isMine(t));
      if (!mine) return s;
      // 이 열차의 막차 시각을 지금으로 당겨 오늘 밤 막차를 다시 비운다 (같은 날 여러 번 시험)
      let next: State = {
        ...boarded,
        trains: boarded.trains.map((t) => (t.id === mine.id ? { ...t, departsAt: now } : t)),
        tickets: boarded.tickets.map((t) => (t.trainId === mine.id ? { ...t, cycle: now } : t)),
      };
      next = depart(next, mine.id, now);
      const arrive = now + 2 * 60000;
      return { ...next, trains: next.trains.map((t) => (t.id === mine.id ? { ...t, arrivesAt: arrive, endsAt: arrive } : t)) };
    }

    case 'devReset':
      return ensureTrains({ ...initial, profile: state.profile });
  }
}

function load(): State | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}

function save(state: State) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패는 조용히 넘긴다 (다음 변경 때 다시 시도)
  }
}

export type DispatchResult = { readyAt?: number; ticket?: boolean; hasTicket?: boolean } | void;

/** link: 지금 익명 계정에 이메일 연결 / restore: 다른 기기의 계정 불러오기 */
export type AuthMode = 'link' | 'restore';

export type Account = { anonymous: boolean; email?: string };

export type Store = {
  state: State;
  /** 서버 모드에서만 존재 */
  account: Account | null;
  auth: {
    sendCode: (email: string, mode: AuthMode) => Promise<void>;
    verifyCode: (email: string, code: string, mode: AuthMode) => Promise<void>;
  } | null;
  ready: boolean;
  /** local: 기기 저장소 + 가짜 승객 / remote: Supabase */
  mode: 'local' | 'remote';
  error: string | null;
  dispatch: (a: Action) => Promise<DispatchResult>;
  retry: () => void;
};

export const StoreContext = createContext<Store | null>(null);

/** 서버 없이 도는 로컬 모드 */
export function LocalProvider({ children }: { children: ReactNode }) {
  // localStorage 폴리필은 동기라서 첫 렌더 전에 저장된 상태를 읽을 수 있다
  const [state, send] = useReducer(reducer, undefined, () => reducer(initial, { type: 'hydrate', state: load() ?? initial }));
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    const id = setInterval(() => send({ type: 'tick', now: Date.now() }), FAST_DEV ? 3000 : 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    save(state);
  }, [state]);

  const dispatch = useCallback(async (a: Action): Promise<DispatchResult> => {
    const before = latest.current;
    send(a);
    if (a.type === 'takePhoto') return { readyAt: a.readyAt };
    if (a.type === 'recordPlay') {
      const r = earns(before, a);
      return { ticket: r.earn, hasTicket: r.earn || r.has };
    }
  }, []);

  const value = useMemo<Store>(
    () => ({ state, account: null, auth: null, ready: true, mode: 'local', error: null, dispatch, retry: () => {} }),
    [state, dispatch],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** 1분마다 바뀌는 지금 시각 (여행 중 · 돌아옴 판단용) */
function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** 자주 쓰는 파생 값 */
export function useDerived() {
  const { state } = useStore();
  const now = useMinute();
  const next = state.nextDeparture;
  /** 오늘 밤 막차용 내 티켓 */
  const tonight = state.tickets.filter((t) => t.cycle === next);
  const ticketKinds = new Set(tonight.map((t) => t.kind));
  /** 오늘 밤 막차 중 내가 탄 열차 */
  const myTonight = state.trains.find((t) => t.departsAt === next && t.status === 'filling' && isMine(t));
  /** 내가 고른 오늘 노선 (탑승 전이면 없음) */
  const myLine = lineOf(myTonight?.line ?? myTonight?.seats.find((p) => p?.isMe)?.mood);
  /** 여행 중인 내 열차 (막차 열차만. 예전 7일 사진 열차는 크루 탭에서) */
  const traveling = state.trains
    .filter((t) => t.status === 'departed' && isMine(t) && t.arrivesAt && t.arrivesAt > now && t.departsAt)
    .sort((a, b) => (b.departedAt ?? 0) - (a.departedAt ?? 0))[0];
  /** 12시간 안에 돌아온 내 열차 */
  const returned = state.trains
    .filter((t) => t.status === 'arrived' && isMine(t) && t.arrivesAt && now - t.arrivesAt < 12 * 3600000)
    .sort((a, b) => (b.arrivesAt ?? 0) - (a.arrivesAt ?? 0))[0];
  const filmsLeft = Math.max(0, state.filmsPerDay - (state.films.day === dayKey() ? state.films.used : 0));
  const xp = state.profile?.xp ?? 0;
  return {
    nextDeparture: next,
    tonight,
    ticketKinds,
    ticketsMax: PLAY_ORDER.length,
    myTonight,
    myLine,
    traveling,
    returned,
    filmsLeft,
    level: levelFor(xp),
    xp,
  };
}
