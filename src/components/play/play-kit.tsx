import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { C, Font, shadow } from '@/constants/theme';
import { clock, josa } from '@/lib/format';
import { GAUGE_FULL, PLAYS, newId, restLabel, useActiveTime } from '@/lib/play';
import { buzz, play, setMuted, useDuckMusic, useMuted } from '@/lib/sound';
import { useDerived, useStore } from '@/lib/store';
import type { PlayKind } from '@/lib/types';

export type PlayPhase = 'playing' | 'claiming' | 'earned' | 'already';

/**
 * 놀이 한 판의 공통 흐름: 서버 기록(시작 · 20초마다 · 나갈 때), 쉰 시간 재기, 만족 게이지,
 * 게이지가 차면 티켓 받기. 놀이 화면은 손길마다 add(점수)만 부르면 된다.
 */
export function usePlay(kind: PlayKind) {
  const { state, dispatch } = useStore();
  const [session] = useState(newId);
  const { ping, get, ms: active } = useActiveTime();
  const [points, setPoints] = useState(0);
  const [phase, setPhase] = useState<PlayPhase>(() =>
    state.tickets.some((t) => t.kind === kind && t.cycle === state.nextDeparture) ? 'already' : 'playing',
  );
  const [stamp, setStamp] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const minMs = state.schedule.minPlaySeconds * 1000;

  // 이벤트·타이머에서 읽는 최신 값들
  const pointsRef = useRef(0);
  const phaseRef = useRef(phase);
  const minRef = useRef(minMs);
  const detail = useRef<Record<string, unknown> | undefined>(undefined);
  const filled = useRef(false);
  const send = useRef(dispatch);
  useEffect(() => {
    send.current = dispatch;
    minRef.current = minMs;
  }, [dispatch, minMs]);

  const go = useCallback((next: PlayPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // 시작 · 20초마다 · 나갈 때 기록 (나간 뒤 기록에는 쉰 시간 전체가 담긴다)
  useEffect(() => {
    const record = (final?: boolean) =>
      send.current({ type: 'recordPlay', session, kind, activeMs: get(), filled: filled.current, detail: detail.current, final }).catch(() => {});
    record();
    const id = setInterval(() => record(), 20000);
    return () => {
      clearInterval(id);
      record(true);
    };
  }, [session, kind, get]);

  /** 게이지가 차고 최소 시간이 지났으면 티켓을 받는다 */
  const claim = useCallback(() => {
    if (phaseRef.current !== 'playing' || pointsRef.current < GAUGE_FULL || get() < minRef.current) return;
    filled.current = true;
    go('claiming');
    play('chime', { volume: 0.8 });
    buzz.success();
    const retry = (msg: string) => {
      // 서버 시계로는 아직 짧거나 연결이 불안정하다: 조금 더 놀면 다시 시도
      setNote(msg);
      pointsRef.current = GAUGE_FULL - 12;
      setPoints(pointsRef.current);
      go('playing');
    };
    send.current({ type: 'recordPlay', session, kind, activeMs: get(), filled: true, detail: detail.current })
      .then((r) => {
        if (r?.ticket) {
          go('earned');
          setStamp(true);
        } else if (r?.hasTicket) {
          go('already');
        } else {
          retry('조금만 더 쉬어 볼까요? 곧 티켓이 나와요');
        }
      })
      .catch(() => retry('연결이 불안정해요. 조금 더 놀면 다시 받아 볼게요'));
  }, [get, go, kind, session]);

  // 점수가 먼저 차고 최소 시간을 기다리던 게이지도 때가 되면 티켓으로
  useEffect(() => {
    const id = setInterval(claim, 1000);
    return () => clearInterval(id);
  }, [claim]);

  const add = useCallback(
    (n: number) => {
      ping();
      pointsRef.current += n;
      setPoints(pointsRef.current);
      claim();
    },
    [ping, claim],
  );

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(id);
  }, [note]);

  const ratio = Math.min(1, points / GAUGE_FULL);
  // 최소 시간이 지나기 전에는 97%에서 기다린다
  const gauge = phase === 'earned' ? 1 : active < minMs ? Math.min(ratio, 0.97) : ratio;

  return {
    kind,
    add,
    ping,
    activeMs: active,
    gauge,
    phase,
    note,
    stamp,
    closeStamp: () => setStamp(false),
    setDetail: (d: Record<string, unknown>) => {
      detail.current = d;
    },
  };
}

export type Play = ReturnType<typeof usePlay>;

/** 놀이 화면 틀: 닫기 · 제목 · 소리 · 만족 게이지 · 티켓 스탬프 */
export function PlayShell({ play: p, bg, children, footer }: { play: Play; bg: string; children: ReactNode; footer?: ReactNode }) {
  const meta = PLAYS[p.kind];
  const muted = useMuted();
  useDuckMusic();
  return (
    <SafeAreaView style={[s.page, { backgroundColor: bg }]}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="짐 싸기로 돌아가기" hitSlop={10} style={s.round}>
          <Text style={s.x}>✕</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.title}>{meta.name}</Text>
          <Text style={[s.senses, { color: meta.tint }]}>{meta.senses}</Text>
        </View>
        <Pressable
          onPress={() => setMuted(!muted)}
          accessibilityRole="switch"
          accessibilityState={{ checked: !muted }}
          accessibilityLabel="효과음"
          hitSlop={10}
          style={s.round}>
          <Text style={{ fontSize: 17 }}>{muted ? '🔇' : '🔊'}</Text>
        </Pressable>
      </View>

      <Gauge play={p} />
      <View style={{ flex: 1 }}>{children}</View>
      {footer}

      {p.note && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={s.note} pointerEvents="none">
          <Text style={s.noteText}>{p.note}</Text>
        </Animated.View>
      )}
      {p.stamp && <TicketStamp kind={p.kind} onContinue={p.closeStamp} />}
    </SafeAreaView>
  );
}

function Gauge({ play: p }: { play: Play }) {
  const meta = PLAYS[p.kind];
  const w = useSharedValue(p.gauge);
  useEffect(() => {
    w.set(withTiming(p.gauge, { duration: 260 }));
  }, [p.gauge, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  const label =
    p.phase === 'earned' ? '티켓 받음 ✓' : p.phase === 'already' ? '오늘 티켓 ✓' : p.phase === 'claiming' ? '개찰 중…' : `${Math.round(p.gauge * 100)}%`;

  return (
    <View style={s.gauge} accessibilityRole="progressbar" accessibilityLabel={`만족 게이지 ${Math.round(p.gauge * 100)}%`}>
      <View style={s.gaugeTop}>
        <TicketIcon size={22} color={meta.tint} />
        <Text style={s.gaugeLabel}>만족 게이지</Text>
        <Text style={[s.gaugeValue, { color: meta.tint }]}>{label}</Text>
      </View>
      <View style={[s.track, { backgroundColor: meta.soft }]}>
        <Animated.View style={[s.fill, { backgroundColor: meta.tint }, fill]} />
      </View>
      <Text style={s.rest}>
        {p.phase === 'already' ? '오늘 막차 티켓은 받았어요. 계속 쉬어도 좋아요 · ' : ''}쉰 시간 {restLabel(p.activeMs)}
      </Text>
    </View>
  );
}

/** 작은 티켓 모양 (톱니 구멍 대신 양옆이 파인 승차권) */
export function TicketIcon({ size = 24, color = C.sky, dim }: { size?: number; color?: string; dim?: boolean }) {
  const h = size * 0.62;
  return (
    <View style={{ width: size, height: h, justifyContent: 'center' }}>
      <View style={{ width: size, height: h, borderRadius: size * 0.12, backgroundColor: dim ? 'transparent' : color, borderWidth: dim ? 1.5 : 0, borderColor: color, borderStyle: dim ? 'dashed' : 'solid' }} />
      <View style={[s.notch, { width: h * 0.42, height: h * 0.42, borderRadius: h, left: -h * 0.21, top: h * 0.29 }]} />
      <View style={[s.notch, { width: h * 0.42, height: h * 0.42, borderRadius: h, right: -h * 0.21, top: h * 0.29 }]} />
      {!dim && <View style={{ position: 'absolute', left: size * 0.62, top: h * 0.18, bottom: h * 0.18, borderLeftWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', borderStyle: 'dashed' }} />}
    </View>
  );
}

/** 게이지가 차면: 승차권이 나오고 개찰 스탬프가 쾅 */
function TicketStamp({ kind, onContinue }: { kind: PlayKind; onContinue: () => void }) {
  const meta = PLAYS[kind];
  const { myLine, nextDeparture } = useDerived();
  const scale = useSharedValue(2.6);
  const opacity = useSharedValue(0);
  useEffect(() => {
    play('paper', { volume: 0.6 });
    opacity.set(withDelay(520, withTiming(1, { duration: 80 })));
    scale.set(withDelay(520, withSpring(1, { stiffness: 320, damping: 14 })));
    const id = setTimeout(() => {
      play('stamp');
      buzz.heavy();
    }, 600);
    return () => clearTimeout(id);
  }, [opacity, scale]);
  const stampStyle = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ rotate: '-14deg' }, { scale: scale.get() }] }));
  const d = new Date(nextDeparture);
  const [punchedAt] = useState(() => Date.now());

  return (
    <Animated.View entering={FadeIn.duration(200)} style={s.backdrop}>
      <Animated.View entering={ZoomIn.springify().damping(14)} style={s.ticket}>
        <View style={[s.stub, { backgroundColor: meta.soft }]}>
          <Text style={s.stubEmoji}>{meta.emoji}</Text>
          <Text style={[s.stubText, { color: meta.tint }]}>ROLL{'\n'}ROLL</Text>
        </View>
        <View style={s.perf}>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={s.perfDot} />
          ))}
        </View>
        <View style={s.main}>
          <Text style={s.kicker}>막차 승차권</Text>
          <Text style={s.dest}>{myLine?.name ?? '오늘 밤 막차'}</Text>
          <Text style={s.when}>
            {d.getMonth() + 1}.{String(d.getDate()).padStart(2, '0')} {clock(nextDeparture)} 발
          </Text>
          <Text style={s.bag}>
            {meta.emoji} {josa(meta.luggage, '을', '를')} 가방에 담았어요
          </Text>
        </View>
        <Animated.View style={[s.stamp, stampStyle]} pointerEvents="none">
          <Text style={s.stampText}>개찰</Text>
          <Text style={s.stampTime}>{clock(punchedAt)}</Text>
        </Animated.View>
      </Animated.View>

      <Text style={s.got}>쉼 티켓 1장을 받았어요!</Text>
      <View style={s.actions}>
        <Button label="계속 쉬기" variant="ghost" onPress={onContinue} style={{ flex: 1 }} />
        <Button label="짐 싸기로" onPress={() => router.back()} style={{ flex: 1 }} />
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 6 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', ...shadow },
  x: { fontSize: 17, color: C.ink, fontWeight: '700' },
  title: { fontFamily: Font.display, fontSize: 22, color: C.ink },
  senses: { fontSize: 12, fontWeight: '700', marginTop: -2 },
  gauge: { marginHorizontal: 16, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 6, ...shadow },
  gaugeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gaugeLabel: { flex: 1, fontFamily: Font.display, fontSize: 15, color: C.ink },
  gaugeValue: { fontFamily: Font.display, fontSize: 15, fontVariant: ['tabular-nums'] },
  track: { height: 12, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  rest: { fontSize: 12, color: C.inkSoft, fontVariant: ['tabular-nums'] },
  notch: { position: 'absolute', backgroundColor: '#FFFFFF' },
  note: { position: 'absolute', top: 150, alignSelf: 'center', backgroundColor: 'rgba(46,35,28,0.88)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  noteText: { color: '#fff', fontSize: 13 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(46,35,28,0.55)', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 20 },
  ticket: { width: '100%', maxWidth: 340, flexDirection: 'row', backgroundColor: '#FFF9EC', borderRadius: 14, borderWidth: 2, borderColor: '#EAD9BD', overflow: 'visible', ...shadow },
  stub: { width: 72, alignItems: 'center', justifyContent: 'center', gap: 6, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, paddingVertical: 18 },
  stubEmoji: { fontSize: 30 },
  stubText: { fontFamily: Font.mono, fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 1 },
  perf: { width: 8, justifyContent: 'space-evenly', alignItems: 'center', paddingVertical: 6 },
  perfDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#E2CFAE' },
  main: { flex: 1, paddingVertical: 16, paddingHorizontal: 14, gap: 2 },
  kicker: { fontFamily: Font.mono, fontSize: 11, color: C.inkSoft, letterSpacing: 1 },
  dest: { fontFamily: Font.display, fontSize: 28, color: C.ink },
  when: { fontFamily: Font.display, fontSize: 16, color: C.skyDeep },
  bag: { fontSize: 13, color: C.ink, marginTop: 6 },
  stamp: { position: 'absolute', right: 14, top: -18, width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#D9534F', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,249,236,0.35)' },
  stampText: { fontFamily: Font.display, fontSize: 20, color: '#D9534F' },
  stampTime: { fontFamily: Font.mono, fontSize: 10, color: '#D9534F', fontWeight: '700' },
  got: { fontFamily: Font.display, fontSize: 24, color: '#FFF8EC' },
  actions: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 340 },
});
