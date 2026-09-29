import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { C } from '@/constants/theme';

const BEAR = require('@/assets/images/splash-icon.png');
/** 네이티브 스플래시(app.json imageWidth)와 같은 크기라 이어서 보인다 */
const SIZE = 200;
/** 너무 빨리 사라져 깜빡이지 않게 최소로 보여 주는 시간 */
const MIN_MS = 1200;

/**
 * 네이티브 스플래시를 그대로 이어받는 JS 스플래시.
 * 개발 빌드에서는 번들을 받는 동안 네이티브 스플래시가 일찍 닫혀서, 준비될 때까지 같은 화면을 대신 보여 준다.
 */
export function BootSplash({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false);
  const [minPassed, setMinPassed] = useState(false);
  const opacity = useSharedValue(1);
  const squash = useSharedValue(1);

  useEffect(() => {
    // 같은 그림이 이미 덮고 있으니 네이티브 스플래시는 바로 닫는다
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => setMinPassed(true), MIN_MS);
    // 말랑하게 숨 쉬기
    squash.set(withDelay(250, withRepeat(withSequence(withTiming(0.94, { duration: 520, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 620, easing: Easing.out(Easing.back(2)) })), -1)));
    return () => clearTimeout(t);
  }, [squash]);

  useEffect(() => {
    if (!ready || !minPassed) return;
    opacity.set(withTiming(0, { duration: 380 }));
    const t = setTimeout(() => setGone(true), 420);
    return () => clearTimeout(t);
  }, [ready, minPassed, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const bounce = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - squash.get()) * SIZE * 0.4 }, { scaleX: 2 - squash.get() }, { scaleY: squash.get() }],
  }));

  if (gone) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.box, fade]} pointerEvents={ready ? 'none' : 'auto'}>
      <Animated.View style={bounce}>
        <Image source={BEAR} style={{ width: SIZE, height: SIZE }} contentFit="contain" transition={0} />
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
});
