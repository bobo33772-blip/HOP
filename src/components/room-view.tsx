import { Image, type ImageSource } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Image as SvgImage } from 'react-native-svg';

import type { BodyColorId } from '@/constants/theme';
import type { SlotId } from '@/lib/room';
import type { Stage } from '@/lib/rules';
import type { AnimalId } from '@/lib/types';

import { MallangBall } from './mallang-ball';

// 3D 방 좌표계: 2048×2048 정사각 그림 기준 (tools/art/room3d_layout.json, wall_bake.py)
const N = 2048;

/** 벽지 5종은 방 전체 그림, 바닥 2종은 바닥만 오린 덮개 (원목 바닥은 벽지 그림에 들어 있음) */
const WALL: Record<string, number> = {
  'wall-cream': require('@/assets/room3d/wall-cream.webp'),
  'wall-sky': require('@/assets/room3d/wall-sky.webp'),
  'wall-pink': require('@/assets/room3d/wall-pink.webp'),
  'wall-mint': require('@/assets/room3d/wall-mint.webp'),
  'wall-night': require('@/assets/room3d/wall-night.webp'),
};
const FLOOR: Record<string, number> = {
  'floor-dark': require('@/assets/room3d/floor-dark.webp'),
  'floor-check': require('@/assets/room3d/floor-check.webp'),
};
const FLOOR_BOX = { x: 12, y: 933, w: 2024, h: 1035 };

type Box = { x: number; y: number; w: number; h: number };

/**
 * 벽에 거는 것들. 기울어진 벽면에 맞춰 미리 그려 둔 그림(그림자 포함)이라 앱에서는 제자리에 놓기만 한다.
 * (안드로이드는 skew 변환을 제대로 못 그려서 변환 없이 쓴다)
 */
const ON_WALL: Record<string, { src: number; box: Box }> = {
  'window-day': { src: require('@/assets/room3d/wall_window-day.webp'), box: { x: 352, y: 360, w: 416, h: 659 } },
  'window-sunset': { src: require('@/assets/room3d/wall_window-sunset.webp'), box: { x: 343, y: 382, w: 434, h: 615 } },
  'window-night': { src: require('@/assets/room3d/wall_window-night.webp'), box: { x: 352, y: 364, w: 416, h: 652 } },
  'deco-crew': { src: require('@/assets/room3d/wall_deco-crew.webp'), box: { x: 1105, y: 442, w: 470, h: 515 } },
  'deco-poster': { src: require('@/assets/room3d/wall_deco-poster.webp'), box: { x: 1167, y: 408, w: 326, h: 563 } },
  'deco-garland': { src: require('@/assets/room3d/wall_deco-garland.webp'), box: { x: 1060, y: 403, w: 560, h: 474 } },
  'light-string-left': { src: require('@/assets/room3d/wall_light-string-left.webp'), box: { x: 87, y: 163, w: 866, h: 704 } },
  'light-string-right': { src: require('@/assets/room3d/wall_light-string-right.webp'), box: { x: 1097, y: 168, w: 866, h: 764 } },
};
/** 크루 앨범 액자 속 사진 칸: SVG에서 matrix(1 slope 0 1 0 0)로 기울이면 칸 모양과 같다 */
const CREW_SLOPE = 0.43;
const CREW_SLOTS: Box[] = [
  { x: 1194.3, y: 70.8, w: 77, h: 115.8 },
  { x: 1300.3, y: 70.8, w: 77, h: 115.8 },
  { x: 1406.2, y: 70.8, w: 77, h: 115.8 },
];

/** 바닥에 놓이는 3D 가구 (발밑 가운데 기준) */
const FURNITURE: Record<string, { src: number; ratio: number; bx: number; by: number; w: number }> = {
  'left-bed': { src: require('@/assets/room3d/left-bed.webp'), ratio: 1.1915, bx: 540, by: 1560, w: 820 },
  'left-sofa': { src: require('@/assets/room3d/left-sofa.webp'), ratio: 1.2933, bx: 560, by: 1440, w: 700 },
  'left-tent': { src: require('@/assets/room3d/left-tent.webp'), ratio: 0.9429, bx: 540, by: 1460, w: 600 },
  'right-plant': { src: require('@/assets/room3d/right-plant.webp'), ratio: 0.8625, bx: 1730, by: 1330, w: 330 },
  'right-beanbag': { src: require('@/assets/room3d/right-beanbag.webp'), ratio: 1.1499, bx: 1650, by: 1560, w: 470 },
  'light-stand': { src: require('@/assets/room3d/light-stand.webp'), ratio: 0.3339, bx: 1010, by: 1010, w: 170 },
};
/** 바닥에 깔리는 러그 (가운데 기준) */
const RUG: Record<string, { src: number; ratio: number }> = {
  'rug-cloud': { src: require('@/assets/room3d/rug-cloud.webp'), ratio: 2.1456 },
  'rug-heart': { src: require('@/assets/room3d/rug-heart.webp'), ratio: 2.0818 },
  'rug-film': { src: require('@/assets/room3d/rug-film.webp'), ratio: 1.9858 },
};
const RUG_AT = { cx: 1010, cy: 1480, w: 860 };
/** 오른쪽 벽 위쪽의 카메라 선반 (3D로 그린 그림) */
const SHELF = { src: require('@/assets/room3d/right-shelf.webp'), ratio: 1.3759, cx: 1760, cy: 580, w: 420 };
const AVATAR = { bx: 1010, by: 1560, size: 430 };

type Props = {
  room: Record<SlotId, string>;
  avatar: { animal: AnimalId; color: BodyColorId; stage: Stage };
  /** 크루 앨범 액자에 걸 사진 (최대 3장) */
  crewPhotos: (ImageSource | string | number)[];
};

/** 인형의 집처럼 잘라 본 3D 방. 벽지·바닥·가구가 슬롯마다 바뀐다. */
export function RoomView({ room, avatar, crewPhotos }: Props) {
  const [w, setW] = useState(0);
  const k = w / N;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const box = (b: Box) => ({ position: 'absolute' as const, left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k });

  const onWall = (id: string) => {
    const it = ON_WALL[id];
    return it ? <Image key={id} source={it.src} style={box(it.box)} contentFit="fill" transition={0} pointerEvents="none" /> : null;
  };
  const onFloor = (id: string) => {
    const f = FURNITURE[id];
    if (!f) return null;
    const h = f.w / f.ratio;
    return (
      <View key={id} style={box({ x: f.bx - f.w / 2, y: f.by - h, w: f.w, h })} pointerEvents="none">
        {/* 바닥 그림자 */}
        <View style={[s.shadow, { left: '12%', right: '12%', bottom: -h * 0.02 * k, height: f.w * 0.16 * k, borderRadius: f.w * k }]} />
        <Image source={f.src} style={StyleSheet.absoluteFill} contentFit="contain" contentPosition="bottom" transition={0} />
      </View>
    );
  };

  const rug = RUG[room.rug];
  const size = AVATAR.size * k;
  const photos = crewPhotos.slice(0, 3).map((p) => (typeof p === 'string' ? { uri: p } : p));

  return (
    <View style={s.box} onLayout={onLayout}>
      {w > 0 && (
        <>
          <Image source={WALL[room.wall] ?? WALL['wall-cream']} style={StyleSheet.absoluteFill} contentFit="fill" transition={200} />
          {FLOOR[room.floor] && <Image source={FLOOR[room.floor]} style={box(FLOOR_BOX)} contentFit="fill" transition={200} />}

          {room.light === 'light-string' && [onWall('light-string-left'), onWall('light-string-right')]}
          {onWall(room.window)}
          {onWall(room.deco)}
          {room.deco === 'deco-crew' && photos.length > 0 && (
            <Svg width={w} height={w} viewBox={`0 0 ${N} ${N}`} style={StyleSheet.absoluteFill} pointerEvents="none">
              {photos.map((src, i) => {
                const sl = CREW_SLOTS[i];
                return (
                  <SvgImage
                    key={i}
                    href={src as never}
                    x={sl.x}
                    y={sl.y}
                    width={sl.w}
                    height={sl.h}
                    preserveAspectRatio="xMidYMid slice"
                    transform={`matrix(1 ${CREW_SLOPE} 0 1 0 0)`}
                  />
                );
              })}
            </Svg>
          )}
          {room.right === 'right-shelf' && (
            <Image source={SHELF.src} style={box({ x: SHELF.cx - SHELF.w / 2, y: SHELF.cy - SHELF.w / SHELF.ratio / 2, w: SHELF.w, h: SHELF.w / SHELF.ratio })} contentFit="contain" transition={0} />
          )}
          {room.light === 'light-stand' && onFloor('light-stand')}
          {rug && <Image source={rug.src} style={box({ x: RUG_AT.cx - RUG_AT.w / 2, y: RUG_AT.cy - RUG_AT.w / rug.ratio / 2, w: RUG_AT.w, h: RUG_AT.w / rug.ratio })} contentFit="contain" transition={0} />}
          {onFloor(room.left)}
          {room.right !== 'right-shelf' && onFloor(room.right)}

          <View style={[s.avatar, { left: AVATAR.bx * k - size / 2, top: AVATAR.by * k - size * 0.93, width: size }]} pointerEvents="box-none">
            <MallangBall animal={avatar.animal} color={avatar.color} stage={avatar.stage} size={size} squishable />
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: '#CFE6F7' },
  shadow: { position: 'absolute', backgroundColor: 'rgba(74,52,38,0.16)' },
  avatar: { position: 'absolute', alignItems: 'center' },
});
