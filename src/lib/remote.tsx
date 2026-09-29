import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { DESTINATIONS, GROWTH_RULES, RULES, SCHEDULE, dayKey, nextDepartureAt, type LineId, type Stage, type TrainLine } from './rules';
import { StoreContext, initial, type Account, type Action, type AuthMode, type DispatchResult, type State, type Store } from './store';
import { friendlyError } from './errors';
import { getPushToken } from './notify';
import { supabase } from './supabase';
import type { RoomLayout } from './room';
import type { AnimalId, Crew, Passenger, Photo, PlayKind, Sticker, Ticket, Train } from './types';
import type { BodyColorId } from '@/constants/theme';

const SEEN_KEY = 'rollroll.remote.seen.v1';
const POLL_MS = 15000;
const SIGNED_URL_TTL = 3600;

// ─────────────────────────── snapshot() 응답 형태
type SnapSeat = {
  seat: number;
  user_id: string;
  nickname: string;
  animal: AnimalId;
  color: BodyColorId;
  photo_path: string | null;
  photo_id: string | null;
  hidden: boolean;
  blocked: boolean;
  luggage?: PlayKind[];
  mood?: LineId | null;
  reactions: Partial<Record<Sticker, number>>;
  my_reaction: Sticker | null;
  comments: { nickname: string; body: string; mine: boolean }[];
};
type SnapTrain = {
  id: string;
  day: string;
  drift: boolean;
  status: Train['status'];
  created_at: string;
  departed_at: string | null;
  ends_at: string | null;
  departs_at?: string | null;
  arrives_at?: string | null;
  line?: TrainLine | null;
  dest: { name: string } | null;
  mine: boolean;
  seats: SnapSeat[];
  pokes_sent: string[];
  ride_again: string[];
};
type Snapshot = {
  now: string;
  next_departure?: string;
  tickets?: { id: string; kind: PlayKind; cycle: string; earned_at: string; train_id: string | null; detail: Record<string, unknown> | null }[];
  rest?: { cycle_ms: number; total_ms: number };
  growth?: { trips: number; rest_minutes: number; riders: number };
  tonight_lines?: Partial<Record<TrainLine, number>>;
  profile: { id: string; nickname: string; animal: AnimalId; color: BodyColorId; xp: number; stage: Stage; created_at: string; room?: RoomLayout; share_line?: boolean } | null;
  friends: string[];
  blocked: string[];
  destination: { name: string } | null;
  films_used: number;
  photos: { id: string; path: string; taken_at: string; ready_at: string; status: string; train_id: string | null }[];
  trains: SnapTrain[];
  settings: {
    films_per_day?: number;
    dev_tools?: boolean;
    last_train_time?: string;
    travel_minutes?: number;
    min_play_seconds?: number;
    rest_daily_cap_minutes?: number;
    banjjak_trips?: number;
    banjjak_rest_minutes?: number;
    rollroll_trips?: number;
    rollroll_rest_minutes?: number;
    rollroll_riders?: number;
  } | null;
};

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : undefined);
const destId = (name?: string) => DESTINATIONS.find((d) => d.name === name)?.id ?? 'sky';

function readSeen(): { departed: string[]; stage?: string } {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(SEEN_KEY) ?? '') as { departed: string[]; stage?: string };
  } catch {
    return { departed: [] };
  }
}
function writeSeen(v: { departed: string[]; stage?: string }) {
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify(v));
  } catch {
    // 다음 동기화 때 다시 저장
  }
}

async function readBytes(src: string | number): Promise<ArrayBuffer> {
  let uri = src;
  if (typeof uri === 'number') {
    const asset = Asset.fromModule(uri);
    await asset.downloadAsync();
    uri = asset.localUri ?? asset.uri;
  }
  if (Platform.OS === 'web' || /^(https?|blob|data):/.test(uri)) return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

export function RemoteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  /** 다른 기기 계정을 불러온 직후: 지난 출발·성장을 연출로 다시 띄우지 않는다 */
  const primeSeen = useRef(false);
  const urls = useRef(new Map<string, { url: string; at: number }>());
  const uidRef = useRef<string | null>(null);
  const busy = useRef(false);

  /** 사진 경로 → 서명 URL (50분 캐시) */
  const sign = useCallback(async (paths: string[]) => {
    const now = Date.now();
    const need = paths.filter((p) => {
      const hit = urls.current.get(p);
      return !hit || now - hit.at > (SIGNED_URL_TTL - 600) * 1000;
    });
    if (need.length && supabase) {
      const { data } = await supabase.storage.from('films').createSignedUrls(need, SIGNED_URL_TTL);
      data?.forEach((d) => d.signedUrl && d.path && urls.current.set(d.path, { url: d.signedUrl, at: now }));
    }
    return (p: string | null) => (p ? urls.current.get(p)?.url : undefined);
  }, []);

  const refresh = useCallback(async () => {
    // 로그인 전(익명 로그인 실패 등)에는 부르지 않는다 — 401만 쌓인다
    if (!supabase || !uidRef.current || busy.current) return;
    busy.current = true;
    try {
      const { data, error: err } = await supabase.rpc('snapshot');
      if (err) throw err;
      const snap = data as Snapshot;
      const paths = [...snap.photos.map((p) => p.path), ...snap.trains.flatMap((t) => t.seats.map((s) => s.photo_path).filter(Boolean) as string[])];
      const urlOf = await sign(paths);
      const now = ms(snap.now) ?? Date.now();
      const me = uidRef.current;

      const photos: Photo[] = snap.photos.map((p) => ({
        id: p.id,
        uri: urlOf(p.path) ?? '',
        takenAt: ms(p.taken_at)!,
        readyAt: ms(p.ready_at)!,
        status: p.status === 'boarded' ? 'boarded' : p.status === 'developed' || ms(p.ready_at)! <= now ? 'developed' : 'developing',
        destinationId: destId(snap.destination?.name),
        trainId: p.train_id ?? undefined,
      }));

      const trains: Train[] = snap.trains.map((t) => {
        const seats: (Passenger | null)[] = Array(RULES.seatsPerTrain).fill(null);
        for (const s of t.seats) {
          seats[s.seat - 1] = {
            userId: s.user_id,
            nickname: s.nickname,
            animal: s.animal,
            color: s.color,
            photoUri: urlOf(s.photo_path),
            photoId: s.photo_id ?? undefined,
            isMe: s.user_id === me,
            hidden: s.hidden,
            blocked: s.blocked,
            luggage: s.luggage ?? [],
            mood: s.mood ?? undefined,
          };
        }
        return {
          id: t.id,
          destinationId: t.drift ? 'drift' : destId(t.dest?.name),
          dayKey: t.day,
          seats,
          status: t.status,
          createdAt: ms(t.created_at)!,
          departedAt: ms(t.departed_at),
          endsAt: ms(t.ends_at),
          drift: t.drift,
          departsAt: ms(t.departs_at),
          arrivesAt: ms(t.arrives_at),
          line: t.line ?? undefined,
        };
      });

      const crews: Crew[] = snap.trains
        .filter((t) => t.mine && t.status !== 'filling')
        .sort((a, b) => (ms(a.departed_at) ?? 0) - (ms(b.departed_at) ?? 0))
        .map((t) => ({
          trainId: t.id,
          posts: t.seats.map((s) => ({
            seat: s.seat - 1,
            reactions: s.reactions,
            myReaction: s.my_reaction ?? undefined,
            comments: s.comments,
          })),
          pokesSent: t.pokes_sent,
          rideAgain: t.ride_again,
          closed: t.status === 'arrived',
        }));

      const tickets: Ticket[] = (snap.tickets ?? []).map((k) => ({
        id: k.id,
        kind: k.kind,
        cycle: ms(k.cycle)!,
        earnedAt: ms(k.earned_at)!,
        trainId: k.train_id ?? undefined,
        detail: k.detail ?? undefined,
      }));
      const schedule = {
        lastTrain: (snap.settings?.last_train_time ?? SCHEDULE.lastTrain).slice(0, 5),
        travelMinutes: snap.settings?.travel_minutes ?? SCHEDULE.travelMinutes,
        minPlaySeconds: snap.settings?.min_play_seconds ?? SCHEDULE.minPlaySeconds,
      };

      // 연출: 처음 보는 출발 열차(아직 여행 중인 것만), 올라간 성장 단계
      const departedMine = snap.trains.filter((t) => t.mine && t.status === 'departed').map((t) => t.id);
      if (primeSeen.current) {
        writeSeen({ departed: departedMine, stage: snap.profile?.stage });
        primeSeen.current = false;
      }
      const seen = readSeen();
      const fresh = departedMine.find((id) => !seen.departed.includes(id));
      const stage = snap.profile?.stage;
      const evolved: Stage | null = stage && seen.stage && stage !== seen.stage && stage !== 'mallang' ? stage : null;
      if (!seen.stage && stage) writeSeen({ ...seen, stage });

      setState((prev) => ({
        profile: snap.profile
          ? {
              id: snap.profile.id,
              nickname: snap.profile.nickname,
              animal: snap.profile.animal,
              color: snap.profile.color,
              xp: snap.profile.xp,
              stage: snap.profile.stage,
              createdAt: ms(snap.profile.created_at)!,
              room: snap.profile.room ?? {},
              shareLine: !!snap.profile.share_line,
            }
          : null,
        films: { day: dayKey(), used: snap.films_used },
        photos,
        trains,
        crews,
        friends: snap.friends,
        blocked: snap.blocked ?? [],
        filmsPerDay: snap.settings?.films_per_day ?? prev.filmsPerDay,
        devTools: !!snap.settings?.dev_tools,
        tickets,
        rest: { cycleMs: snap.rest?.cycle_ms ?? 0, totalMs: snap.rest?.total_ms ?? 0 },
        nextDeparture: ms(snap.next_departure) ?? nextDepartureAt(schedule.lastTrain),
        schedule,
        plays: [],
        growth: { trips: snap.growth?.trips ?? 0, restMinutes: snap.growth?.rest_minutes ?? 0, riders: snap.growth?.riders ?? 0 },
        growthRules: {
          banjjakTrips: snap.settings?.banjjak_trips ?? GROWTH_RULES.banjjakTrips,
          banjjakRest: snap.settings?.banjjak_rest_minutes ?? GROWTH_RULES.banjjakRest,
          rollrollTrips: snap.settings?.rollroll_trips ?? GROWTH_RULES.rollrollTrips,
          rollrollRest: snap.settings?.rollroll_rest_minutes ?? GROWTH_RULES.rollrollRest,
          rollrollRiders: snap.settings?.rollroll_riders ?? GROWTH_RULES.rollrollRiders,
          restDailyCap: snap.settings?.rest_daily_cap_minutes ?? GROWTH_RULES.restDailyCap,
        },
        tonightLines: snap.tonight_lines ?? {},
        celebrate: prev.celebrate ?? fresh ?? null,
        evolved: prev.evolved ?? evolved,
      }));
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      busy.current = false;
    }
  }, [sign]);

  // 로그인(익명) → 오늘 열차 준비 → 첫 동기화
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        let user = data.session?.user ?? null;
        if (user) {
          // 서버에서 계정이 지워졌으면 기기에 남은 세션을 버리고 새로 시작한다
          const check = await supabase.auth.getUser();
          if (check.error || !check.data.user) {
            await supabase.auth.signOut({ scope: 'local' });
            user = null;
          }
        }
        if (!user) {
          const res = await supabase.auth.signInAnonymously();
          if (res.error) throw res.error;
          user = res.data.user;
        }
        uidRef.current = user?.id ?? null;
        if (user) setAccount({ anonymous: !!user.is_anonymous, email: user.email || undefined });
        await supabase.rpc('ensure_today');
        await refresh();
      } catch (e) {
        if (alive) setError(friendlyError(e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh, attempt]);

  // 프로필이 생기면 이 기기의 푸시 토큰을 서버에 등록 (바뀌었을 때만)
  const profileId = state.profile?.id;
  useEffect(() => {
    if (!supabase || !profileId) return;
    let alive = true;
    (async () => {
      const token = await getPushToken();
      const key = 'rollroll.pushToken';
      let saved: string | null = null;
      try {
        saved = globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        saved = null;
      }
      const marker = token ? `${profileId}:${token}` : null;
      if (!alive || !token || marker === saved) return;
      const { error: err } = await supabase.from('profiles').update({ push_token: token }).eq('id', profileId);
      if (!err) {
        try {
          globalThis.localStorage?.setItem(key, marker!);
        } catch {
          // 다음 실행 때 다시 등록
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileId]);

  // 주기 동기화 + 앱으로 돌아올 때 동기화
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [ready, refresh]);

  const dispatch = useCallback(
    async (a: Action): Promise<DispatchResult> => {
      const db = supabase;
      const me = uidRef.current;
      if (!db || !me) throw new Error('not signed in');

      switch (a.type) {
        case 'createProfile': {
          const { error: err } = await db
            .from('profiles')
            .insert({
              id: me,
              nickname: a.nickname.trim(),
              animal: a.avatar.animal,
              color: a.avatar.color,
              birth_year: a.birthYear,
              agreed_at: new Date().toISOString(),
            });
          if (err) throw err;
          writeSeen({ departed: [], stage: 'mallang' });
          break;
        }
        case 'takePhoto': {
          // 필름 룩을 구운 사진은 경로에 .film.을 넣어 화면에서 효과를 다시 입히지 않게 한다
          const path = `${me}/${Date.now()}${a.baked ? '.film' : ''}.jpg`;
          const up = await db.storage.from('films').upload(path, await readBytes(a.uri), { contentType: 'image/jpeg' });
          if (up.error) throw up.error;
          const { data, error: err } = await db.rpc('take_photo', { p_storage_path: path });
          if (err) throw err;
          await refresh();
          return { readyAt: ms((data as { ready_at: string }).ready_at) };
        }
        case 'recordPlay': {
          const { data, error: err } = await db.rpc('record_play', {
            p_session: a.session,
            p_kind: a.kind,
            p_active_ms: Math.max(0, Math.round(a.activeMs)),
            p_filled: a.filled,
            p_detail: a.detail ?? null,
          });
          if (err) throw err;
          const r = data as { ticket: boolean; has_ticket: boolean };
          // 티켓이 새로 나왔거나 놀이를 마쳤을 때만 화면을 다시 맞춘다 (쉰 시간 · 티켓 수)
          if (r.ticket || a.final) await refresh();
          return { ticket: r.ticket, hasTicket: r.has_ticket };
        }
        case 'boardTonight': {
          const { error: err } = await db.rpc('board_tonight', { p_line: a.line });
          if (err) throw err;
          break;
        }
        case 'setShareLine': {
          setState((s) => (s.profile ? { ...s, profile: { ...s.profile, shareLine: a.on } } : s));
          const { error: err } = await db.from('profiles').update({ share_line: a.on }).eq('id', me);
          if (err) throw err;
          return;
        }
        case 'react': {
          const crew = state.crews.find((c) => c.trainId === a.trainId);
          const mine = crew?.posts.find((p) => p.seat === a.seat)?.myReaction;
          const key = { train_id: a.trainId, seat: a.seat + 1, user_id: me };
          const res =
            mine === a.sticker
              ? await db.from('reactions').delete().match(key)
              : await db.from('reactions').upsert({ ...key, sticker: a.sticker }, { onConflict: 'train_id,seat,user_id' });
          if (res.error) throw res.error;
          break;
        }
        case 'comment': {
          const res = await db
            .from('guestbook')
            .upsert({ train_id: a.trainId, seat: a.seat + 1, user_id: me, body: a.body.trim().slice(0, RULES.guestbookMaxLength) }, { onConflict: 'train_id,seat,user_id' });
          if (res.error) throw res.error;
          break;
        }
        case 'poke': {
          const res = await db.from('pokes').insert({ train_id: a.trainId, from_user: me, to_user: a.userId });
          if (res.error && res.error.code !== '23505') throw res.error; // 이미 보낸 인사는 무시
          break;
        }
        case 'devDepartNow': {
          const { error: err } = await db.rpc('dev_depart_now', { p_minutes: 2 });
          if (err) throw err;
          break;
        }
        case 'deleteAccount': {
          // 1) 저장소의 내 사진 파일 지우기 (DB 기록은 계정 삭제 때 함께 지워진다)
          for (;;) {
            const { data: files, error: listErr } = await db.storage.from('films').list(me, { limit: 100 });
            if (listErr) throw listErr;
            if (!files || files.length === 0) break;
            const { error: rmErr } = await db.storage.from('films').remove(files.map((f) => `${me}/${f.name}`));
            if (rmErr) throw rmErr;
            if (files.length < 100) break;
          }
          // 2) 계정 삭제 → 3) 이 기기의 세션과 기록 비우기 → 4) 새 익명 계정으로 처음부터
          const { error: delErr } = await db.rpc('delete_my_account');
          if (delErr) throw delErr;
          await db.auth.signOut({ scope: 'local' });
          try {
            globalThis.localStorage?.removeItem(SEEN_KEY);
            globalThis.localStorage?.removeItem('rollroll.pushToken');
          } catch {
            // 무시
          }
          uidRef.current = null;
          urls.current.clear();
          setAccount(null);
          setState(initial);
          setAttempt((n) => n + 1);
          return;
        }
        case 'setRoom': {
          const room = { ...state.profile?.room, [a.slot]: a.itemId };
          // 먼저 화면에 반영하고 서버에 저장한다 (꾸미기는 즉시 보여야 자연스럽다)
          setState((s) => (s.profile ? { ...s, profile: { ...s.profile, room } } : s));
          const { error: err } = await db.from('profiles').update({ room }).eq('id', me);
          if (err) throw err;
          return;
        }
        case 'report': {
          const res = await db
            .from('reports')
            .insert({ reporter: me, target_user: a.userId, photo_id: a.photoId ?? null, train_id: a.trainId, reason: a.reason });
          if (res.error && res.error.code !== '23505') throw res.error; // 이미 신고한 사진은 조용히 넘긴다
          break;
        }
        case 'block': {
          const res = await db.from('blocks').insert({ blocker: me, blocked: a.userId });
          if (res.error && res.error.code !== '23505') throw res.error;
          break;
        }
        case 'toggleRideAgain': {
          const crew = state.crews.find((c) => c.trainId === a.trainId);
          const key = { train_id: a.trainId, from_user: me, to_user: a.userId };
          const res = crew?.rideAgain.includes(a.userId)
            ? await db.from('ride_again').delete().match(key)
            : await db.from('ride_again').insert(key);
          if (res.error) throw res.error;
          break;
        }
        case 'dismissCelebrate': {
          const seen = readSeen();
          if (state.celebrate) writeSeen({ ...seen, departed: [...seen.departed, state.celebrate] });
          setState((s) => ({ ...s, celebrate: null }));
          return;
        }
        case 'dismissEvolved': {
          writeSeen({ ...readSeen(), stage: state.profile?.stage });
          setState((s) => ({ ...s, evolved: null }));
          return;
        }
        // 서버 모드에서는 배치가 처리하거나(여행 종료) 쓰지 않는 동작
        default:
          return;
      }
      await refresh();
    },
    [refresh, state.crews, state.celebrate, state.profile?.stage, state.profile?.room],
  );

  const auth = useMemo<NonNullable<Store['auth']>>(
    () => ({
      async sendCode(email: string, mode: AuthMode) {
        if (!supabase) return;
        const res =
          mode === 'link'
            ? await supabase.auth.updateUser({ email }) // 익명 계정에 이메일 붙이기: 확인 코드가 메일로 간다
            : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (res.error) throw res.error;
      },
      async verifyCode(email: string, code: string, mode: AuthMode) {
        if (!supabase) return;
        const { data, error: err } = await supabase.auth.verifyOtp({ email, token: code, type: mode === 'link' ? 'email_change' : 'email' });
        if (err) throw err;
        const user = data.user;
        if (!user) throw new Error('invalid');
        setAccount({ anonymous: !!user.is_anonymous, email: user.email || email });
        if (mode === 'restore') {
          // 다른 계정으로 바뀌었으니 화면 상태를 비우고 새로 동기화
          uidRef.current = user.id;
          urls.current.clear();
          primeSeen.current = true;
          setState(initial);
        }
        await refresh();
      },
    }),
    [refresh],
  );

  const value = useMemo<Store>(
    () => ({ state, account, auth, ready, mode: 'remote', error, dispatch, retry: () => setAttempt((n) => n + 1) }),
    [state, account, auth, ready, error, dispatch],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
