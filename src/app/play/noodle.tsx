import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { MallangBall, type Expression } from '@/components/mallang-ball';
import { Bowl, Candle, NOODLES, Steam, Strand, type NoodleId } from '@/components/play/noodle-kit';
import { PlayShell, usePlay } from '@/components/play/play-kit';
import { WarmFaces } from '@/components/play/squish-kit';
import { C, Font, shadow } from '@/constants/theme';
import { buzz, play, preload, stop } from '@/lib/sound';
import { useStore } from '@/lib/store';
import type { Profile } from '@/lib/types';

/** 들숨으로 인정하는 최소 길이 · 면이 입까지 올라오는 들숨 4초 · 촛불이 꺼지는 날숨 6초 */
const INHALE_MIN = 1200;
const INHALE_FULL = 4000;
const EXHALE_MS = 6000;
const SLURPS_PER_BOWL = 2;

type Phase = 'choose' | 'ready' | 'inhale' | 'exhale' | 'rest';

/**
 * 면치기 숨쉬기 (후각 + 미각). 한 번에 하나에만 집중한다:
 * 들숨 동안은 라면 한 그릇만(누르고 있는 동안 면이 입까지 올라온다),
 * 손을 떼는 순간 라면이 사라지고 생일 초 하나만 남아 6초 동안 천천히 불어 끈다.
 */
export default function NoodlePlay() {
  const { state } = useStore();
  return state.profile ? <Noodle me={state.profile} /> : null;
}

function Noodle({ me }: { me: Profile }) {
  const p = usePlay('noodle');
  const { width } = useWindowDimensions();
  const W = Math.min(width - 32, 360);
  const H = W * 1.2;
  const ball = W * 0.36;
  const rimY = W * 0.74;

  const [phase, setPhase] = useState<Phase>('choose');
  const [noodle, setNoodle] = useState<NoodleId>('ramen');
  const [slurps, setSlurps] = useState(0);
  const [bowls, setBowls] = useState(0);
  const [breaths, setBreaths] = useState(0);
  const [count, setCount] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const lift = useSharedValue(0);
  const flame = useSharedValue(1);
  const ring = useSharedValue(0.82);
  const inhaleAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticking = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    preload(['inhale', 'slurp', 'blow', 'puff', 'chime', 'stamp', 'paper']);
    const list = timers.current;
    return () => {
      list.forEach(clearTimeout);
      if (ticking.current) clearInterval(ticking.current);
      stop('inhale');
      stop('blow');
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /** 1초마다 톡 진동 + 숫자 (화면을 안 봐도 박자를 맞출 수 있게) */
  const beat = (from: number, step: number) => {
    if (ticking.current) clearInterval(ticking.current);
    setCount(from);
    let n = from;
    let quarter = 0;
    ticking.current = setInterval(() => {
      p.ping();
      quarter += 1;
      if (quarter % 4 === 0) {
        n += step;
        setCount(n);
        buzz.tick();
      }
    }, 250);
  };
  const stopBeat = () => {
    if (ticking.current) clearInterval(ticking.current);
    ticking.current = null;
  };

  const choose = (id: NoodleId) => {
    setNoodle(id);
    setPhase('ready');
    p.setDetail({ noodle: id, breaths });
    p.ping();
    buzz.light();
  };

  const pressIn = () => {
    if (phase === 'exhale' || phase === 'rest') {
      setHint('촛불이 꺼질 때까지 천천히 내쉬어요');
      return;
    }
    if (phase !== 'ready') return;
    setHint(null);
    inhaleAt.current = Date.now();
    setPhase('inhale');
    p.ping();
    buzz.light();
    play('inhale', { volume: 0.75 });
    lift.set(withTiming(1, { duration: INHALE_FULL, easing: Easing.linear }));
    ring.set(withTiming(1.1, { duration: INHALE_FULL, easing: Easing.out(Easing.quad) }));
    beat(1, 1);
  };

  const pressOut = () => {
    if (phase !== 'inhale') return;
    stopBeat();
    stop('inhale');
    const dur = Date.now() - inhaleAt.current;
    if (dur < INHALE_MIN) {
      lift.set(withTiming(0, { duration: 260 }));
      ring.set(withTiming(0.82, { duration: 400 }));
      setHint('조금 더 길게, 후루루룩 들이마셔 볼까요?');
      setPhase('ready');
      return;
    }
    // 후루룩! 면이 입속으로 쏙 → 곧바로 라면은 사라지고 촛불만
    play('slurp', { volume: Math.min(1, 0.55 + dur / 7000) });
    buzz.medium();
    lift.set(withTiming(2, { duration: 360, easing: Easing.in(Easing.quad) }));
    p.add(1 + Math.round(8 * Math.min(1, dur / INHALE_FULL)));
    const nextSlurps = slurps + 1;
    setSlurps(nextSlurps);
    setBreaths(breaths + 1);
    p.setDetail({ noodle, breaths: breaths + 1 });

    later(() => {
      lift.set(0);
      flame.set(1);
      setPhase('exhale');
      play('blow', { volume: 0.65 });
      flame.set(withTiming(0, { duration: EXHALE_MS, easing: Easing.inOut(Easing.quad) }));
      ring.set(withTiming(0.82, { duration: EXHALE_MS, easing: Easing.inOut(Easing.quad) }));
      beat(Math.round(EXHALE_MS / 1000), -1);
    }, 380);
    later(() => {
      stopBeat();
      play('puff', { volume: 0.7 });
      buzz.light();
      p.add(8);
      setPhase('rest');
      later(() => {
        if (nextSlurps >= SLURPS_PER_BOWL) {
          setBowls((b) => b + 1);
          setSlurps(0);
        }
        flame.set(1);
        setPhase('ready');
      }, 1000);
    }, 380 + EXHALE_MS);
  };

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ring.get() }] }));

  if (phase === 'choose') {
    return (
      <PlayShell play={p} bg="#FFF6E6">
        <View style={s.choose}>
          <Text style={s.q}>오늘은 어떤 면이 당겨요?</Text>
          <Text style={s.qSub}>고른 면은 여행지 도시락이 돼요</Text>
          <View style={s.cards}>
            {(Object.keys(NOODLES) as NoodleId[]).map((id) => (
              <Pressable key={id} onPress={() => choose(id)} accessibilityRole="button" style={({ pressed }) => [s.card, pressed && { transform: [{ scale: 0.96 }] }]}>
                <Bowl noodle={id} level={1} width={96} />
                <Text style={s.cardName}>{NOODLES[id].name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <WarmFaces animal={me.animal} color={me.color} stage={me.stage} />
      </PlayShell>
    );
  }

  const candleMode = phase === 'exhale' || phase === 'rest';
  const face: Expression = phase === 'inhale' ? 'surprised' : phase === 'exhale' ? 'sleepy' : phase === 'rest' ? 'wink' : 'happy';
  const level = 1 - slurps / SLURPS_PER_BOWL;
  const label =
    phase === 'inhale'
      ? `들이쉬어요 · ${count}`
      : phase === 'exhale'
        ? `후~ 내쉬어요 · ${Math.max(1, count)}`
        : phase === 'rest'
          ? '좋아요!'
          : '꾹 누르고 후루룩 들이마시기';

  return (
    <PlayShell
      play={p}
      bg={candleMode ? '#FFF1F4' : '#FFF6E6'}
      footer={
        <View style={s.footer}>
          <Text style={s.count}>
            {bowls >= 3 ? `한 그릇 더! · 숨 ${breaths}번` : `${bowls + 1}번째 그릇 · 숨 ${breaths}번`}
          </Text>
          <Pressable
            onPressIn={pressIn}
            onPressOut={pressOut}
            accessibilityRole="button"
            accessibilityLabel="누르고 있는 동안 숨을 들이쉬고, 손을 떼면 내쉬어요"
            style={[s.breath, phase === 'inhale' && s.breathOn, candleMode && s.breathWait]}>
            <Text style={[s.breathText, phase === 'inhale' && { color: '#fff' }]}>{label}</Text>
          </Pressable>
        </View>
      }>
      <View style={s.center}>
        <View style={{ width: W, height: H }}>
          {/* 숨 고리: 들숨에 커지고 날숨에 작아진다 */}
          <Animated.View
            pointerEvents="none"
            style={[s.ring, { width: W * 0.72, height: W * 0.72, borderRadius: W, left: W * 0.14, top: W * 0.43, borderColor: candleMode ? '#F8BCCB' : '#F7D08A' }, ringStyle]}
          />
          <View style={[s.ballAt, { left: (W - ball) / 2 }]}>
            <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={ball} expression={face} />
          </View>

          {candleMode ? (
            <Animated.View key="candle" entering={ZoomIn.duration(320)} exiting={FadeOut.duration(200)} style={[s.at, { left: (W - W * 0.46 * 0.5) / 2, top: W * 0.5 }]}>
              <Candle flame={flame} size={W * 0.46} />
            </Animated.View>
          ) : (
            <Animated.View key={`bowl-${bowls}`} entering={ZoomIn.duration(320)} exiting={FadeOut.duration(200)} style={[s.at, { left: W * 0.19, top: rimY - W * 0.124 }]}>
              <View style={{ position: 'absolute', left: W * 0.2, top: -W * 0.2 }}>
                <Steam size={W * 0.36} />
              </View>
              <Bowl noodle={noodle} level={level} width={W * 0.62} />
            </Animated.View>
          )}
          {!candleMode && <Strand lift={lift} noodle={noodle} w={W} h={H} fromY={rimY} toY={ball * 0.64} />}
        </View>
        {hint && (
          <Animated.Text entering={FadeIn} style={s.hint}>
            {hint}
          </Animated.Text>
        )}
      </View>
      <WarmFaces animal={me.animal} color={me.color} stage={me.stage} />
    </PlayShell>
  );
}

const s = StyleSheet.create({
  choose: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  q: { fontFamily: Font.display, fontSize: 24, color: C.ink },
  qSub: { fontSize: 13, color: C.inkSoft },
  cards: { flexDirection: 'row', gap: 10, marginTop: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: '#F3E3C4', ...shadow },
  cardName: { fontFamily: Font.display, fontSize: 17, color: C.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 10, backgroundColor: 'rgba(255,255,255,0.35)' },
  ballAt: { position: 'absolute', top: 0 },
  at: { position: 'absolute' },
  hint: { position: 'absolute', bottom: 6, fontSize: 13, color: '#9A6B2E', backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  footer: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  count: { textAlign: 'center', fontFamily: Font.display, fontSize: 15, color: '#9A6B2E' },
  breath: { minHeight: 76, borderRadius: 38, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#F2C46A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, ...shadow },
  breathOn: { backgroundColor: '#F2B14C', borderColor: '#E39A2C', transform: [{ scale: 0.98 }] },
  breathWait: { backgroundColor: '#FFF9EE', borderColor: '#F8BCCB' },
  breathText: { fontFamily: Font.display, fontSize: 19, color: '#9A6B2E', fontVariant: ['tabular-nums'] },
});
