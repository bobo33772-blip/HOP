// 자동 생성 (tools/art/station_bake.py). 3D 정거장: 기차 없는 배경 위에 기관차·객차를 따로 얹는다.
// 좌표는 원본 그림(1520×2688) 픽셀 기준. 화면에서는 폭에 맞춰 배율을 곱한다.
// 안드로이드는 skew 변환을 제대로 못 그려서, 기울어진 것들(간판 글씨·전광판·빈 칸 번호)은 모두 그림에 미리 그려 두었다.

export const STATION_W = 1520;
export const STATION_H = 2688;

export const STATION_BG = {
  morning: require('@/assets/station/bg_morning.webp'),
  day: require('@/assets/station/bg_day.webp'),
  sunset: require('@/assets/station/bg_sunset.webp'),
  night: require('@/assets/station/bg_night.webp'),
} as const;

export type CarColor = 'sky' | 'pink' | 'butter' | 'lilac' | 'peach' | 'mint' | 'cream' | 'gray' | 'empty';

export type Box = { x: number; y: number; w: number; h: number };

export const LOCO = { src: require('@/assets/station/loco.webp'), box: { x: 72, y: 938, w: 266, h: 262 } as Box };

/** 칸마다: 차 상자, 창(뚫린 구멍)의 외곽 상자, 색별 그림. 색 있는 칸은 창이 뚫려 있어 뒤에 그린 승객이 보인다 */
export const CARS: { box: Box; window: Box; src: Record<CarColor, number> }[] = [
  {
    box: { x: 273, y: 972, w: 198, h: 261 },
    window: { x: 307, y: 1040, w: 87, h: 104 },
    src: {
      sky: require('@/assets/station/car0_sky.webp'),
      pink: require('@/assets/station/car0_pink.webp'),
      butter: require('@/assets/station/car0_butter.webp'),
      lilac: require('@/assets/station/car0_lilac.webp'),
      peach: require('@/assets/station/car0_peach.webp'),
      mint: require('@/assets/station/car0_mint.webp'),
      cream: require('@/assets/station/car0_cream.webp'),
      gray: require('@/assets/station/car0_gray.webp'),
      empty: require('@/assets/station/car0_empty.webp'),
    },
  },
  {
    box: { x: 418, y: 1009, w: 184, h: 265 },
    window: { x: 437, y: 1078, w: 87, h: 104 },
    src: {
      sky: require('@/assets/station/car1_sky.webp'),
      pink: require('@/assets/station/car1_pink.webp'),
      butter: require('@/assets/station/car1_butter.webp'),
      lilac: require('@/assets/station/car1_lilac.webp'),
      peach: require('@/assets/station/car1_peach.webp'),
      mint: require('@/assets/station/car1_mint.webp'),
      cream: require('@/assets/station/car1_cream.webp'),
      gray: require('@/assets/station/car1_gray.webp'),
      empty: require('@/assets/station/car1_empty.webp'),
    },
  },
  {
    box: { x: 547, y: 1043, w: 198, h: 275 },
    window: { x: 570, y: 1115, w: 91, h: 108 },
    src: {
      sky: require('@/assets/station/car2_sky.webp'),
      pink: require('@/assets/station/car2_pink.webp'),
      butter: require('@/assets/station/car2_butter.webp'),
      lilac: require('@/assets/station/car2_lilac.webp'),
      peach: require('@/assets/station/car2_peach.webp'),
      mint: require('@/assets/station/car2_mint.webp'),
      cream: require('@/assets/station/car2_cream.webp'),
      gray: require('@/assets/station/car2_gray.webp'),
      empty: require('@/assets/station/car2_empty.webp'),
    },
  },
  {
    box: { x: 686, y: 1076, w: 197, h: 291 },
    window: { x: 709, y: 1155, w: 95, h: 113 },
    src: {
      sky: require('@/assets/station/car3_sky.webp'),
      pink: require('@/assets/station/car3_pink.webp'),
      butter: require('@/assets/station/car3_butter.webp'),
      lilac: require('@/assets/station/car3_lilac.webp'),
      peach: require('@/assets/station/car3_peach.webp'),
      mint: require('@/assets/station/car3_mint.webp'),
      cream: require('@/assets/station/car3_cream.webp'),
      gray: require('@/assets/station/car3_gray.webp'),
      empty: require('@/assets/station/car3_empty.webp'),
    },
  },
  {
    box: { x: 827, y: 1124, w: 209, h: 295 },
    window: { x: 852, y: 1199, w: 101, h: 117 },
    src: {
      sky: require('@/assets/station/car4_sky.webp'),
      pink: require('@/assets/station/car4_pink.webp'),
      butter: require('@/assets/station/car4_butter.webp'),
      lilac: require('@/assets/station/car4_lilac.webp'),
      peach: require('@/assets/station/car4_peach.webp'),
      mint: require('@/assets/station/car4_mint.webp'),
      cream: require('@/assets/station/car4_cream.webp'),
      gray: require('@/assets/station/car4_gray.webp'),
      empty: require('@/assets/station/car4_empty.webp'),
    },
  },
  {
    box: { x: 979, y: 1171, w: 207, h: 300 },
    window: { x: 1004, y: 1249, w: 100, h: 118 },
    src: {
      sky: require('@/assets/station/car5_sky.webp'),
      pink: require('@/assets/station/car5_pink.webp'),
      butter: require('@/assets/station/car5_butter.webp'),
      lilac: require('@/assets/station/car5_lilac.webp'),
      peach: require('@/assets/station/car5_peach.webp'),
      mint: require('@/assets/station/car5_mint.webp'),
      cream: require('@/assets/station/car5_cream.webp'),
      gray: require('@/assets/station/car5_gray.webp'),
      empty: require('@/assets/station/car5_empty.webp'),
    },
  },
  {
    box: { x: 1131, y: 1225, w: 206, h: 301 },
    window: { x: 1158, y: 1303, w: 104, h: 119 },
    src: {
      sky: require('@/assets/station/car6_sky.webp'),
      pink: require('@/assets/station/car6_pink.webp'),
      butter: require('@/assets/station/car6_butter.webp'),
      lilac: require('@/assets/station/car6_lilac.webp'),
      peach: require('@/assets/station/car6_peach.webp'),
      mint: require('@/assets/station/car6_mint.webp'),
      cream: require('@/assets/station/car6_cream.webp'),
      gray: require('@/assets/station/car6_gray.webp'),
      empty: require('@/assets/station/car6_empty.webp'),
    },
  },
  {
    box: { x: 1287, y: 1274, w: 218, h: 306 },
    window: { x: 1313, y: 1355, w: 103, h: 121 },
    src: {
      sky: require('@/assets/station/car7_sky.webp'),
      pink: require('@/assets/station/car7_pink.webp'),
      butter: require('@/assets/station/car7_butter.webp'),
      lilac: require('@/assets/station/car7_lilac.webp'),
      peach: require('@/assets/station/car7_peach.webp'),
      mint: require('@/assets/station/car7_mint.webp'),
      cream: require('@/assets/station/car7_cream.webp'),
      gray: require('@/assets/station/car7_gray.webp'),
      empty: require('@/assets/station/car7_empty.webp'),
    },
  },
];

/** 전광판 행선지 이름 (전광판 기울기대로 그린 글씨) */
export const BOARD_TEXT: Record<string, { src: number; box: Box }> = {
  sky: { src: require('@/assets/station/board_sky.webp'), box: { x: 1013, y: 866, w: 228, h: 168 } },
  cup: { src: require('@/assets/station/board_cup.webp'), box: { x: 998, y: 862, w: 258, h: 175 } },
  feet: { src: require('@/assets/station/board_feet.webp'), box: { x: 1012, y: 866, w: 231, h: 168 } },
  window: { src: require('@/assets/station/board_window.webp'), box: { x: 1010, y: 866, w: 233, h: 168 } },
  lunch: { src: require('@/assets/station/board_lunch.webp'), box: { x: 1016, y: 868, w: 223, h: 165 } },
  shadow: { src: require('@/assets/station/board_shadow.webp'), box: { x: 984, y: 860, w: 286, h: 181 } },
  green: { src: require('@/assets/station/board_green.webp'), box: { x: 1014, y: 864, w: 226, h: 171 } },
};
