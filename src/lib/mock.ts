import type { Passenger } from './types';

/**
 * 서버 연결 전 흐름 확인용 가짜 승객. Supabase 연결 후 실제 사용자로 대체한다.
 */
export const MOCK_PHOTOS = [
  require('@/assets/mock/sky1.jpg'),
  require('@/assets/mock/sky2.jpg'),
  require('@/assets/mock/sky3.jpg'),
  require('@/assets/mock/sky4.jpg'),
  require('@/assets/mock/sky5.jpg'),
  require('@/assets/mock/sky6.jpg'),
  require('@/assets/mock/sky7.jpg'),
  require('@/assets/mock/sky8.jpg'),
];

const POOL: Omit<Passenger, 'photoUri'>[] = [
  { userId: 'm-pink', nickname: '핑크', animal: 'pig', color: 'pink' },
  { userId: 'm-rabi', nickname: '라비', animal: 'rabbit', color: 'lilac' },
  { userId: 'm-bbiyak', nickname: '삐약이', animal: 'chick', color: 'butter' },
  { userId: 'm-nyang', nickname: '냥이', animal: 'cat', color: 'gray' },
  { userId: 'm-yeowoo', nickname: '여우냥', animal: 'fox', color: 'peach' },
  { userId: 'm-gaegul', nickname: '개굴이', animal: 'frog', color: 'mint' },
  { userId: 'm-mongsil', nickname: '몽실이', animal: 'sheep', color: 'cream' },
  { userId: 'm-gombly', nickname: '곰블리', animal: 'bear', color: 'sky' },
];

export const MOCK_COMMENTS = [
  '저도 이 시간에 하늘 봤어요!',
  '오늘 구름 정말 예뻐요',
  '비행기 따라가고 싶다',
  '나무 사이로 보이는 하늘 최고',
  '노을 너무 예쁘다',
  '구름 위라니 신기해요',
  '오늘도 하늘은 예술이에요',
  '일몰이 너무 아름다워요',
];

let cursor = 0;

/** 이미 탄 사람과 겹치지 않는 가짜 승객 한 명 */
export function nextMockPassenger(exclude: string[]): Passenger {
  for (let i = 0; i < POOL.length; i++) {
    const p = POOL[(cursor + i) % POOL.length];
    if (!exclude.includes(p.userId)) {
      cursor = (cursor + i + 1) % POOL.length;
      const photo = MOCK_PHOTOS[(cursor + i) % MOCK_PHOTOS.length];
      return { ...p, photoUri: photo };
    }
  }
  const n = Math.floor(Math.random() * 1000);
  return { userId: `m-${n}`, nickname: `승객${n}`, animal: 'bear', color: 'cream' };
}
