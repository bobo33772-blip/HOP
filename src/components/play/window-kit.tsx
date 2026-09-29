import { useId } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg';

const INK = '#6B4A33';

/** 기차 창밖 밑그림: 칠할 수 있는 칸 13개 (viewBox 320×240, 창 안쪽 16~304 × 16~224) */
export const REGIONS: { id: string; label: string; d: string }[] = [
  { id: 'sky', label: '하늘', d: 'M16 16 H304 V224 H16 Z' },
  { id: 'sun', label: '해', d: 'M250 62 m -24 0 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0' },
  { id: 'cloud1', label: '큰 구름', d: 'M52 76 a14 14 0 0 1 8 -24 a20 20 0 0 1 36 -6 a16 16 0 0 1 26 12 a12 12 0 0 1 -2 18 Z' },
  { id: 'cloud2', label: '작은 구름', d: 'M152 50 a10 10 0 0 1 6 -16 a14 14 0 0 1 26 -4 a11 11 0 0 1 18 8 a9 9 0 0 1 -2 12 Z' },
  { id: 'mountain', label: '먼 산', d: 'M16 150 L70 96 L104 124 L156 78 L214 132 L262 104 L304 136 V224 H16 Z' },
  { id: 'hill', label: '언덕', d: 'M16 176 C70 146 130 152 176 168 C226 184 266 158 304 164 V224 H16 Z' },
  { id: 'trunk', label: '나무 기둥', d: 'M66 158 h10 v28 h-10 Z' },
  { id: 'crown', label: '나뭇잎', d: 'M71 146 m -21 0 a21 21 0 1 0 42 0 a21 21 0 1 0 -42 0' },
  { id: 'wall', label: '집 벽', d: 'M214 160 h46 v34 h-46 Z' },
  { id: 'roof', label: '지붕', d: 'M206 162 L237 136 L268 162 Z' },
  { id: 'door', label: '문', d: 'M231 174 h12 v20 h-12 Z' },
  { id: 'field', label: '들판', d: 'M16 202 C90 188 200 198 304 192 V224 H16 Z' },
  {
    id: 'flowers',
    label: '꽃',
    d: 'M115 208 m -5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M137 213 m -5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M160 206 m -5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0',
  },
];

/** 물감 12색: 파스텔 위주 + 밤하늘용 짙은 남색 */
export const PALETTE = [
  '#8CC8F2',
  '#5A8FD8',
  '#3D4A7A',
  '#A9E3C4',
  '#7CC47F',
  '#FBE38E',
  '#F7B267',
  '#FBC9A4',
  '#F8BCCB',
  '#C9B6F2',
  '#B98B66',
  '#C9CCD3',
];

/** 둥근 사각형 경로 */
function rr(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

/** 나무 창틀 안의 색칠 그림. 칸을 누르면 onFill(칸 id) */
export function WindowPicture({ fills, width, onFill }: { fills: Record<string, string>; width: number; onFill?: (id: string) => void }) {
  const clip = `pane-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={width} height={width * 0.75} viewBox="0 0 320 240">
      <Defs>
        <ClipPath id={clip}>
          <Path d={rr(16, 16, 288, 208, 12)} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`}>
        {REGIONS.map((r) => (
          <Path
            key={r.id}
            d={r.d}
            fill={fills[r.id] ?? '#FFFFFF'}
            stroke={INK}
            strokeWidth={2.2}
            strokeLinejoin="round"
            onPress={onFill ? () => onFill(r.id) : undefined}
          />
        ))}
      </G>
      {/* 창틀 · 커튼 (칸을 가리지 않게 가장자리에만) */}
      <Path d={`${rr(0, 0, 320, 240, 22)} ${rr(16, 16, 288, 208, 12)}`} fill="#C99568" fillRule="evenodd" stroke={INK} strokeWidth={2.5} pointerEvents="none" />
      <Path d="M4 6 H52 C46 20, 30 30, 12 34 C 8 26, 5 16, 4 6 Z" fill="#F8BCCB" stroke={INK} strokeWidth={2} pointerEvents="none" />
      <Path d="M316 6 H268 C274 20, 290 30, 308 34 C 312 26, 315 16, 316 6 Z" fill="#F8BCCB" stroke={INK} strokeWidth={2} pointerEvents="none" />
      <Circle cx={160} cy={232} r={3} fill={INK} opacity={0.5} pointerEvents="none" />
    </Svg>
  );
}

/** 물감 팔레트 */
export function Palette({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <View style={s.palette}>
      {PALETTE.map((c) => {
        const on = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`물감 ${c}`}
            style={[s.swatchRing, on && s.swatchOn]}>
            <View style={[s.swatch, { backgroundColor: c }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  swatchRing: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  swatchOn: { borderColor: INK },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#FFFFFF' },
});
