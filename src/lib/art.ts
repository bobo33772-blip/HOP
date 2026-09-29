// 3D 렌더 아트 모음 (tools/art/README.md). 캐릭터는 lib/character-art, 정거장·열차·방은 각 컴포넌트에 있다.

/** 행선지 일러스트 (3:2). 떠돌이 크루는 'drift' */
export const DEST_ART: Record<string, number> = {
  sky: require('@/assets/dest/sky.webp'),
  cup: require('@/assets/dest/cup.webp'),
  feet: require('@/assets/dest/feet.webp'),
  window: require('@/assets/dest/window.webp'),
  lunch: require('@/assets/dest/lunch.webp'),
  shadow: require('@/assets/dest/shadow.webp'),
  green: require('@/assets/dest/green.webp'),
  drift: require('@/assets/dest/drift.webp'),
};

export const destArt = (id?: string) => DEST_ART[id ?? ''] ?? DEST_ART.sky;

/** 기분 노선 그림. 빗소리행(창밖) · 천둥행(걷는 길) · 이불행(따뜻한 한 잔)은 전용 그림이 나오기 전까지 빌려 쓴다 */
export const LINE_ART: Record<string, number> = {
  sky: DEST_ART.sky,
  field: DEST_ART.lunch,
  shadow: DEST_ART.shadow,
  rain: DEST_ART.window,
  thunder: DEST_ART.feet,
  blanket: DEST_ART.cup,
  drift: DEST_ART.drift,
};

/** 열차 그림: 노선 열차는 노선 그림, 예전 열차는 날짜 행선지 그림 */
export function trainArt(t: { line?: string; drift?: boolean; destinationId: string }) {
  if (t.line) return LINE_ART[t.line] ?? DEST_ART.sky;
  return destArt(t.drift ? 'drift' : t.destinationId);
}

/** 반응 스티커: 서버에 저장되는 값(이모지) → 그림 */
export const STICKER_ART: Record<string, number> = {
  '❤️': require('@/assets/icons/st_heart.webp'),
  '✨': require('@/assets/icons/st_sparkle.webp'),
  '☁️': require('@/assets/icons/st_cloud.webp'),
  '😆': require('@/assets/icons/st_laugh.webp'),
};

export const TAB_ART: Record<string, number> = {
  index: require('@/assets/icons/tab_station.webp'),
  darkroom: require('@/assets/icons/tab_darkroom.webp'),
  crew: require('@/assets/icons/tab_crew.webp'),
  room: require('@/assets/icons/tab_room.webp'),
};

/** 화면 배경 (세로 9:16, 온보딩만 4:3) */
export const SCENE = {
  darkroom: require('@/assets/scenes/darkroom.webp'),
  departure: require('@/assets/scenes/departure.webp'),
  evolve: require('@/assets/scenes/evolve.webp'),
  onboarding: require('@/assets/scenes/onboarding.webp'),
} as const;

/** 방 꾸미기 카드 썸네일 (아이템 id → 그림) */
export const ROOM_THUMB: Record<string, number> = {
  'wall-cream': require('@/assets/room3d/thumb_wall-cream.webp'),
  'wall-sky': require('@/assets/room3d/thumb_wall-sky.webp'),
  'wall-pink': require('@/assets/room3d/thumb_wall-pink.webp'),
  'wall-mint': require('@/assets/room3d/thumb_wall-mint.webp'),
  'wall-night': require('@/assets/room3d/thumb_wall-night.webp'),
  'floor-wood': require('@/assets/room3d/thumb_floor-wood.webp'),
  'floor-dark': require('@/assets/room3d/thumb_floor-dark.webp'),
  'floor-check': require('@/assets/room3d/thumb_floor-check.webp'),
  'window-day': require('@/assets/room/window-day.webp'),
  'window-sunset': require('@/assets/room/window-sunset.webp'),
  'window-night': require('@/assets/room/window-night.webp'),
  'deco-crew': require('@/assets/room/deco-crew.webp'),
  'deco-poster': require('@/assets/room/deco-poster.webp'),
  'deco-garland': require('@/assets/room/deco-garland.webp'),
  'left-bed': require('@/assets/room3d/left-bed.webp'),
  'left-sofa': require('@/assets/room3d/left-sofa.webp'),
  'left-tent': require('@/assets/room3d/left-tent.webp'),
  'right-plant': require('@/assets/room3d/right-plant.webp'),
  'right-beanbag': require('@/assets/room3d/right-beanbag.webp'),
  'right-shelf': require('@/assets/room3d/right-shelf.webp'),
  'rug-cloud': require('@/assets/room3d/rug-cloud.webp'),
  'rug-heart': require('@/assets/room3d/rug-heart.webp'),
  'rug-film': require('@/assets/room3d/rug-film.webp'),
  'light-stand': require('@/assets/room3d/light-stand.webp'),
  'light-string': require('@/assets/room/light-string.webp'),
};

/** 꾸미기 탭 아이콘: 슬롯마다 대표 아이템 그림 */
export const SLOT_ICON: Record<string, number> = {
  wall: ROOM_THUMB['wall-sky'],
  floor: ROOM_THUMB['floor-wood'],
  window: ROOM_THUMB['window-day'],
  deco: ROOM_THUMB['deco-poster'],
  left: ROOM_THUMB['left-bed'],
  right: ROOM_THUMB['right-beanbag'],
  rug: ROOM_THUMB['rug-cloud'],
  light: ROOM_THUMB['light-stand'],
};
