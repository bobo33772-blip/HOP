import type { BodyColorId } from '@/constants/theme';
import type { RoomLayout } from './room';
import type { LineId, Stage, TrainLine } from './rules';

export const ANIMALS = [
  { id: 'bear', label: '곰' },
  { id: 'pig', label: '돼지' },
  { id: 'chick', label: '병아리' },
  { id: 'rabbit', label: '토끼' },
  { id: 'cat', label: '고양이' },
  { id: 'fox', label: '여우' },
  { id: 'frog', label: '개구리' },
  { id: 'sheep', label: '양' },
] as const;

export type AnimalId = (typeof ANIMALS)[number]['id'];

export type Avatar = { animal: AnimalId; color: BodyColorId };

export type Profile = Avatar & {
  id: string;
  nickname: string;
  xp: number;
  stage: Stage;
  createdAt: number;
  /** 내 방 배치 (슬롯 → 아이템 id) */
  room?: RoomLayout;
  /** 친구 크루에게 내 노선을 보여줄지 (기본 꺼짐) */
  shareLine?: boolean;
};

export type PhotoStatus = 'developing' | 'developed' | 'boarded';

export type Photo = {
  id: string;
  /** 파일 URI 또는 번들 이미지(개발용 샘플) */
  uri: string | number;
  takenAt: number;
  readyAt: number;
  status: PhotoStatus;
  destinationId: string;
  trainId?: string;
};

export type Passenger = Avatar & {
  userId: string;
  nickname: string;
  /** 파일 URI 또는 번들 이미지(require 결과) */
  photoUri?: string | number;
  photoId?: string;
  isMe?: boolean;
  /** 신고가 쌓여 숨겨진 사진 */
  hidden?: boolean;
  /** 내가 차단한 사람 */
  blocked?: boolean;
  /** 가방에 챙겨 온 짐 (티켓을 받은 놀이) */
  luggage?: PlayKind[];
  /** 고른 기분 (내 것 · 노선 공개를 켠 사람만) */
  mood?: LineId;
};

export type TrainStatus = 'filling' | 'departed' | 'arrived';

export type Train = {
  id: string;
  destinationId: string;
  dayKey: string;
  seats: (Passenger | null)[];
  status: TrainStatus;
  createdAt: number;
  departedAt?: number;
  /** 여행 종료. 막차 열차는 도착 시각과 같다 (예전 사진 열차는 departedAt + 7일) */
  endsAt?: number;
  drift?: boolean;
  /** 막차 출발 시각 */
  departsAt?: number;
  /** 도착 시각 (출발 + 여행 시간) */
  arrivesAt?: number;
  /** 기분 노선 (예전 열차는 없음 → 날짜 행선지) */
  line?: TrainLine;
};

/** 오감 놀이 3종: 말랑볼 조물조물(촉각+청각) · 면치기 숨쉬기(후각+미각) · 창밖 색 채우기(시각) */
export type PlayKind = 'squish' | 'noodle' | 'color';

/** 쉼 티켓 = 쉰 증거 + 가방에 담긴 짐. cycle은 이 티켓이 탈 막차 출발 시각 */
export type Ticket = {
  id: string;
  kind: PlayKind;
  cycle: number;
  earnedAt: number;
  trainId?: string;
  /** 놀이 결과 (고른 면, 색칠한 창밖 등) */
  detail?: Record<string, unknown>;
};

export type ReportReason = 'inappropriate' | 'privacy' | 'harassment' | 'other';

export type Sticker = '❤️' | '✨' | '☁️' | '😆';

export type CrewPost = {
  seat: number;
  reactions: Partial<Record<Sticker, number>>;
  myReaction?: Sticker;
  /** 한 줄 방명록 (사진 한 장에 한 사람당 한 줄) */
  comments: { nickname: string; body: string; mine?: boolean }[];
};

export type Crew = {
  trainId: string;
  posts: CrewPost[];
  pokesSent: string[];
  rideAgain: string[];
  closed?: boolean;
};
