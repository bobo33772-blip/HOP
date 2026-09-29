import { ScrollView, StyleSheet, View } from 'react-native';

import { BODY_COLORS, C } from '@/constants/theme';
import type { Train } from '@/lib/types';

import { CAR_RATIO, LOCO_RATIO, Loco, TrainCar } from './train-art';

/** 8칸 열차 = 필름 한 롤. 찬 칸은 창문으로 승객이 보이고, 빈 칸은 번호만 보인다. */
/** carWidth를 주면 그 폭으로 (화면 폭에 맞출 때) */
export function TrainView({ train, compact, carWidth }: { train: Train; compact?: boolean; carWidth?: number }) {
  const car = carWidth ?? (compact ? 52 : 84);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.track}>
      {/* 선로는 바퀴 뒤에 */}
      <View style={s.rail} />
      <Loco width={(car / CAR_RATIO) * LOCO_RATIO} />
      {train.seats.map((p, i) => (
        <TrainCar key={i} index={i} passenger={p} charSize={car * 0.46} style={{ width: car }} />
      ))}
    </ScrollView>
  );
}

export function seatCount(train: Train) {
  return train.seats.filter(Boolean).length;
}

export function colorOf(id: string) {
  return BODY_COLORS.find((c) => c.id === id)?.fill ?? C.sky;
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingHorizontal: 4, paddingBottom: 6 },
  rail: { position: 'absolute', left: 0, right: 0, bottom: 4, height: 4, backgroundColor: '#B08A68', borderRadius: 2 },
});
