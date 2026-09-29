import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PlayShell, usePlay } from '@/components/play/play-kit';
import { Keycaps, StretchyBall, WarmFaces } from '@/components/play/squish-kit';
import { Font } from '@/constants/theme';
import { buzz, play, preload } from '@/lib/sound';
import { useStore } from '@/lib/store';
import type { Profile } from '@/lib/types';

/** 말랑볼 조물조물 (촉각 + 청각): 쭉 늘리기 · 꾹 누르기 · 키캡 딸깍 */
export default function SquishPlay() {
  const { state } = useStore();
  return state.profile ? <Squish me={state.profile} /> : null;
}

function Squish({ me }: { me: Profile }) {
  const p = usePlay('squish');
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.6, 250);
  const [bump, setBump] = useState(0);
  const count = useRef({ squish: 0, stretch: 0, keys: 0 });
  const lastSquish = useRef(0);
  const lastKey = useRef(0);

  useEffect(() => {
    preload(['squish', 'pop', 'stretch', 'key1', 'key2', 'key3', 'chime', 'stamp']);
  }, []);

  const save = () => p.setDetail({ ...count.current });

  return (
    <PlayShell play={p} bg="#FFF1F4" footer={<Keycaps onKey={(i) => {
      play((['key1', 'key2', 'key3'] as const)[i % 3], { volume: 0.85 });
      buzz.rigid();
      setBump((n) => n + 1);
      count.current.keys += 1;
      save();
      // 너무 빠른 연타는 점수 없이 소리만 (게이지가 한 번에 차지 않게)
      const now = Date.now();
      if (now - lastKey.current >= 200) {
        lastKey.current = now;
        p.add(1);
      } else {
        p.ping();
      }
    }} />}>
      <View style={s.stage}>
        <Text style={s.hint}>쭉 잡아 늘리거나, 꾹 눌러 보세요</Text>
        <View style={{ width: size, height: size * 1.25, alignItems: 'center', justifyContent: 'flex-end' }}>
          <View style={[s.cushion, { left: -size * 0.05, width: size * 1.1, height: size * 0.3, borderRadius: size }]} />
          <StretchyBall
            animal={me.animal}
            color={me.color}
            stage={me.stage}
            size={size}
            bump={bump}
            onTouch={p.ping}
            onRelease={(stretch) => {
              if (stretch > 1.05) {
                count.current.stretch += 1;
                p.add(2 + Math.round((stretch - 1) * 10));
              } else {
                count.current.squish += 1;
                const now = Date.now();
                p.add(now - lastSquish.current >= 250 ? 2 : 1);
                lastSquish.current = now;
              }
              save();
            }}
          />
        </View>
        <Text style={s.sub}>아래 키캡도 딸깍딸깍 눌러 보세요</Text>
      </View>
      <WarmFaces animal={me.animal} color={me.color} stage={me.stage} />
    </PlayShell>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  hint: { fontFamily: Font.display, fontSize: 18, color: '#8A5A6A' },
  sub: { fontSize: 13, color: '#A07A86' },
  cushion: { position: 'absolute', bottom: 0, backgroundColor: 'rgba(233,138,162,0.22)' },
});
