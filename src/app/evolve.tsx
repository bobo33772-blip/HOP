import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall } from '@/components/mallang-ball';
import { Button, Muted } from '@/components/ui';
import { C, Font } from '@/constants/theme';
import { SCENE } from '@/lib/art';
import { STAGES, type Stage } from '@/lib/rules';
import { useDerived, useStore } from '@/lib/store';

const REWARDS = { mallang: [], banjjak: ['새 필름: 흑백', '바다역 해금', '꾸미기 슬롯 +2'], rollroll: ['나만의 사진관', '모든 노선'] } as const;

export default function Evolve() {
  const { state, dispatch } = useStore();
  const { level } = useDerived();
  const me = state.profile!;
  const { preview } = useLocalSearchParams<{ preview?: Stage }>();
  // 개발용 미리보기(rollroll://evolve?preview=banjjak)
  const stage = (__DEV__ && preview && preview in STAGES ? preview : undefined) ?? state.evolved ?? me.stage;
  const { height } = useWindowDimensions();
  const hero = 220;

  const close = () => {
    dispatch({ type: 'dismissEvolved' });
    router.dismissAll();
  };

  return (
    <View style={{ flex: 1 }}>
    <Image source={SCENE.evolve} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
    {/* 배경 그림 속 받침대(화면 약 68%) 위에 발이 닿게 */}
    <Animated.View entering={ZoomIn.delay(300).springify()} style={[s.hero, { top: height * 0.68 - hero * 0.93 }]}>
      <MallangBall animal={me.animal} color={me.color} stage={stage} size={hero} squishable />
    </Animated.View>
    <SafeAreaView style={s.page} pointerEvents="box-none">
      <Animated.Text entering={FadeIn.duration(600)} style={s.title}>
        {STAGES[stage].label}로 성장했어요! ✨
      </Animated.Text>
      <Muted style={{ textAlign: 'center' }}>
        Lv.{level} 달성 · 친구 {state.friends.length}명과 함께
      </Muted>

      <View style={s.compare}>
        <MallangBall animal={me.animal} color={me.color} stage="mallang" size={64} />
        <Text style={{ fontSize: 22, color: C.inkSoft }}>→</Text>
        <MallangBall animal={me.animal} color={me.color} stage={stage} size={64} />
      </View>

      <View style={{ flex: 1 }} pointerEvents="none" />
      <View style={s.rewards}>
        {REWARDS[stage].map((r) => (
          <View key={r} style={s.reward}>
            <Text style={s.rewardText}>{r}</Text>
          </View>
        ))}
      </View>

      <Button label="정거장으로 돌아가기" onPress={close} style={{ marginHorizontal: 16 }} />
    </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, gap: 12, paddingTop: 24, paddingBottom: 16 },
  title: { fontFamily: Font.display, fontSize: 30, color: C.ink, textAlign: 'center' },
  hero: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  compare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, alignSelf: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.7)' },
  rewards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  reward: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 2, borderColor: C.skySoft },
  rewardText: { fontFamily: Font.display, fontSize: 15, color: C.skyDeep },
});
