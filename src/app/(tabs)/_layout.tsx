import { Redirect, Tabs, router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { RollTabBar } from '@/components/roll-tab-bar';
import { C } from '@/constants/theme';
import { useStore } from '@/lib/store';

export default function TabsLayout() {
  const { state } = useStore();
  const shown = useRef<string | null>(null);

  // 열차 출발·성장은 어느 탭에 있든 연출 화면으로 알린다. 같은 이벤트는 한 번만 띄운다.
  useEffect(() => {
    const key = state.celebrate ? `depart:${state.celebrate}` : state.evolved ? `evolve:${state.evolved}` : null;
    if (!key) {
      shown.current = null;
      return;
    }
    if (shown.current === key) return;
    shown.current = key;
    router.push(state.celebrate ? '/departure' : '/evolve');
  }, [state.celebrate, state.evolved]);

  if (!state.profile) return <Redirect href="/onboarding" />;

  return (
    <Tabs tabBar={(props) => <RollTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.cream } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="darkroom" />
      <Tabs.Screen name="crew" />
      <Tabs.Screen name="room" />
    </Tabs>
  );
}
