/**
 * 롤롤 게임 규칙 상수. 기획서 v0.1의 제안값이며 베타에서 조정한다.
 */
export const RULES = {
  filmsPerDay: 3,
  seatsPerTrain: 8,
  crewTripDays: 7,
  /** 현상 대기(분). 개발 중에는 FAST_DEV로 초 단위로 줄인다. */
  developMinutes: { min: 60, max: 180 },
  /** 빈칸이 오래 남은 열차가 떠돌이 칸으로 바뀌는 시간 */
  driftAfterHours: 24,
  guestbookMaxLength: 40,
} as const;

/** 개발 빌드에서는 현상 20~40초, 가짜 승객 합류도 빠르게 */
export const FAST_DEV = __DEV__;
/** 개발 빌드에서는 조기 출발 대기를 90초로 줄인다 */
const FAST_DEV_WAIT_SEC = FAST_DEV ? 90 : null;

/**
 * 콜드 스타트 규칙 (서버 app_settings와 같은 기본값).
 * 사람이 적을 때 열차가 영영 안 떠나는 걸 막는다.
 */
export const COLD_START = {
  enabled: true,
  minSeats: 4,
  /** 열차가 생긴 뒤 이 시간이 지나고 minSeats 이상이면 출발 */
  waitMs: (FAST_DEV_WAIT_SEC ?? 12 * 3600) * 1000,
} as const;

/** 막차 · 여행 · 놀이 기본값 (서버 모드에서는 app_settings 값이 우선) */
export const SCHEDULE = {
  /** 막차 시각 (KST, HH:MM) */
  lastTrain: '23:30',
  /** 여행 시간(분). 23:30 출발 → 07:30 도착 */
  travelMinutes: 480,
  /** 놀이 한 판 최소 시간(초). 이보다 짧으면 게이지가 차도 티켓이 나오지 않는다 */
  minPlaySeconds: 15,
} as const;

const KST_OFFSET = 9 * 3600000;

/** 다음 막차 출발 시각 (서버 next_departure와 같은 공식). 막차 시각이거나 지났으면 다음 날 막차 */
export function nextDepartureAt(lastTrain: string = SCHEDULE.lastTrain, from = Date.now()) {
  const [h, m] = lastTrain.split(':').map(Number);
  const k = new Date(from + KST_OFFSET);
  let cand = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), h, m);
  if (cand <= from + KST_OFFSET) cand += 86400000;
  return cand - KST_OFFSET;
}

/** KST 날짜 키 (막차 날짜의 행선지를 고를 때) */
export function kstDayKey(at: number) {
  const k = new Date(at + KST_OFFSET);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

export const XP = {
  hangPhoto: 10,
  ticket: 10,
  trainDeparted: 50,
  reaction: 5,
  friend: 30,
} as const;

export const XP_PER_LEVEL = 60;

export type Stage = 'mallang' | 'banjjak' | 'rollroll';

export const STAGES: Record<Stage, { label: string; texture: string }> = {
  mallang: { label: '말랑볼', texture: '매트 말랑' },
  banjjak: { label: '반짝볼', texture: '젤 구슬 반짝' },
  rollroll: { label: '롤롤', texture: '펄 광택' },
};

export const STAGE_ORDER: Stage[] = ['mallang', 'banjjak', 'rollroll'];

/** 성장 기준 (서버 app_settings와 같은 기본값): 여행 횟수 · 쉰 시간(하루 15분까지) · 함께 탄 말랑볼 */
export type GrowthRules = { banjjakTrips: number; banjjakRest: number; rollrollTrips: number; rollrollRest: number; rollrollRiders: number; restDailyCap: number };
export const GROWTH_RULES: GrowthRules = { banjjakTrips: 10, banjjakRest: 20, rollrollTrips: 50, rollrollRest: 90, rollrollRiders: 15, restDailyCap: 15 };

export type Growth = { trips: number; restMinutes: number; riders: number };

/** 기준을 모두 채운 가장 높은 단계 (서버 refresh_growth와 같은 기준) */
export function stageOf(g: Growth, r: GrowthRules): Stage {
  if (g.trips >= r.rollrollTrips && g.restMinutes >= r.rollrollRest && g.riders >= r.rollrollRiders) return 'rollroll';
  if (g.trips >= r.banjjakTrips && g.restMinutes >= r.banjjakRest) return 'banjjak';
  return 'mallang';
}

/** 다음 단계까지 필요한 것 (롤롤이면 null) */
export function nextGoal(stage: Stage, r: GrowthRules) {
  if (stage === 'mallang') return { stage: 'banjjak' as const, trips: r.banjjakTrips, rest: r.banjjakRest, riders: 0 };
  if (stage === 'banjjak') return { stage: 'rollroll' as const, trips: r.rollrollTrips, rest: r.rollrollRest, riders: r.rollrollRiders };
  return null;
}

/**
 * 오늘 기분 = 오늘 노선. 보상은 모두 같고 열차 색 · 창밖 날씨 · 엽서 분위기만 다르다.
 * 기분을 고르지 않고 막차가 태워 간 날은 떠돌이행.
 */
export const LINES = [
  { id: 'sky', mood: '반짝', emoji: '☀️', name: '하늘행', desc: '기분 좋은 날', color: '#5BB0EE', soft: '#DCEEFB' },
  { id: 'field', mood: '보통', emoji: '🌤️', name: '들판행', desc: '무난하고 평온한 날', color: '#6FB257', soft: '#E3F3DA' },
  { id: 'shadow', mood: '흐림', emoji: '☁️', name: '그림자행', desc: '조금 가라앉은 날', color: '#7C8199', soft: '#E6E7EE' },
  { id: 'rain', mood: '비', emoji: '🌧️', name: '빗소리행', desc: '울적하고 슬픈 날', color: '#5E7FB8', soft: '#DFE7F5' },
  { id: 'thunder', mood: '천둥', emoji: '⛈️', name: '천둥행', desc: '짜증 나고 화난 날', color: '#C08A1E', soft: '#F7ECD2' },
  { id: 'blanket', mood: '방전', emoji: '🌙', name: '이불행', desc: '지치고 쉬고 싶은 날', color: '#9E7CC6', soft: '#EEE6F7' },
] as const;

export type LineId = (typeof LINES)[number]['id'];
export type TrainLine = LineId | 'drift';

export const DRIFT_LINE = { id: 'drift', mood: '미기록', emoji: '🍃', name: '떠돌이행', desc: '기분을 고르지 않고 탄 날', color: '#7FA27D', soft: '#E4EFE3' } as const;

export function lineOf(id?: string | null) {
  return LINES.find((l) => l.id === id) ?? (id === 'drift' ? DRIFT_LINE : undefined);
}

export function levelFor(xp: number) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function levelProgress(xp: number) {
  const into = xp % XP_PER_LEVEL;
  return { into, need: XP_PER_LEVEL, ratio: into / XP_PER_LEVEL };
}


export function developDelayMs() {
  if (FAST_DEV) return (20 + Math.random() * 20) * 1000;
  const { min, max } = RULES.developMinutes;
  return (min + Math.random() * (max - min)) * 60 * 1000;
}

/** 날짜별 행선지. MVP는 하루 1개로 사람을 한 열차에 모은다. */
export const DESTINATIONS = [
  { id: 'sky', emoji: '☁️', name: '하늘행', prompt: '오늘 올려다본 하늘' },
  { id: 'cup', emoji: '☕', name: '한 잔행', prompt: '오늘 마신 한 잔' },
  { id: 'feet', emoji: '👟', name: '발끝행', prompt: '오늘 걸은 길과 발끝' },
  { id: 'window', emoji: '🪟', name: '창밖행', prompt: '창밖으로 보인 풍경' },
  { id: 'lunch', emoji: '🍙', name: '점심행', prompt: '오늘의 점심' },
  { id: 'shadow', emoji: '🌗', name: '그림자행', prompt: '빛과 그림자' },
  { id: 'green', emoji: '🌿', name: '초록행', prompt: '길에서 만난 초록' },
] as const;

export type Destination = (typeof DESTINATIONS)[number];

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 서버 ensure_today()와 같은 공식: 2026-01-01부터 지난 날 수 % 7 */
export function destinationFor(key = dayKey()): Destination {
  const [y, m, d] = key.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
  return DESTINATIONS[((days % DESTINATIONS.length) + DESTINATIONS.length) % DESTINATIONS.length];
}
