import type { Stage } from './rules';

/** 내 방 꾸미기: 슬롯마다 아이템 하나. 아이템은 성장·활동으로 열린다. */
export const SLOTS = [
  { id: 'wall', label: '벽지' },
  { id: 'floor', label: '바닥' },
  { id: 'window', label: '창문' },
  { id: 'deco', label: '벽장식' },
  { id: 'left', label: '큰 가구' },
  { id: 'right', label: '작은 가구' },
  { id: 'rug', label: '러그' },
  { id: 'light', label: '조명' },
] as const;

export type SlotId = (typeof SLOTS)[number]['id'];
export type RoomLayout = Partial<Record<SlotId, string>>;

type Unlock =
  | { kind: 'free' }
  | { kind: 'level'; n: number }
  | { kind: 'stage'; stage: Stage }
  | { kind: 'rolls'; n: number }
  | { kind: 'friends'; n: number };

export type RoomItem = { id: string; slot: SlotId; name: string; unlock: Unlock };

const free: Unlock = { kind: 'free' };

export const ROOM_ITEMS: RoomItem[] = [
  { id: 'wall-cream', slot: 'wall', name: '크림', unlock: free },
  { id: 'wall-sky', slot: 'wall', name: '하늘', unlock: free },
  { id: 'wall-pink', slot: 'wall', name: '벚꽃', unlock: { kind: 'level', n: 3 } },
  { id: 'wall-mint', slot: 'wall', name: '민트', unlock: { kind: 'level', n: 5 } },
  { id: 'wall-night', slot: 'wall', name: '밤하늘', unlock: { kind: 'stage', stage: 'rollroll' } },

  { id: 'floor-wood', slot: 'floor', name: '원목', unlock: free },
  { id: 'floor-dark', slot: 'floor', name: '짙은 원목', unlock: { kind: 'level', n: 4 } },
  { id: 'floor-check', slot: 'floor', name: '체크 타일', unlock: { kind: 'rolls', n: 2 } },

  { id: 'window-day', slot: 'window', name: '맑은 낮', unlock: free },
  { id: 'window-sunset', slot: 'window', name: '노을', unlock: { kind: 'stage', stage: 'banjjak' } },
  { id: 'window-night', slot: 'window', name: '별밤', unlock: { kind: 'stage', stage: 'rollroll' } },

  { id: 'deco-crew', slot: 'deco', name: '크루 앨범 액자', unlock: free },
  { id: 'deco-poster', slot: 'deco', name: '필름 포스터', unlock: { kind: 'level', n: 2 } },
  { id: 'deco-garland', slot: 'deco', name: '필름 가랜드', unlock: { kind: 'rolls', n: 3 } },

  { id: 'left-bed', slot: 'left', name: '포근한 침대', unlock: free },
  { id: 'left-sofa', slot: 'left', name: '말랑 소파', unlock: { kind: 'level', n: 6 } },
  { id: 'left-tent', slot: 'left', name: '캠핑 텐트', unlock: { kind: 'friends', n: 2 } },

  { id: 'right-plant', slot: 'right', name: '몬스테라', unlock: free },
  { id: 'right-beanbag', slot: 'right', name: '빈백', unlock: { kind: 'level', n: 3 } },
  { id: 'right-shelf', slot: 'right', name: '카메라 진열장', unlock: { kind: 'stage', stage: 'banjjak' } },

  { id: 'rug-cloud', slot: 'rug', name: '구름 러그', unlock: free },
  { id: 'rug-heart', slot: 'rug', name: '하트 러그', unlock: { kind: 'friends', n: 1 } },
  { id: 'rug-film', slot: 'rug', name: '필름 러그', unlock: { kind: 'rolls', n: 5 } },

  { id: 'light-stand', slot: 'light', name: '스탠드', unlock: free },
  { id: 'light-string', slot: 'light', name: '전구 줄', unlock: { kind: 'level', n: 8 } },
];

export const DEFAULT_ROOM: Record<SlotId, string> = {
  wall: 'wall-cream',
  floor: 'floor-wood',
  window: 'window-day',
  deco: 'deco-crew',
  left: 'left-bed',
  right: 'right-plant',
  rug: 'rug-cloud',
  light: 'light-stand',
};

export type UnlockContext = { level: number; stage: Stage; rolls: number; friends: number };

const STAGE_RANK: Record<Stage, number> = { mallang: 0, banjjak: 1, rollroll: 2 };
const STAGE_LABEL: Record<Stage, string> = { mallang: '말랑볼', banjjak: '반짝볼', rollroll: '롤롤' };

export function isUnlocked(item: RoomItem, ctx: UnlockContext) {
  const u = item.unlock;
  switch (u.kind) {
    case 'free':
      return true;
    case 'level':
      return ctx.level >= u.n;
    case 'stage':
      return STAGE_RANK[ctx.stage] >= STAGE_RANK[u.stage];
    case 'rolls':
      return ctx.rolls >= u.n;
    case 'friends':
      return ctx.friends >= u.n;
  }
}

export function unlockHint(item: RoomItem) {
  const u = item.unlock;
  switch (u.kind) {
    case 'free':
      return '';
    case 'level':
      return `Lv.${u.n}에 열려요`;
    case 'stage':
      return `${STAGE_LABEL[u.stage]}이 되면 열려요`;
    case 'rolls':
      return `롤 ${u.n}개를 모으면 열려요`;
    case 'friends':
      return `친구 ${u.n}명이 생기면 열려요`;
  }
}

/** 저장된 배치 중 잠긴 아이템은 기본값으로 되돌려 그린다 */
export function resolveRoom(layout: RoomLayout | undefined, ctx: UnlockContext): Record<SlotId, string> {
  const out = { ...DEFAULT_ROOM };
  for (const slot of SLOTS) {
    const id = layout?.[slot.id];
    const item = ROOM_ITEMS.find((i) => i.id === id && i.slot === slot.id);
    if (item && isUnlocked(item, ctx)) out[slot.id] = item.id;
  }
  return out;
}
