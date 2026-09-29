import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { C, Font } from '@/constants/theme';
import type { Passenger } from '@/lib/types';

import { MallangBall } from './mallang-ball';

// 3D 렌더 열차 (assets/world). 객차는 한 벌을 6가지 색으로 입힌 것.
const LOCO = require('@/assets/world/train_loco.webp');
const CARS = [
  require('@/assets/world/train_car_0.webp'),
  require('@/assets/world/train_car_1.webp'),
  require('@/assets/world/train_car_2.webp'),
  require('@/assets/world/train_car_3.webp'),
  require('@/assets/world/train_car_4.webp'),
  require('@/assets/world/train_car_5.webp'),
];
const CAR_EMPTY = require('@/assets/world/train_car_empty.webp');

/** 그림 비율(가로/세로) */
export const LOCO_RATIO = 1.22;
export const CAR_RATIO = 1.4;

/** 기관차. width만 주면 높이는 그림 비율대로 */
export function Loco({ width }: { width: number | `${number}%` }) {
  return <Image source={LOCO} style={{ width, aspectRatio: LOCO_RATIO }} contentFit="contain" transition={0} />;
}

/**
 * 객차 한 칸. 승객은 창문으로 얼굴을 내밀고, 빈 칸은 번호만 보인다.
 * width는 숫자(px)일 때만 캐릭터 크기를 계산할 수 있어서, 퍼센트 배치는 flex 부모가 크기를 정하고 charSize를 따로 준다.
 */
export function TrainCar({ index, passenger, charSize, style }: { index: number; passenger: Passenger | null; charSize: number; style?: object }) {
  const me = !!passenger?.isMe;
  return (
    <View style={[{ aspectRatio: CAR_RATIO }, style]} accessibilityLabel={passenger ? `${index + 1}번 칸 ${passenger.nickname}` : `${index + 1}번 칸 빈자리`}>
      <Image source={passenger ? CARS[index % CARS.length] : CAR_EMPTY} style={[StyleSheet.absoluteFill, !passenger && { opacity: 0.75 }]} contentFit="contain" transition={0} />
      <View style={s.window} pointerEvents="none">
        {passenger ? (
          <MallangBall animal={passenger.animal} color={passenger.color} size={charSize} />
        ) : (
          <Text style={[s.num, { fontSize: Math.max(9, charSize * 0.42) }]}>{index + 1}</Text>
        )}
      </View>
      {me && <View style={s.me} />}
    </View>
  );
}

const s = StyleSheet.create({
  // 그림 속 창문 영역 (가로 15~85%, 세로 22~74%)
  window: { position: 'absolute', left: '12%', right: '12%', top: '8%', bottom: '26%', alignItems: 'center', justifyContent: 'flex-end' },
  num: { fontFamily: Font.display, color: '#A89A88' },
  me: { position: 'absolute', left: '30%', right: '30%', bottom: -4, height: 4, borderRadius: 2, backgroundColor: C.skyDeep },
});
