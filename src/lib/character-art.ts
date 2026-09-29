// 자동 생성 파일 (scratchpad/final/install.py). 직접 고치지 말 것.
// 하늘색(#8CC8F2) 3D 렌더. 다른 몸 색은 lib/tint가 기기에서 입힌다.
import type { Stage } from '@/lib/rules';
import type { AnimalId } from '@/lib/types';

export type Expression = 'happy' | 'wink' | 'sleepy' | 'surprised';

type StageArt = { happy: number } & Partial<Record<Expression, number>>;

export const CHARACTER_ART: Record<AnimalId, Record<Stage, StageArt>> = {
  bear: {
    mallang: { happy: require('@/assets/characters/bear_mallang_happy.webp'), wink: require('@/assets/characters/bear_mallang_wink.webp'), sleepy: require('@/assets/characters/bear_mallang_sleepy.webp'), surprised: require('@/assets/characters/bear_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/bear_banjjak_happy.webp'), wink: require('@/assets/characters/bear_banjjak_wink.webp'), sleepy: require('@/assets/characters/bear_banjjak_sleepy.webp'), surprised: require('@/assets/characters/bear_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/bear_rollroll_happy.webp'), wink: require('@/assets/characters/bear_rollroll_wink.webp'), sleepy: require('@/assets/characters/bear_rollroll_sleepy.webp'), surprised: require('@/assets/characters/bear_rollroll_surprised.webp') },
  },
  pig: {
    mallang: { happy: require('@/assets/characters/pig_mallang_happy.webp'), wink: require('@/assets/characters/pig_mallang_wink.webp'), sleepy: require('@/assets/characters/pig_mallang_sleepy.webp'), surprised: require('@/assets/characters/pig_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/pig_banjjak_happy.webp'), wink: require('@/assets/characters/pig_banjjak_wink.webp'), sleepy: require('@/assets/characters/pig_banjjak_sleepy.webp'), surprised: require('@/assets/characters/pig_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/pig_rollroll_happy.webp'), wink: require('@/assets/characters/pig_rollroll_wink.webp'), sleepy: require('@/assets/characters/pig_rollroll_sleepy.webp'), surprised: require('@/assets/characters/pig_rollroll_surprised.webp') },
  },
  chick: {
    mallang: { happy: require('@/assets/characters/chick_mallang_happy.webp'), wink: require('@/assets/characters/chick_mallang_wink.webp'), sleepy: require('@/assets/characters/chick_mallang_sleepy.webp'), surprised: require('@/assets/characters/chick_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/chick_banjjak_happy.webp'), wink: require('@/assets/characters/chick_banjjak_wink.webp'), sleepy: require('@/assets/characters/chick_banjjak_sleepy.webp'), surprised: require('@/assets/characters/chick_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/chick_rollroll_happy.webp'), wink: require('@/assets/characters/chick_rollroll_wink.webp'), sleepy: require('@/assets/characters/chick_rollroll_sleepy.webp'), surprised: require('@/assets/characters/chick_rollroll_surprised.webp') },
  },
  rabbit: {
    mallang: { happy: require('@/assets/characters/rabbit_mallang_happy.webp'), wink: require('@/assets/characters/rabbit_mallang_wink.webp'), sleepy: require('@/assets/characters/rabbit_mallang_sleepy.webp'), surprised: require('@/assets/characters/rabbit_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/rabbit_banjjak_happy.webp'), wink: require('@/assets/characters/rabbit_banjjak_wink.webp'), sleepy: require('@/assets/characters/rabbit_banjjak_sleepy.webp'), surprised: require('@/assets/characters/rabbit_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/rabbit_rollroll_happy.webp'), wink: require('@/assets/characters/rabbit_rollroll_wink.webp'), sleepy: require('@/assets/characters/rabbit_rollroll_sleepy.webp'), surprised: require('@/assets/characters/rabbit_rollroll_surprised.webp') },
  },
  cat: {
    mallang: { happy: require('@/assets/characters/cat_mallang_happy.webp'), wink: require('@/assets/characters/cat_mallang_wink.webp'), sleepy: require('@/assets/characters/cat_mallang_sleepy.webp'), surprised: require('@/assets/characters/cat_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/cat_banjjak_happy.webp'), wink: require('@/assets/characters/cat_banjjak_wink.webp'), sleepy: require('@/assets/characters/cat_banjjak_sleepy.webp'), surprised: require('@/assets/characters/cat_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/cat_rollroll_happy.webp'), wink: require('@/assets/characters/cat_rollroll_wink.webp'), sleepy: require('@/assets/characters/cat_rollroll_sleepy.webp'), surprised: require('@/assets/characters/cat_rollroll_surprised.webp') },
  },
  fox: {
    mallang: { happy: require('@/assets/characters/fox_mallang_happy.webp'), wink: require('@/assets/characters/fox_mallang_wink.webp'), sleepy: require('@/assets/characters/fox_mallang_sleepy.webp'), surprised: require('@/assets/characters/fox_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/fox_banjjak_happy.webp'), wink: require('@/assets/characters/fox_banjjak_wink.webp'), sleepy: require('@/assets/characters/fox_banjjak_sleepy.webp'), surprised: require('@/assets/characters/fox_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/fox_rollroll_happy.webp'), wink: require('@/assets/characters/fox_rollroll_wink.webp'), sleepy: require('@/assets/characters/fox_rollroll_sleepy.webp'), surprised: require('@/assets/characters/fox_rollroll_surprised.webp') },
  },
  frog: {
    mallang: { happy: require('@/assets/characters/frog_mallang_happy.webp'), wink: require('@/assets/characters/frog_mallang_wink.webp'), sleepy: require('@/assets/characters/frog_mallang_sleepy.webp'), surprised: require('@/assets/characters/frog_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/frog_banjjak_happy.webp'), wink: require('@/assets/characters/frog_banjjak_wink.webp'), sleepy: require('@/assets/characters/frog_banjjak_sleepy.webp'), surprised: require('@/assets/characters/frog_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/frog_rollroll_happy.webp'), wink: require('@/assets/characters/frog_rollroll_wink.webp'), sleepy: require('@/assets/characters/frog_rollroll_sleepy.webp'), surprised: require('@/assets/characters/frog_rollroll_surprised.webp') },
  },
  sheep: {
    mallang: { happy: require('@/assets/characters/sheep_mallang_happy.webp'), wink: require('@/assets/characters/sheep_mallang_wink.webp'), sleepy: require('@/assets/characters/sheep_mallang_sleepy.webp'), surprised: require('@/assets/characters/sheep_mallang_surprised.webp') },
    banjjak: { happy: require('@/assets/characters/sheep_banjjak_happy.webp'), wink: require('@/assets/characters/sheep_banjjak_wink.webp'), sleepy: require('@/assets/characters/sheep_banjjak_sleepy.webp'), surprised: require('@/assets/characters/sheep_banjjak_surprised.webp') },
    rollroll: { happy: require('@/assets/characters/sheep_rollroll_happy.webp'), wink: require('@/assets/characters/sheep_rollroll_wink.webp'), sleepy: require('@/assets/characters/sheep_rollroll_sleepy.webp'), surprised: require('@/assets/characters/sheep_rollroll_surprised.webp') },
  },
};
