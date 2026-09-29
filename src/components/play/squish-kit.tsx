import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { MallangBall, type Expression } from '@/components/mallang-ball';
import { Font } from '@/constants/theme';
import type { Stage } from '@/lib/rules';
import { buzz, play } from '@/lib/sound';
import type { BodyColorId } from '@/constants/theme';
import type { AnimalId } from '@/lib/types';

type BallProps = {
  animal: AnimalId;
  color: BodyColorId;
  stage: Stage;
  size: number;
  /** 손길이 이어지는 동안 (쉰 시간 재기) */
  onTouch: () => void;
  /** 손을 뗐을 때. stretch = 가장 많이 늘어난 배율(1이면 꾹 누르기만) */
  onRelease: (stretch: number) => void;
  /** 바뀔 때마다 통 튄다 (키캡을 누를 때) */
  bump: number;
};

/**
 * 슬라임처럼 늘어나는 말랑볼. 꾹 누르면 발밑 기준으로 찌그러지고,
 * 잡아 끌면 손가락 쪽으로 쭉 늘어났다가(반대편은 제자리) 놓으면 출렁이며 돌아온다.
 * 터치는 RN 응답자(responder)로 받는다: 누르는 즉시 반응하고, 손을 떼기 전까지 이 공이 터치를 붙잡는다.
 */
export function StretchyBall({ animal, color, stage, size, onTouch, onRelease, bump }: BallProps) {
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const k = useSharedValue(1);
  const ang = useSharedValue(0);
  const hop = useSharedValue(0);
  const [face, setFace] = useState<Expression>('happy');
  const drag = useRef({ x: 0, y: 0, stretching: false, max: 1, tick: 1 });
  const faceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bump) return;
    hop.set(withSequence(withTiming(-size * 0.06, { duration: 80 }), withSpring(0, { stiffness: 320, damping: 11 })));
  }, [bump, hop, size]);

  useEffect(
    () => () => {
      if (faceTimer.current) clearTimeout(faceTimer.current);
    },
    [],
  );

  const begin = (e: GestureResponderEvent) => {
    drag.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, stretching: false, max: 1, tick: 1 };
    sx.set(withTiming(1.16, { duration: 110 }));
    sy.set(withTiming(0.78, { duration: 110 }));
    play('squish', { volume: 0.9 });
    buzz.soft();
    setFace('wink');
    onTouch();
  };

  const move = (e: GestureResponderEvent) => {
    const st = drag.current;
    const dx = e.nativeEvent.pageX - st.x;
    const dy = e.nativeEvent.pageY - st.y;
    const d = Math.hypot(dx, dy);
    if (d < 14 && !st.stretching) return;
    if (!st.stretching) {
      st.stretching = true;
      play('stretch', { volume: 0.7 });
      setFace('surprised');
      sx.set(withTiming(1, { duration: 120 }));
      sy.set(withTiming(1, { duration: 120 }));
    }
    // 멀리 끌수록 덜 늘어나는 고무줄 느낌 (최대 약 1.8배)
    const far = size * 0.85;
    const next = 1 + ((far * (1 - Math.exp(-d / far))) / size) * 0.95;
    ang.set(Math.atan2(dy, dx));
    k.set(next);
    st.max = Math.max(st.max, next);
    // 늘어나는 동안 톡톡
    if (Math.abs(next - st.tick) > 0.07) {
      if (next > st.tick) buzz.tick();
      st.tick = next;
    }
    onTouch();
  };

  const end = () => {
    const st = drag.current;
    if (st.stretching) {
      k.set(withSpring(1, { stiffness: 170, damping: 6, mass: 0.9 }));
      play('pop', { volume: Math.min(1, 0.45 + (st.max - 1) * 1.1) });
      buzz.medium();
    } else {
      // 말랑이처럼 천천히 복원: 낮은 강성 + 높은 감쇠
      const soft = { stiffness: 60, damping: 9, mass: 1.2 };
      sx.set(withSequence(withTiming(1.08, { duration: 240 }), withSpring(1, soft)));
      sy.set(withSequence(withTiming(0.9, { duration: 240 }), withSpring(1, soft)));
      play('pop', { volume: 0.5 });
    }
    onRelease(st.stretching ? st.max : 1);
    if (faceTimer.current) clearTimeout(faceTimer.current);
    faceTimer.current = setTimeout(() => setFace('happy'), 650);
  };

  const style = useAnimatedStyle(() => {
    const kk = k.get();
    const a = ang.get();
    const ext = (kk - 1) * size * 0.5; // 반대편 가장자리는 제자리에 두고 손가락 쪽으로 늘어난다
    return {
      transform: [
        { translateX: Math.cos(a) * ext },
        { translateY: Math.sin(a) * ext + hop.get() },
        { rotate: `${a}rad` },
        { scaleX: kk },
        { scaleY: 1 / Math.sqrt(Math.max(kk, 0.5)) },
        { rotate: `${-a}rad` },
        { translateY: (1 - sy.get()) * size * 0.42 },
        { scaleX: sx.get() },
        { scaleY: sy.get() },
      ],
    };
  });

  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={begin}
      onResponderMove={move}
      onResponderRelease={end}
      onResponderTerminate={end}
      accessibilityRole="adjustable"
      accessibilityLabel="말랑볼 늘리기와 누르기"
      style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, style]} pointerEvents="none">
        <MallangBall animal={animal} color={color} stage={stage} size={size} expression={face} />
      </Animated.View>
    </View>
  );
}

/** 표정마다 몸 색 입히기를 미리 해 둔다 (처음 표정이 바뀔 때 깜빡이지 않게) */
export function WarmFaces({ animal, color, stage }: { animal: AnimalId; color: BodyColorId; stage: Stage }) {
  return (
    <View style={{ position: 'absolute', opacity: 0, width: 1, height: 1, overflow: 'hidden' }} pointerEvents="none">
      {(['wink', 'surprised', 'sleepy'] as const).map((e) => (
        <MallangBall key={e} animal={animal} color={color} stage={stage} size={1} expression={e} />
      ))}
    </View>
  );
}

const KEYS = [
  { label: '롤', top: '#FCD6E0', side: '#E7A3B6' },
  { label: '롤', top: '#FDF0B6', side: '#E3C96C' },
  { label: '쉼', top: '#D2F2DF', side: '#8CCBA6' },
  { label: '♡', top: '#E4DAFA', side: '#B39FE2' },
  { label: '☁', top: '#D3EAFB', side: '#8DBFE6' },
];

/** 나무 받침 위 키캡 다섯 개. 누를 때마다 딸깍 소리와 딱딱한 진동 */
export function Keycaps({ onKey }: { onKey: (i: number) => void }) {
  return (
    <View style={s.tray}>
      {KEYS.map((k, i) => (
        <Keycap key={i} {...k} onPress={() => onKey(i)} />
      ))}
    </View>
  );
}

function Keycap({ label, top, side, onPress }: { label: string; top: string; side: string; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => {
        setDown(true);
        onPress();
      }}
      onPressOut={() => setDown(false)}
      accessibilityRole="button"
      accessibilityLabel={`키캡 ${label}`}
      style={s.key}>
      <View style={[s.keySide, { backgroundColor: side }]} />
      <View style={[s.keyTop, { backgroundColor: top, borderColor: side, transform: [{ translateY: down ? 6 : 0 }] }]}>
        <Text style={s.keyLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tray: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    borderRadius: 22,
    backgroundColor: '#D9AE83',
    borderWidth: 3,
    borderColor: '#B98B66',
  },
  key: { width: 56, height: 62 },
  keySide: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 54, borderRadius: 14 },
  keyTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 54, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  keyLabel: { fontFamily: Font.display, fontSize: 22, color: '#6B4A33' },
});
