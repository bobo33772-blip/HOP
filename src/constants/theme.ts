import { Platform } from 'react-native';

/** 롤롤 브랜드 팔레트 — 기획서 v0.1 / 메인 화면 시안 기준 */
export const C = {
  cream: '#FFF8EC',
  paper: '#FBF1E1',
  card: '#FFFFFF',
  line: '#EADDC8',
  ink: '#4A3426',
  inkSoft: '#8A7362',
  sky: '#5AAEEA',
  skyDeep: '#3F93D6',
  skySoft: '#DCEEFB',
  film: '#2E231C',
  filmEdge: '#E8A33D',
  pink: '#F39AB2',
  pinkSoft: '#FDE4EC',
  safelight: '#C8413A',
  grass: '#9CCB7A',
} as const;

/** 말랑볼 몸 색 8종 (온보딩 팔레트) */
export const BODY_COLORS = [
  { id: 'sky', label: '하늘', fill: '#8CC8F2', shade: '#6AAEE0' },
  { id: 'pink', label: '분홍', fill: '#F8BCCB', shade: '#EE9DB2' },
  { id: 'butter', label: '버터', fill: '#FBE38E', shade: '#F2CC5C' },
  { id: 'lilac', label: '라일락', fill: '#C9B6F2', shade: '#AE97E6' },
  { id: 'peach', label: '복숭아', fill: '#FBC9A4', shade: '#F2AC7E' },
  { id: 'mint', label: '민트', fill: '#A9E3C4', shade: '#82CFA6' },
  { id: 'cream', label: '크림', fill: '#F5ECDD', shade: '#E2D3BC' },
  { id: 'gray', label: '구름', fill: '#C9CCD3', shade: '#AAAFB9' },
] as const;

export type BodyColorId = (typeof BODY_COLORS)[number]['id'];

export const Font = {
  display: 'Jua_400Regular',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const Radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const shadow = Platform.select({
  web: { boxShadow: '0 4px 14px rgba(74,52,38,0.10)' },
  default: {
    shadowColor: '#4A3426',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
}) as object;
