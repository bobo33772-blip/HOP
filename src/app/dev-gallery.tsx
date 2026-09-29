import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall, type Expression } from '@/components/mallang-ball';
import { RoomView } from '@/components/room-view';
import { StationScene, type Period } from '@/components/station-scene';
import { DEST_ART } from '@/lib/art';
import { STATION_H, STATION_W } from '@/lib/station-art';
import { Button, Muted, Title } from '@/components/ui';
import { BODY_COLORS, C, Font } from '@/constants/theme';
import { DESTINATIONS, STAGES, type Stage } from '@/lib/rules';
import { ANIMALS, type Passenger, type Train } from '@/lib/types';

const ORDER: Stage[] = ['mallang', 'banjjak', 'rollroll'];
const PERIODS: Period[] = ['morning', 'day', 'sunset', 'night'];

// 정거장 미리보기용 가짜 열차 (8칸 중 5칸)
const SAMPLE_TRAIN: Train = {
  id: 'preview',
  destinationId: DESTINATIONS[0].id,
  dayKey: 'preview',
  status: 'filling',
  createdAt: 0,
  seats: Array.from({ length: 8 }, (_, i): Passenger | null =>
    i < 5 ? { userId: `p${i}`, nickname: ANIMALS[i + 1].label, animal: ANIMALS[i + 1].id, color: BODY_COLORS[i + 1].id, isMe: false } : null,
  ),
};

// 방 미리보기: 슬롯마다 아이템을 돌려 가며 25개가 모두 한 번씩 보이게
const ROOMS = [
  { wall: 'wall-cream', floor: 'floor-wood', window: 'window-day', deco: 'deco-crew', left: 'left-bed', right: 'right-plant', rug: 'rug-cloud', light: 'light-stand' },
  { wall: 'wall-pink', floor: 'floor-check', window: 'window-sunset', deco: 'deco-poster', left: 'left-sofa', right: 'right-beanbag', rug: 'rug-heart', light: 'light-string' },
  { wall: 'wall-night', floor: 'floor-dark', window: 'window-night', deco: 'deco-garland', left: 'left-tent', right: 'right-shelf', rug: 'rug-film', light: 'light-string' },
  { wall: 'wall-sky', floor: 'floor-wood', window: 'window-day', deco: 'deco-crew', left: 'left-sofa', right: 'right-shelf', rug: 'rug-cloud', light: 'light-stand' },
  { wall: 'wall-mint', floor: 'floor-check', window: 'window-sunset', deco: 'deco-garland', left: 'left-bed', right: 'right-beanbag', rug: 'rug-heart', light: 'light-stand' },
] as const;

const EXPRESSIONS: Expression[] = ['happy', 'wink', 'sleepy', 'surprised'];

/** 개발용 캐릭터 도감: 동물 8종 × 성장 3단계, 표정 4종 × 몸 색 8가지를 한 화면에서 확인한다 */
export default function DevGallery() {
  // rollroll://dev-gallery?only=rooms 처럼 한 부분만 볼 수 있다
  const { only } = useLocalSearchParams<{ only?: string }>();
  const show = (key: string) => !only || only === key;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }}>
      <ScrollView contentContainerStyle={s.page}>
        <Title>캐릭터 도감 (개발용)</Title>
        <Muted>몸 색·실루엣·얼굴은 그대로, 질감만 진화해요.</Muted>
        {show('station') && (
          <>
          <Text style={[s.head, { marginTop: 4 }]}>정거장 · 시간대</Text>
          {PERIODS.map((p) => (
            <View key={p} style={{ width: '100%', aspectRatio: STATION_W / STATION_H, borderRadius: 20, overflow: 'hidden' }}>
              <StationScene
                fixedPeriod={p}
                arrive={false}
                train={SAMPLE_TRAIN}
                destination={DESTINATIONS[0]}
                me={{ animal: 'bear', color: 'sky', stage: 'rollroll', nickname: '말랑베어' }}
                guide={{ text: '오늘은 하늘행! 하늘을 찍어 볼까요?' }}
                onBoard={() => {}}
                onStudio={() => {}}
              />
            </View>
          ))}
          </>
        )}
        {show('rooms') && (
          <>
          <Text style={[s.head, { marginTop: 12 }]}>내 방 · 아이템</Text>
          {ROOMS.map((r, i) => (
            <RoomView key={i} room={r} avatar={{ animal: ANIMALS[i].id, color: BODY_COLORS[i].id, stage: ORDER[i % 3] }} crewPhotos={[DEST_ART.sky, DEST_ART.cup, DEST_ART.green]} />
          ))}
          </>
        )}
        {show('characters') && (
          <>
          <View style={s.headRow}>
            <View style={{ width: 56 }} />
            {ORDER.map((st) => (
              <Text key={st} style={s.head}>
                {STAGES[st].label}
              </Text>
            ))}
          </View>
          {ANIMALS.map((a, i) => (
            <View key={a.id} style={s.row}>
              <Text style={s.name}>{a.label}</Text>
              {ORDER.map((st) => (
                <View key={st} style={s.cell}>
                  <MallangBall animal={a.id} color={BODY_COLORS[i % BODY_COLORS.length].id} stage={st} size={92} squishable />
                </View>
              ))}
            </View>
          ))}
          </>
        )}
        {show('expressions') && (
          <>
          <Text style={[s.head, { marginTop: 12 }]}>표정 · 몸 색</Text>
          {BODY_COLORS.map((c, i) => (
            <View key={c.id} style={s.row}>
              {EXPRESSIONS.map((e) => (
                <View key={e} style={s.cell}>
                  <MallangBall animal={ANIMALS[i].id} color={c.id} expression={e} size={72} />
                </View>
              ))}
            </View>
          ))}
          </>
        )}
        <Button label="닫기" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  head: { flex: 1, textAlign: 'center', fontFamily: Font.display, fontSize: 16, color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6 },
  name: { width: 56, textAlign: 'center', fontFamily: Font.display, fontSize: 15, color: C.ink },
  cell: { flex: 1, alignItems: 'center' },
});
