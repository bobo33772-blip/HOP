import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, Image as SvgImage, LinearGradient, Rect, Stop } from 'react-native-svg';

import { BODY_COLORS, Font, type BodyColorId } from '@/constants/theme';
import { play } from '@/lib/sound';
import type { Stage } from '@/lib/rules';
import { LINE_BOARD } from '@/lib/line-art';
import { BOARD_TEXT, CARS, LOCO, STATION_BG, STATION_H, STATION_W, type CarColor } from '@/lib/station-art';
import type { Passenger, Train } from '@/lib/types';

import { MallangBall } from './mallang-ball';

export type Period = 'morning' | 'day' | 'sunset' | 'night';

/** 폰 시각으로 정거장의 시간대를 정한다 (동물의 숲처럼 실제 시간과 함께 흐른다) */
export function periodFor(d = new Date()): Period {
  const h = d.getHours();
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'sunset';
  return 'night';
}

/** 그림 위쪽 하늘색 (키 큰 화면에서 그림 위를 이어 칠한다) */
const SKY: Record<Period, { top: string; edge: string }> = {
  morning: { top: '#A9C8EC', edge: '#B1CEEF' },
  day: { top: '#86C4F8', edge: '#95CDFB' },
  sunset: { top: '#8C7DB0', edge: '#A28CBA' },
  night: { top: '#021240', edge: '#03194F' },
};

/** 낮에 그린 기차를 시간대 빛에 맞추는 덧칠 (그림 모양 그대로 색만 얹는다) */
const TINT: Record<Period, { color: string; opacity: number } | null> = {
  morning: { color: '#FFC49A', opacity: 0.12 },
  day: null,
  sunset: { color: '#FF8E6E', opacity: 0.22 },
  night: { color: '#0B1433', opacity: 0.48 },
};

const LABEL: Record<Period, string> = { morning: '아침', day: '낮', sunset: '노을', night: '밤' };

// 그림 좌표(1520×2688) 기준 위치들
/** 전광판 누르는 자리 */
const BOARD_TAP = { x: 900, y: 840, w: 460, h: 230 };
/** 광장 게시판(내가 건 사진 2×2): 판의 왼쪽 위 모서리, 크기, 기울기(dy/dx) */
const NOTICE = { x: 1117, y: 1731, w: 136, h: 116, slope: 0.3 };
const STUDIO_TAP = { x: 60, y: 1420, w: 560, h: 520 };
const LOCK_SEA = { x: 160, y: 415 };
const LOCK_FOREST = { x: 1300, y: 520 };
const ME = { x: 760, y: 2080 };
/** 말랑볼이 걸어 다닐 수 있는 광장 (사진관 앞 돌길 · 승강장 쪽 · 게시판 옆). 탭 바에 가려지는 아래쪽은 뺐다 */
const WALK: [number, number][] = [
  [600, 1960], [700, 1770], [800, 1610], [1060, 1670], [1000, 1850], [1080, 2000], [1180, 2080],
  [1120, 2250], [900, 2310], [640, 2310], [470, 2260], [400, 2120], [480, 2010],
];
const POS_KEY = 'rollroll.me.pos';

function inside(x: number, y: number) {
  let hit = false;
  for (let i = 0, j = WALK.length - 1; i < WALK.length; j = i++) {
    const [xi, yi] = WALK[i];
    const [xj, yj] = WALK[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** 광장 밖을 누르면 가장 가까운 광장 가장자리까지 (너무 먼 곳은 무시) */
function walkTarget(x: number, y: number): { x: number; y: number } | null {
  if (inside(x, y)) return { x, y };
  let best: { x: number; y: number; d: number } | null = null;
  for (let i = 0; i < WALK.length; i++) {
    const [ax, ay] = WALK[i];
    const [bx, by] = WALK[(i + 1) % WALK.length];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    const px = ax + t * (bx - ax);
    const py = ay + t * (by - ay);
    const d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { x: px, y: py, d };
  }
  if (!best || best.d > 260) return null;
  // 가장자리에서 광장 가운데 쪽으로 조금 들어간 곳
  const cx = WALK.reduce((a, p) => a + p[0], 0) / WALK.length;
  const cy = WALK.reduce((a, p) => a + p[1], 0) / WALK.length;
  const k = 14 / Math.max(1, Math.hypot(cx - best.x, cy - best.y));
  return { x: best.x + (cx - best.x) * k, y: best.y + (cy - best.y) * k };
}

function loadPos() {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(POS_KEY) ?? 'null') as { x: number; y: number } | null;
    if (v && inside(v.x, v.y)) return v;
  } catch {
    // 처음 자리에서 시작
  }
  return ME;
}
const SPOTS = [
  { x: 420, y: 2180 },
  { x: 1110, y: 2170 },
  { x: 560, y: 1985 },
  { x: 990, y: 2000 },
];
/** 기차가 달리는 방향 (기관차 → 마지막 칸), 단위 벡터 */
const DIR = { x: 0.958, y: 0.287 };

type Props = {
  train?: Train;
  destination: { id: string; name: string };
  me: { animal: Passenger['animal']; color: Passenger['color']; stage: Stage; nickname: string };
  /** 게시판에 핀으로 꽂을 내 사진 (최대 4장) */
  hung?: { id: string; uri: string | number; takenAt: number }[];
  /** 내 말랑볼 위 말풍선 (누르면 다음 할 일로) */
  guide?: { text: string; onPress?: () => void } | null;
  onBoard?: () => void;
  onStudio?: () => void;
  /** 개발 도감에서 시간대를 고정해 볼 때 */
  fixedPeriod?: Period;
  /** 기차가 들어오는 연출 (처음 볼 때만) */
  arrive?: boolean;
  /** 출발 연출: 광장·말풍선·터치 영역을 숨기고, 잠시 뒤 기차가 앞(왼쪽 위)으로 달려 나간다 */
  depart?: boolean;
};

/**
 * 3D 정거장. 기차 없는 배경 그림 위에 기관차와 8칸을 따로 얹어서
 * 칸마다 승객 몸 색으로 칠하고, 창문에 승객이 보이고, 기차가 들어오고 들썩이고 김을 뿜는다.
 */
export function StationScene({ train, destination, me, hung = [], guide, onBoard, onStudio, fixedPeriod, arrive = true, depart = false }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [target, setTarget] = useState<{ x: number; y: number; n: number } | null>(null);
  const [clock, setClock] = useState<Period>(() => periodFor());
  useEffect(() => {
    const id = setInterval(() => setClock(periodFor()), 60000);
    return () => clearInterval(id);
  }, []);
  const period = fixedPeriod ?? clock;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const s = size.w / STATION_W;
  const imgH = STATION_H * s;
  const skyH = Math.max(0, size.h - imgH) + 2;
  const seats = train?.seats ?? Array<Passenger | null>(8).fill(null);
  const riders = seats.filter((p): p is Passenger => !!p && !p.isMe).slice(0, 4);
  const board = LINE_BOARD[destination.id] ?? BOARD_TEXT[destination.id];

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size.w > 0 && (
        <>
          {/* 그림 위로 이어지는 하늘 */}
          <Svg width={size.w} height={skyH} style={{ position: 'absolute', top: 0, left: 0 }}>
            <Defs>
              <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={SKY[period].top} />
                <Stop offset="1" stopColor={SKY[period].edge} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={size.w} height={skyH} fill="url(#sky)" />
          </Svg>
          {period !== 'night' && <Cloud top={skyH * 0.25} delay={0} width={size.w} />}
          {period !== 'night' && <Cloud top={skyH * 0.25 + imgH * 0.05} delay={9000} width={size.w} small />}

          <View style={{ position: 'absolute', left: 0, bottom: 0, width: size.w, height: imgH }}>
            <Image source={STATION_BG[period]} style={StyleSheet.absoluteFill} contentFit="fill" transition={500} />
            <Svg width={size.w} height={90 * s} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
              <Defs>
                <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={SKY[period].edge} stopOpacity={1} />
                  <Stop offset="1" stopColor={SKY[period].edge} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={size.w} height={90 * s} fill="url(#fade)" />
            </Svg>

            {/* 광장을 누르면 말랑볼이 걸어간다 (전광판 · 사진관 · 기차 누르기가 먼저) */}
            {!depart && (
              <Pressable
                onPress={(e) => {
                  const t = walkTarget(e.nativeEvent.locationX / s, e.nativeEvent.locationY / s);
                  if (t) setTarget((prev) => ({ ...t, n: (prev?.n ?? 0) + 1 }));
                }}
                accessibilityLabel="광장을 눌러 말랑볼 움직이기"
                style={StyleSheet.absoluteFill}
              />
            )}
            {target && !depart && <TapRing key={target.n} x={target.x * s} y={target.y * s} s={s} />}

            {/* 간판 글씨(롤롤 정거장·롤롤 사진관·오늘의 행선지)는 배경 그림에 구워져 있다. 전광판 이름만 행선지별 그림 */}
            {board && <Image source={board.src} style={abs(board.box.x, board.box.y, board.box.w, board.box.h, s)} contentFit="fill" transition={0} pointerEvents="none" />}
            {!depart && (
            <Pressable
              onPress={onBoard}
              accessibilityRole="button"
              accessibilityLabel={`오늘의 행선지 ${destination.name}, 열차 고르기`}
              style={abs(BOARD_TAP.x, BOARD_TAP.y, BOARD_TAP.w, BOARD_TAP.h, s)}
            />
            )}
            {!depart && <Pressable onPress={onStudio} accessibilityRole="button" accessibilityLabel="롤롤 사진관, 현상소로 가기" style={abs(STUDIO_TAP.x, STUDIO_TAP.y, STUDIO_TAP.w, STUDIO_TAP.h, s)} />}

            {/* 게시판: 내가 건 사진 (판 기울기대로, SVG로 그려야 안드로이드에서도 정확하다) */}
            {!depart && hung.length > 0 && <NoticePhotos photos={hung.slice(0, 4).map((p) => p.uri)} s={s} width={size.w} height={imgH} />}

            {/* 잠긴 역 */}
            <Lock text="바다역" at={LOCK_SEA} s={s} />
            <Lock text="숲역" at={LOCK_FOREST} s={s} />

            {/* 기차 */}
            <TrainLayer seats={seats} s={s} period={period} arrive={arrive} depart={depart} onPress={onBoard} />

            {/* 광장: 크루원들이 통통 */}
            {!depart && riders.map((p, i) => (
              <Wanderer key={p.userId} p={p} index={i} s={s} />
            ))}

            {/* 나: 광장을 누른 곳으로 통통 걸어간다 */}
            {!depart && <Walker me={me} s={s} width={size.w} guide={guide} night={period === 'night'} target={target} />}
          </View>

          <View pointerEvents="none" style={st.period}>
            <Text style={st.periodText}>{LABEL[period]}</Text>
          </View>
        </>
      )}
    </View>
  );
}

/** 그림 좌표 → 화면 절대 위치 */
function abs(x: number, y: number, w: number, h: number, s: number) {
  return { position: 'absolute' as const, left: x * s, top: y * s, width: w * s, height: h * s };
}

/** 게시판 2×2 사진: SVG matrix(1 t 0 1 0 0)로 판 기울기대로 기울인다 */
function NoticePhotos({ photos, s, width, height }: { photos: (string | number)[]; s: number; width: number; height: number }) {
  const gap = 5;
  const cw = (NOTICE.w - gap * 3) / 2;
  const ch = (NOTICE.h - gap * 3) / 2;
  const y0 = NOTICE.y - NOTICE.slope * NOTICE.x; // 기울이기 전 좌표계의 윗변
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${STATION_W} ${STATION_H}`} style={StyleSheet.absoluteFill} pointerEvents="none">
      {photos.map((src, i) => (
        <SvgImage
          key={i}
          href={(typeof src === 'string' ? { uri: src } : src) as never}
          x={NOTICE.x + gap + (i % 2) * (cw + gap)}
          y={y0 + gap + Math.floor(i / 2) * (ch + gap)}
          width={cw}
          height={ch}
          preserveAspectRatio="xMidYMid slice"
          transform={`matrix(1 ${NOTICE.slope} 0 1 0 0)`}
        />
      ))}
    </Svg>
  );
}

function Lock({ text, at, s }: { text: string; at: { x: number; y: number }; s: number }) {
  return (
    <View pointerEvents="none" style={[st.lockWrap, { left: at.x * s - 60, top: at.y * s }]}>
      <View style={st.lock}>
        <Text style={st.lockText}>{text} 🔒</Text>
      </View>
    </View>
  );
}

// ---------- 나 ----------

type Guide = { text: string; onPress?: () => void } | null | undefined;

function Walker({ me, s, width, guide, night, target }: { me: Props['me']; s: number; width: number; guide: Guide; night: boolean; target: { x: number; y: number; n: number } | null }) {
  const [start] = useState(loadPos);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const hop = useSharedValue(0);
  const lean = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!target) return;
    timers.current.splice(0).forEach(clearTimeout);
    const fx = x.get();
    const fy = y.get();
    const dist = Math.hypot(target.x - fx, target.y - fy);
    if (dist < 8) return;
    const dur = Math.min(2600, Math.max(380, (dist / 480) * 1000));
    const ease = Easing.inOut(Easing.quad);
    x.set(withTiming(target.x, { duration: dur, easing: ease }));
    y.set(withTiming(target.y, { duration: dur, easing: ease }));
    // 통통 뛰며 걷기 + 발소리
    const hops = Math.max(1, Math.round(dur / 280));
    hop.set(withRepeat(withSequence(withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) })), hops));
    lean.set(withSequence(withTiming(Math.sign(target.x - fx), { duration: 160 }), withDelay(Math.max(0, dur - 320), withTiming(0, { duration: 160 }))));
    for (let i = 0; i < hops; i++) {
      timers.current.push(setTimeout(() => play('step', { volume: 0.45, rate: 0.9 + Math.random() * 0.2 }), i * 280 + 140));
    }
    timers.current.push(
      setTimeout(() => {
        try {
          globalThis.localStorage?.setItem(POS_KEY, JSON.stringify({ x: target.x, y: target.y }));
        } catch {
          // 다음에는 처음 자리에서
        }
      }, dur),
    );
  }, [target, x, y, hop, lean]);

  const box = 300 * s;
  const body = 230 * s;
  const place = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() * s - box / 2 }, { translateY: y.get() * s - body * 0.93 - hop.get() * 22 * s }],
  }));
  // 광장 안쪽(위)일수록 조금 작게: 멀리 있는 느낌
  const depth = useAnimatedStyle(() => {
    const k = 0.8 + 0.25 * Math.min(1, Math.max(0, (y.get() - 1600) / 700));
    return { transform: [{ scale: k }, { rotate: `${lean.get() * 7}deg` }] };
  });

  return (
    <Animated.View style={[st.me, { left: 0, top: 0, width: box }, place]} pointerEvents="box-none">
      {guide && (
        <Pressable
          onPress={guide.onPress}
          disabled={!guide.onPress}
          accessibilityRole="button"
          style={[st.bubble, { width: width * 0.5, left: box / 2 - width * 0.25 }]}>
          <Text style={st.bubbleText}>{guide.text}</Text>
          {guide.onPress && <Text style={st.bubbleGo}>›</Text>}
        </Pressable>
      )}
      <Animated.View style={[{ alignItems: 'center', transformOrigin: 'bottom' }, depth]} pointerEvents="box-none">
        <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={body} squishable />
        <Text style={[st.name, night && { color: '#FFF3E0' }]}>{me.nickname}</Text>
      </Animated.View>
    </Animated.View>
  );
}

/** 누른 자리에 퍼지는 동그라미 */
function TapRing({ x, y, s }: { x: number; y: number; s: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  }, [t]);
  const r = 70 * s;
  const a = useAnimatedStyle(() => ({ opacity: 0.8 * (1 - t.get()), transform: [{ scaleX: 0.4 + t.get() }, { scaleY: (0.4 + t.get()) * 0.5 }] }));
  return <Animated.View pointerEvents="none" style={[st.ring, { left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r }, a]} />;
}

// ---------- 기차 ----------

function carColor(p: Passenger | null): CarColor {
  if (!p) return 'empty';
  return (BODY_COLORS.find((c) => c.id === p.color)?.id ?? 'sky') as BodyColorId;
}

function TrainLayer({ seats, s, period, arrive, depart, onPress }: { seats: (Passenger | null)[]; s: number; period: Period; arrive: boolean; depart: boolean; onPress?: () => void }) {
  // 1 = 화면 밖(오른쪽 아래), 0 = 정차, 음수 = 앞(왼쪽 위)으로 떠남
  const run = useSharedValue(arrive ? 1 : 0);
  const clock = useSharedValue(0);
  useEffect(() => {
    if (depart) {
      // 잠깐 서서 들썩이다가 천천히 출발해 점점 빨라진다 (기관차부터 화면 밖으로)
      run.set(withDelay(1600, withTiming(-1.6, { duration: 4200, easing: Easing.in(Easing.cubic) })));
      clock.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1));
    } else {
      run.set(withTiming(0, { duration: 2600, easing: Easing.out(Easing.cubic) }));
      clock.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1));
    }
  }, [run, clock, depart]);
  const far = 1700 * s;
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: DIR.x * far * run.get() }, { translateY: DIR.y * far * run.get() }] }));
  const tint = TINT[period];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, move]} pointerEvents="box-none">
      {onPress && !depart && <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="열차 고르기" style={abs(LOCO.box.x, CARS[0].box.y - 40, CARS[7].box.x + CARS[7].box.w - LOCO.box.x, CARS[7].box.y + CARS[7].box.h - CARS[0].box.y + 40, s)} />}
      <Steam s={s} />
      <Bob clock={clock} phase={0} s={s} style={abs(LOCO.box.x, LOCO.box.y, LOCO.box.w, LOCO.box.h, s)}>
        <Image source={LOCO.src} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} />
        {tint && <Image source={LOCO.src} style={[StyleSheet.absoluteFill, { opacity: tint.opacity }]} tintColor={tint.color} contentFit="fill" transition={0} />}
      </Bob>
      {CARS.map((car, i) => {
        const p = seats[i] ?? null;
        const src = car.src[carColor(p)];
        const b = car.box;
        const w = car.window;
        // 창 안(뚫린 구멍 뒤)에 들어갈 것들: 차 상자 기준 상대 좌표
        const win = { left: (w.x - b.x) * s, top: (w.y - b.y) * s, width: w.w * s, height: w.h * s };
        const char = w.h * 1.25 * s;
        return (
          <Bob key={i} clock={clock} phase={(i + 1) * 0.11} s={s} style={abs(b.x, b.y, b.w, b.h, s)}>
            {p && (
              <>
                <View style={[st.windowBack, win]} />
                <View style={{ position: 'absolute', left: win.left + (win.width - char) / 2, top: win.top + win.height * 0.5 - char * 0.55 }}>
                  <MallangBall animal={p.animal} color={p.color} size={char} expression={p.isMe ? 'wink' : 'happy'} />
                </View>
                {tint && <View style={[win, { position: 'absolute', backgroundColor: tint.color, opacity: tint.opacity }]} />}
              </>
            )}
            <Image source={src} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} />
            {tint && <Image source={src} style={[StyleSheet.absoluteFill, { opacity: tint.opacity }]} tintColor={tint.color} contentFit="fill" transition={0} />}
            {p?.isMe && (
              <View style={[st.meTag, { top: -30 * s, left: b.w * 0.35 * s }]}>
                <Text style={st.meTagText}>나</Text>
              </View>
            )}
          </Bob>
        );
      })}
    </Animated.View>
  );
}

/** 칸마다 조금씩 늦게 들썩여서 칙칙폭폭 물결처럼 */
function Bob({ clock, phase, s, style, children }: { clock: SharedValue<number>; phase: number; s: number; style: object; children: ReactNode }) {
  const amp = 5 * s;
  const a = useAnimatedStyle(() => {
    const t = (clock.get() + phase) % 1;
    return { transform: [{ translateY: -Math.abs(Math.sin(t * Math.PI * 2)) * amp }] };
  });
  return (
    <Animated.View style={[style, a]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

/** 기관차 머리 위로 몽글몽글 올라가는 김 */
function Steam({ s }: { s: number }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Puff key={i} delay={i * 700} s={s} />
      ))}
    </>
  );
}

function Puff({ delay, s }: { delay: number; s: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration: 2100, easing: Easing.out(Easing.quad) }), -1)));
  }, [delay, t]);
  const size = 70 * s;
  const a = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v < 0.15 ? v / 0.15 : Math.max(0, 1 - (v - 0.15) / 0.85),
      transform: [{ translateX: -v * 90 * s }, { translateY: -v * 170 * s }, { scale: 0.5 + v * 1.1 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[st.puff, { left: 250 * s - size / 2, top: 950 * s - size / 2, width: size, height: size, borderRadius: size / 2 }, a]} />;
}

// ---------- 광장 ----------

function Wanderer({ p, index, s }: { p: Passenger; index: number; s: number }) {
  const y = useSharedValue(0);
  const x = useSharedValue(0);
  useEffect(() => {
    y.set(withDelay(index * 350, withRepeat(withSequence(withTiming(-8, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) })), -1)));
    x.set(withDelay(index * 500, withRepeat(withSequence(withTiming(14, { duration: 2400 }), withTiming(-10, { duration: 2400 })), -1, true)));
  }, [index, x, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  const spot = SPOTS[index % SPOTS.length];
  const size = 175 * s;
  const color = BODY_COLORS.find((c) => c.id === p.color)?.fill;
  return (
    <Animated.View pointerEvents="none" style={[st.wander, { left: spot.x * s - size / 2, top: spot.y * s - size * 0.93, width: size }, anim]}>
      <MallangBall animal={p.animal} color={p.color} size={size} />
      <Text style={[st.tag, { borderColor: color }]} numberOfLines={1}>
        {p.nickname}
      </Text>
    </Animated.View>
  );
}

function Cloud({ top, delay, width, small }: { top: number; delay: number; width: number; small?: boolean }) {
  const x = useSharedValue(-90);
  useEffect(() => {
    x.set(withDelay(delay, withRepeat(withTiming(width + 90, { duration: small ? 30000 : 40000, easing: Easing.linear }), -1)));
  }, [delay, small, width, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const w = small ? 52 : 76;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, left: 0, width: w, height: w * 0.42 }, anim]}>
      <View style={[st.cloudPart, { left: 0, top: w * 0.14, width: w * 0.55, height: w * 0.28 }]} />
      <View style={[st.cloudPart, { left: w * 0.28, top: 0, width: w * 0.5, height: w * 0.36 }]} />
      <View style={[st.cloudPart, { left: w * 0.55, top: w * 0.14, width: w * 0.45, height: w * 0.26 }]} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  lockWrap: { position: 'absolute', width: 120, alignItems: 'center' },
  lock: { backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  lockText: { fontSize: 11, color: '#6E5B4D', fontWeight: '700' },
  windowBack: { position: 'absolute', backgroundColor: '#FAF4E8' },
  meTag: { position: 'absolute', backgroundColor: '#3F93D6', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  meTagText: { color: '#fff', fontFamily: Font.display, fontSize: 11 },
  puff: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.9)' },
  wander: { position: 'absolute', alignItems: 'center' },
  tag: { fontSize: 9, color: '#4A3426', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, paddingHorizontal: 4, borderWidth: 1, overflow: 'hidden', maxWidth: 70, marginTop: -2 },
  me: { position: 'absolute', alignItems: 'center' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: 'rgba(255,255,255,0.95)', backgroundColor: 'rgba(255,255,255,0.18)' },
  name: { fontFamily: Font.display, fontSize: 14, color: '#4A3426', marginTop: -2, textShadowColor: 'rgba(255,255,255,0.8)', textShadowRadius: 4 },
  bubble: { position: 'absolute', bottom: '100%', marginBottom: 6, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: '#BFE0F7' },
  bubbleText: { fontSize: 13, color: '#4A3426', lineHeight: 18, flexShrink: 1 },
  bubbleGo: { fontFamily: Font.display, fontSize: 18, color: '#3F93D6' },
  period: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  periodText: { fontSize: 10, color: '#4A3426', fontWeight: '700' },
  cloudPart: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999 },
});
