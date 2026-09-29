import { Image } from 'expo-image';
import { router, type Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Font, shadow } from '@/constants/theme';
import { TAB_ART } from '@/lib/art';
import { useDerived } from '@/lib/store';


type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, { label: string; icon: ReactNode }> = {
  index: { label: '정거장', icon: <TabIcon name="index" /> },
  darkroom: { label: '현상소', icon: <TabIcon name="darkroom" /> },
  crew: { label: '크루', icon: <TabIcon name="crew" /> },
  room: { label: '내 방', icon: <TabIcon name="room" /> },
};

function TabIcon({ name }: { name: string }) {
  return <Image source={TAB_ART[name]} style={{ width: 34, height: 34 }} contentFit="contain" transition={0} />;
}

/** 정거장 · 현상소 · [쉼] · 크루 · 내 방 */
export function RollTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { tonight, ticketsMax } = useDerived();
  const routes = state.routes.filter((r) => ICONS[r.name]);
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const tab = (route: (typeof routes)[number]) => {
    const focused = state.routes[state.index]?.key === route.key;
    const meta = ICONS[route.name];
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={[s.tab, focused && s.tabOn]}>
        <View style={s.icon}>{meta.icon}</View>
        <Text style={[s.label, focused && { color: C.skyDeep }]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {left.map(tab)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`쉼 놀이로 짐 싸기, 오늘 티켓 ${tonight.length}/${ticketsMax}장`}
        onPress={() => router.push('/rest')}
        style={({ pressed }) => [s.shutter, pressed && { transform: [{ scale: 0.94 }] }]}>
        <View style={s.shutterInner}>
          <Text style={s.rest}>쉼</Text>
        </View>
        {tonight.length > 0 && (
          <View style={s.count}>
            <Text style={s.countText}>{tonight.length}</Text>
          </View>
        )}
      </Pressable>
      {right.map(tab)}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: C.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingHorizontal: 6,
    ...shadow,
  },
  tab: { alignItems: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 16, minWidth: 62 },
  tabOn: { backgroundColor: C.skySoft },
  icon: { height: 34, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: Font.display, fontSize: 13, color: C.ink },
  shutter: {
    width: 76,
    height: 76,
    marginTop: -30,
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    padding: 6,
    ...shadow,
  },
  shutterInner: { flex: 1, borderRadius: 32, backgroundColor: C.sky, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#BFE0F7' },
  rest: { fontFamily: Font.display, fontSize: 24, color: '#FFFFFF', marginTop: -2 },
  count: { position: 'absolute', right: -2, top: -2, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#E98AA2', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  countText: { fontFamily: Font.display, fontSize: 13, color: '#FFFFFF' },
});
