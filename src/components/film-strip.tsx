import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Font } from '@/constants/theme';

const PITCH = 21; // 구멍 간격 (35mm 필름 퍼포레이션 느낌)
const HOLE = { w: 11, h: 13 };
const GUTTER = 22;

/**
 * 35mm 필름 한 롤처럼 생긴 틀. 양쪽 가장자리에 톱니 구멍이 뚫리고,
 * 위아래에 필름 가장자리 인쇄(롤 이름·컷 수)가 들어간다.
 */
export function FilmStrip({ label, frames, children }: { label: string; frames: number; children: ReactNode }) {
  const [h, setH] = useState(0);
  const n = Math.max(0, Math.floor((h - 10) / PITCH));
  const holes = Array.from({ length: n }, (_, i) => <View key={i} style={[s.hole, { top: 6 + i * PITCH }]} />);
  return (
    <View style={s.strip} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <View style={[s.col, { left: (GUTTER - HOLE.w) / 2 }]} pointerEvents="none">
        {holes}
      </View>
      <View style={[s.col, { right: (GUTTER - HOLE.w) / 2 }]} pointerEvents="none">
        {holes}
      </View>
      <Text style={s.edge} numberOfLines={1}>
        ▶ {label}  ·  ROLLROLL 200  ·  {frames} EXP
      </Text>
      <View style={s.inner}>{children}</View>
      <Text style={[s.edge, { textAlign: 'right' }]} numberOfLines={1}>
        ROLLROLL 200  ·  {frames}A ◀
      </Text>
    </View>
  );
}

/** 필름 칸 사이 경계 (칸마다 번호를 가장자리 인쇄처럼) */
export function FrameGap({ no }: { no: number }) {
  return (
    <View style={s.gap}>
      <Text style={s.gapNo}>{no}A</Text>
      <View style={s.gapLine} />
      <Text style={s.gapNo}>▶{no + 1}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  strip: {
    backgroundColor: '#5B514B',
    borderRadius: 12,
    paddingHorizontal: GUTTER,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3F3732',
    shadowColor: '#2E231C',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  col: { position: 'absolute', top: 0, bottom: 0, width: HOLE.w },
  hole: { position: 'absolute', width: HOLE.w, height: HOLE.h, borderRadius: 3, backgroundColor: '#F6EEE2', borderWidth: 1, borderColor: '#D9CBB6' },
  inner: { gap: 0 },
  edge: { fontFamily: Font.mono, fontSize: 9, letterSpacing: 1.5, color: '#E8A33D', opacity: 0.85, paddingVertical: 3 },
  gap: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 16 },
  gapLine: { flex: 1, height: 1, backgroundColor: '#453C37' },
  gapNo: { fontFamily: Font.mono, fontSize: 8, color: '#E8A33D', opacity: 0.8 },
});
