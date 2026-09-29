import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PlayShell, usePlay } from '@/components/play/play-kit';
import { PALETTE, Palette, REGIONS, WindowPicture } from '@/components/play/window-kit';
import { Button } from '@/components/ui';
import { C, Font } from '@/constants/theme';
import { buzz, play, preload } from '@/lib/sound';

/** 창밖 색 채우기 (시각): 지금 보이는 색, 오늘 마음의 색으로 기차 창밖을 칠한다 */
export default function ColorPlay() {
  const p = usePlay('color');
  const { width } = useWindowDimensions();
  const W = Math.min(width - 32, 420);
  const [color, setColor] = useState(PALETTE[0]);
  const [fills, setFills] = useState<Record<string, string>>({});

  useEffect(() => {
    preload(['fill', 'chime', 'stamp']);
  }, []);

  const fill = (id: string) => {
    const before = fills[id];
    if (before === color) {
      p.ping();
      return;
    }
    const next = { ...fills, [id]: color };
    setFills(next);
    p.setDetail({ fills: next });
    // 처음 칠하는 칸은 크게, 다시 칠하면 조금
    p.add(before ? 2 : 9);
    play('fill', { volume: 0.75, rate: 0.9 + Math.random() * 0.25 });
    buzz.light();
  };

  const done = Object.keys(fills).length;

  return (
    <PlayShell play={p} bg="#EEF8F1">
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.hint}>물감을 고르고 창밖 그림을 눌러 칠해요</Text>
        <View style={s.frame}>
          <WindowPicture fills={fills} width={W} onFill={fill} />
        </View>
        <Text style={s.count}>
          {done}/{REGIONS.length}칸 · 정답은 없어요, 손 가는 대로
        </Text>
        <Palette value={color} onChange={(c) => {
          setColor(c);
          buzz.tick();
          p.ping();
        }} />
        <Text style={s.note}>다 칠한 그림은 여행 엽서의 창밖 풍경이 돼요</Text>
        <Button label="필름 카메라로 창밖 한 컷 (선택)" variant="ghost" onPress={() => router.push('/camera')} style={{ alignSelf: 'stretch', marginHorizontal: 16 }} />
      </ScrollView>
    </PlayShell>
  );
}

const s = StyleSheet.create({
  page: { alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 32 },
  hint: { fontFamily: Font.display, fontSize: 17, color: '#3F7F68' },
  frame: { borderRadius: 24, overflow: 'hidden' },
  count: { fontSize: 13, color: C.inkSoft },
  note: { fontSize: 12, color: C.inkSoft },
});
