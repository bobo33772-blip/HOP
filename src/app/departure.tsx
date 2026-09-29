import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall } from '@/components/mallang-ball';
import { StationScene } from '@/components/station-scene';
import { Button, Muted } from '@/components/ui';
import { BODY_COLORS, C, Font } from '@/constants/theme';
import { arrivalLabel, trainDestination } from '@/lib/format';
import { DESTINATIONS } from '@/lib/rules';
import { ANIMALS, type Train } from '@/lib/types';
import { useStore } from '@/lib/store';

/** 정거장에서 기차가 출발해 화면 밖으로 나가는 시간 (station-scene의 출발 연출과 맞춘다) */
const DEPART_MS = 5200;

export default function Departure() {
  const { state, dispatch } = useStore();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  // 개발용 미리보기(rollroll://departure?preview=1): 8칸이 꽉 찬 가짜 열차
  const train = (__DEV__ && preview ? previewTrain() : undefined) ?? state.trains.find((t) => t.id === state.celebrate) ?? state.trains.filter((t) => t.status === 'departed').at(-1);
  const me = state.profile;

  if (!train) return null;
  const dest = trainDestination(train);
  const riders = train.seats.filter(Boolean).length;

  const close = (to: '/' | `/crew/${string}`) => {
    dispatch({ type: 'dismissCelebrate' });
    router.dismissAll();
    if (to !== '/') router.push(to);
  };

  return (
    <View style={{ flex: 1 }}>
    {/* 3D 정거장에 선 우리 열차가 잠시 뒤 앞으로 달려 나간다 */}
    <StationScene
      train={train}
      destination={dest}
      me={{ animal: me?.animal ?? 'bear', color: me?.color ?? 'sky', stage: me?.stage ?? 'mallang', nickname: me?.nickname ?? '' }}
      arrive={false}
      depart
    />
    <SafeAreaView style={s.page}>
      <Animated.View entering={ZoomIn.springify()} style={s.head}>
        <Text style={s.title}>
          {dest.name} 막차 출발! 🎉
        </Text>
        <Text style={s.sub}>{riders > 1 ? `${riders}명의 말랑볼이 함께 떠나요` : '말랑볼이 여행을 떠나요'}</Text>
        <View style={s.xp}>
          <Text style={s.xpText}>{state.growth.trips + 1}번째 여행</Text>
        </View>
      </Animated.View>

      <View style={{ flex: 1 }} />
      {/* 크루 카드는 기차가 화면 밖으로 떠난 뒤에 올라온다 (그 전에는 선로를 가리지 않게) */}
      <Animated.View entering={FadeInDown.delay(DEPART_MS)} style={s.crew}>
        {train.seats.map((p, i) =>
          p ? (
            <View key={i} style={s.member}>
              <MallangBall animal={p.animal} color={p.color} size={54} expression={i % 3 === 0 ? 'wink' : 'happy'} />
              <Text style={[s.nick, p.isMe && { color: C.skyDeep }]} numberOfLines={1}>
                {p.isMe ? '나' : p.nickname}
              </Text>
            </View>
          ) : null,
        )}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(DEPART_MS + 200)} style={s.noteWrap}>
        <Muted style={s.note}>
        {train.arrivesAt ? `${arrivalLabel(train.arrivesAt)}에 도착해요. 앨범에서 인사를 나눠 보세요.` : '앨범에서 인사를 나눠 보세요.'}
      </Muted>
      </Animated.View>
      <Button label="크루 앨범 보러 가기" onPress={() => close(`/crew/${train.id}`)} style={{ marginHorizontal: 16 }} />
      <Button label="정거장으로" variant="ghost" onPress={() => close('/')} style={{ marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.85)' }} />
    </SafeAreaView>
    </View>
  );
}

function previewTrain(): Train {
  return {
    id: 'preview',
    destinationId: DESTINATIONS[0].id,
    dayKey: 'preview',
    status: 'departed',
    createdAt: 0,
    departsAt: Date.now(),
    arrivesAt: Date.now() + 8 * 3600000,
    seats: ANIMALS.map((a, i) => ({ userId: `p${i}`, nickname: i === 0 ? '말랑베어' : a.label, animal: a.id, color: BODY_COLORS[i].id, isMe: i === 0 })),
  };
}

const s = StyleSheet.create({
  page: { flex: 1, gap: 10, paddingBottom: 16 },
  head: { alignItems: 'center', gap: 4, marginTop: 24, marginHorizontal: 20, paddingVertical: 14, borderRadius: 24, backgroundColor: 'rgba(255,248,236,0.9)' },
  noteWrap: { alignSelf: 'center' },
  note: { textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.8)', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  title: { fontFamily: Font.display, fontSize: 32, color: C.skyDeep, textAlign: 'center' },
  sub: { fontFamily: Font.display, fontSize: 18, color: C.ink },
  xp: { marginTop: 8, backgroundColor: C.sky, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 4 },
  xpText: { fontFamily: Font.display, color: '#fff', fontSize: 18 },
  crew: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: 'rgba(255,248,236,0.88)' },
  member: { width: 70, alignItems: 'center' },
  nick: { fontSize: 12, color: C.ink },
});
