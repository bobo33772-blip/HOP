import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

export type NoodleId = 'ramen' | 'udon' | 'guksu';

const INK = '#6B4A33';

/** 면 종류: 국물 색 · 면 색과 굵기 · 고명 */
export const NOODLES: Record<NoodleId, { name: string; broth: string; noodle: string; thick: number; topping: ReactNode }> = {
  ramen: {
    name: '라면',
    broth: '#E9793E',
    noodle: '#F7DA80',
    thick: 4,
    topping: (
      <>
        <Ellipse cx={140} cy={37} rx={12} ry={8} fill="#FFFFFF" stroke={INK} strokeWidth={1.5} />
        <Circle cx={140} cy={37} r={4.6} fill="#F7B733" />
        {[
          [66, 34],
          [80, 47],
          [112, 49],
          [56, 43],
          [96, 33],
        ].map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={2.4} fill="#7CC47F" />
        ))}
      </>
    ),
  },
  udon: {
    name: '우동',
    broth: '#E8C48C',
    noodle: '#FFF6DE',
    thick: 8,
    topping: (
      <>
        <Circle cx={134} cy={39} r={10} fill="#FFFFFF" stroke={INK} strokeWidth={1.5} />
        <Path d="M134 39 m -5 0 a 5 5 0 1 1 5 5 a 2.5 2.5 0 1 1 -2.5 -2.5" stroke="#F39AB2" strokeWidth={2} fill="none" />
        {[
          [70, 36],
          [86, 48],
          [60, 44],
        ].map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={2.4} fill="#7CC47F" />
        ))}
      </>
    ),
  },
  guksu: {
    name: '잔치국수',
    broth: '#F1E4C6',
    noodle: '#FFFBF1',
    thick: 3,
    topping: (
      <>
        {[
          [118, 34, 14],
          [126, 44, 12],
          [134, 38, 10],
        ].map(([x, y, w], i) => (
          <Path key={`e${i}`} d={`M${x} ${y} h${w}`} stroke="#F6D55C" strokeWidth={3} strokeLinecap="round" />
        ))}
        {[
          [64, 38, 12],
          [72, 46, 10],
        ].map(([x, y, w], i) => (
          <Path key={`z${i}`} d={`M${x} ${y} h${w}`} stroke="#8BC77A" strokeWidth={3} strokeLinecap="round" />
        ))}
        <Path d="M90 33 l 10 3" stroke="#3E4A3A" strokeWidth={3} strokeLinecap="round" />
      </>
    ),
  },
};

/** 그릇 (viewBox 200×120). level = 남은 면의 양 0~1 */
export function Bowl({ noodle, level, width }: { noodle: NoodleId; level: number; width: number }) {
  const n = NOODLES[noodle];
  const count = Math.max(0, Math.round(6 * level));
  return (
    <Svg width={width} height={width * 0.6} viewBox="0 0 200 120">
      <Path d="M10 40 C 14 92, 60 114, 100 114 C 140 114, 186 92, 190 40 Z" fill="#FFFFFF" stroke={INK} strokeWidth={2.5} />
      <Path d="M24 72 C 60 86, 140 86, 176 72" stroke="#8CC8F2" strokeWidth={6} fill="none" strokeLinecap="round" />
      <Ellipse cx={100} cy={40} rx={90} ry={22} fill="#FFFFFF" stroke={INK} strokeWidth={2.5} />
      <Ellipse cx={100} cy={42} rx={80} ry={16} fill={n.broth} />
      {Array.from({ length: count }, (_, i) => (
        <Path
          key={i}
          d={`M${40 + (i % 3) * 9} ${35 + i * 2.3} q 10 -6 20 0 t 20 0 t 20 0 t 20 0`}
          stroke={n.noodle}
          strokeWidth={n.thick}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {level > 0 && n.topping}
    </Svg>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const STRAND_LEN = 240;

/**
 * 그릇에서 입까지 올라가는 면 한 가닥 (w×h 좌표).
 * lift 0 = 그릇 속, 1 = 입까지 들어 올림, 2 = 후루룩 입속으로 사라짐
 */
export function Strand({ lift, noodle, w, h, fromY, toY }: { lift: SharedValue<number>; noodle: NoodleId; w: number; h: number; fromY: number; toY: number }) {
  const n = NOODLES[noodle];
  const cx = w / 2;
  const span = fromY - toY;
  const d = `M${cx} ${fromY} C ${cx - 18} ${fromY - span * 0.25}, ${cx + 18} ${fromY - span * 0.45}, ${cx - 6} ${fromY - span * 0.62} S ${cx - 10} ${toY + span * 0.12}, ${cx} ${toY}`;
  const props = useAnimatedProps(() => ({ strokeDashoffset: STRAND_LEN * (1 - lift.get()) }));
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <AnimatedPath
        d={d}
        stroke={n.noodle}
        strokeWidth={n.thick + 2}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={[STRAND_LEN, STRAND_LEN]}
        animatedProps={props}
      />
      <AnimatedPath d={d} stroke={INK} strokeOpacity={0.25} strokeWidth={1} fill="none" strokeDasharray={[STRAND_LEN, STRAND_LEN]} animatedProps={props} />
    </Svg>
  );
}

/** 그릇 위로 피어오르는 김 세 줄기 */
export function Steam({ size }: { size: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.18, height: size * 0.6 }} pointerEvents="none">
      {[0, 1, 2].map((i) => (
        <Wisp key={i} delay={i * 600} size={size} />
      ))}
    </View>
  );
}

function Wisp({ delay, size }: { delay: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => t.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }), -1)), delay);
    return () => clearTimeout(id);
  }, [delay, t]);
  const a = useAnimatedStyle(() => ({
    opacity: t.get() < 0.2 ? t.get() * 3 : Math.max(0, 0.6 - (t.get() - 0.2) * 0.75),
    transform: [{ translateY: -t.get() * size * 0.35 }, { scaleY: 0.7 + t.get() * 0.5 }],
  }));
  return (
    <Animated.View style={a}>
      <Svg width={size * 0.14} height={size * 0.5} viewBox="0 0 14 50">
        <Path d="M7 48 C 1 38, 13 30, 7 20 S 3 6, 8 2" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

/** 생일 초. flame 1 = 활활, 0 = 꺼짐 (꺼지면 연기) */
export function Candle({ flame, size }: { flame: SharedValue<number>; size: number }) {
  const sway = useSharedValue(0);
  useEffect(() => {
    sway.set(withRepeat(withSequence(withTiming(1, { duration: 180 }), withTiming(-1, { duration: 220 })), -1, true));
  }, [sway]);
  const fire = useAnimatedStyle(() => {
    const f = flame.get();
    return {
      opacity: f > 0.04 ? 1 : 0,
      transform: [{ translateY: (1 - f) * size * 0.05 }, { rotate: `${sway.get() * (3 + (1 - f) * 10)}deg` }, { scale: 0.3 + f * 0.7 }],
    };
  });
  const smoke = useAnimatedStyle(() => {
    const f = flame.get();
    return { opacity: f <= 0.04 ? 0.7 : 0 };
  });
  return (
    <View style={{ width: size * 0.5, height: size, alignItems: 'center', justifyContent: 'flex-end' }} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', top: 0 }, smoke]}>
        <Svg width={size * 0.3} height={size * 0.3} viewBox="0 0 20 20">
          <Path d="M10 19 C 4 14, 16 10, 9 5 S 12 1, 11 0" stroke="#B9B2A8" strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ marginBottom: -2 }, fire]}>
        <Svg width={size * 0.22} height={size * 0.34} viewBox="0 0 22 34">
          <Path d="M11 1 C 16 10, 21 16, 21 23 A 10 10 0 0 1 1 23 C 1 16, 6 10, 11 1 Z" fill="#FFB938" />
          <Path d="M11 12 C 14 17, 16 20, 16 24 A 5 5 0 0 1 6 24 C 6 20, 8 17, 11 12 Z" fill="#FFF3B0" />
        </Svg>
      </Animated.View>
      {/* 심지 · 줄무늬 초 · 받침 (안드로이드는 skew를 회전으로 그려서 SVG로 그린다) */}
      <Svg width={size * 0.5} height={size * 0.56} viewBox="0 0 50 56">
        <Path d="M25 0 V7" stroke="#4A3426" strokeWidth={2} />
        <Path d="M16 7 H34 V46 H16 Z" fill="#FFFFFF" stroke={INK} strokeWidth={2} />
        {[14, 23, 32, 41].map((y) => (
          <Path key={y} d={`M17 ${y} L33 ${y - 5} L33 ${y - 1} L17 ${y + 4} Z`} fill="#F39AB2" />
        ))}
        <Ellipse cx={25} cy={49} rx={23} ry={5.5} fill="#FBE38E" stroke={INK} strokeWidth={2} />
      </Svg>
    </View>
  );
}

