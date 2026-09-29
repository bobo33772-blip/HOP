import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { BODY_COLORS, type BodyColorId } from '@/constants/theme';
import { CHARACTER_ART, type Expression } from '@/lib/character-art';
import type { Stage } from '@/lib/rules';
import { MASTER_HEX, cachedTint, tintCharacter } from '@/lib/tint';
import type { AnimalId } from '@/lib/types';

export type { Expression };

type Props = {
  animal: AnimalId;
  color: BodyColorId;
  size?: number;
  stage?: Stage;
  expression?: Expression;
  /** 꾹 누르기 + 진동 */
  squishable?: boolean;
  onSquish?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * 동물 얼굴이 몸과 한 덩어리인 말랑볼. 성장해도 색·실루엣·얼굴은 그대로, 질감만 바뀐다.
 * 렌더 그림은 하늘색 한 벌이고, 다른 몸 색은 기기에서 입혀 캐시한다(lib/tint).
 */
export function MallangBall({ animal, color, size = 120, stage = 'mallang', expression = 'happy', squishable, onSquish, style }: Props) {
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);

  const anim = useAnimatedStyle(() => ({
    // 발밑을 기준으로 찌그러진다
    transform: [{ translateY: (1 - sy.get()) * size * 0.42 }, { scaleX: sx.get() }, { scaleY: sy.get() }],
  }));

  const press = () => {
    sx.set(withTiming(1.2, { duration: 120 }));
    sy.set(withTiming(0.72, { duration: 120 }));
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
  };
  const release = () => {
    // 말랑이처럼 천천히 복원: 낮은 강성 + 높은 감쇠
    const slow = { stiffness: 60, damping: 9, mass: 1.2 };
    sx.set(withSequence(withTiming(1.08, { duration: 260 }), withSpring(1, slow)));
    sy.set(withSequence(withTiming(0.9, { duration: 260 }), withSpring(1, slow)));
    onSquish?.();
  };

  const body = <CharacterArt animal={animal} color={color} size={size} stage={stage} expression={expression} />;

  if (!squishable) {
    return <View style={[{ width: size, height: size }, style]}>{body}</View>;
  }
  return (
    <Pressable onPressIn={press} onPressOut={release} accessibilityRole="button" accessibilityLabel="말랑볼 꾹 누르기" style={style}>
      <Animated.View style={[{ width: size, height: size }, anim]}>{body}</Animated.View>
    </Pressable>
  );
}

type Tinted = { key: string; uri: string | null };

function CharacterArt({ animal, color, size, stage, expression }: Required<Pick<Props, 'animal' | 'color' | 'size' | 'stage' | 'expression'>>) {
  const art = CHARACTER_ART[animal][stage];
  const module = art[expression] ?? art.happy;
  const fill = (BODY_COLORS.find((b) => b.id === color) ?? BODY_COLORS[0]).fill;
  const master = fill.toUpperCase() === MASTER_HEX;
  const key = `${animal}_${stage}_${art[expression] ? expression : 'happy'}_${color}`;

  const [tinted, setTinted] = useState<Tinted | null>(null);
  useEffect(() => {
    if (master || cachedTint(key)) return;
    let alive = true;
    tintCharacter(key, module, fill).then((uri) => {
      if (alive) setTinted({ key, uri });
    });
    return () => {
      alive = false;
    };
  }, [key, master, module, fill]);

  let source: number | string | null;
  if (master) source = module;
  else {
    const hit = cachedTint(key) ?? (tinted?.key === key ? tinted.uri : undefined);
    // 색 입히기에 실패하면 하늘색 원본을 보여 준다. 만드는 중에는 잠깐 비워 둔다.
    source = hit ?? (tinted?.key === key ? module : null);
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* 바닥 그림자 */}
      <View
        style={{
          position: 'absolute',
          left: size * 0.22,
          right: size * 0.22,
          top: size * 0.905,
          height: size * 0.06,
          borderRadius: size,
          backgroundColor: 'rgba(74,52,38,0.13)',
        }}
      />
      {source !== null && <Image source={source} style={{ width: size, height: size }} contentFit="contain" transition={0} />}
    </View>
  );
}
