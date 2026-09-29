import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall } from '@/components/mallang-ball';
import { Button, FilmPhoto } from '@/components/ui';
import { C, Font } from '@/constants/theme';
import { SCENE } from '@/lib/art';
import { destinationFor, DESTINATIONS } from '@/lib/rules';
import { useStore } from '@/lib/store';
import type { Photo } from '@/lib/types';

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function remaining(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export default function Darkroom() {
  const { state } = useStore();
  const now = useNow();
  const me = state.profile!;
  const waiting = state.photos.filter((p) => p.status !== 'boarded');

  return (
    <SafeAreaView edges={['top']} style={s.room}>
      <Image source={SCENE.darkroom} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      <View style={[StyleSheet.absoluteFill, s.dim]} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.title}>현상소</Text>
        <Text style={s.sub}>좋은 사진은 기다림 속에 있어요</Text>

        {waiting.length === 0 ? (
          <View style={s.empty}>
            <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={120} expression="sleepy" />
            <Text style={s.emptyText}>현상할 사진이 없어요. 창밖 한 컷을 찍으면 오늘 밤 막차에 함께 실려요.</Text>
            <Button label="필름 카메라 열기" onPress={() => router.push('/camera')} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <View style={s.line}>
            <View style={s.rope} />
            {waiting.map((p) => (
              <Print key={p.id} photo={p} now={now} />
            ))}
          </View>
        )}

        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={96} squishable />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Print({ photo, now }: { photo: Photo; now: number }) {
  const ready = photo.status === 'developed' || photo.readyAt <= now;
  const total = photo.readyAt - photo.takenAt;
  const ratio = Math.min(1, (now - photo.takenAt) / total);
  const dest = DESTINATIONS.find((d) => d.id === photo.destinationId) ?? destinationFor();

  return (
    <View style={s.print}>
      <View style={s.clip} />
      <View style={s.paper}>
        {ready ? (
          // 암실에서 사진이 서서히 떠오르는 연출
          <Animated.View entering={FadeIn.duration(2200)}>
            <FilmPhoto source={photo.uri} takenAt={photo.takenAt} style={s.image} autoAspect />
          </Animated.View>
        ) : (
          <View style={[s.image, s.milky]}>
            <View style={s.ring}>
              <View style={[s.ringFill, { height: `${ratio * 100}%` }]} />
              <Text style={s.ringText}>{Math.round(ratio * 100)}%</Text>
            </View>
          </View>
        )}
        <Text style={s.caption}>
          {ready ? '현상 완료! 오늘 밤 막차에 함께 실려요' : `현상 중 · ${remaining(photo.readyAt - now)} 남음`}
        </Text>
        <Text style={s.dest}>
          {dest.emoji} {dest.name}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  room: { flex: 1, backgroundColor: '#5A2F2A' },
  // 글자가 읽히도록 가운데를 살짝 어둡게
  dim: { backgroundColor: 'rgba(40,14,12,0.28)' },
  page: { padding: 16, gap: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontFamily: Font.display, fontSize: 30, color: '#FFF1E6', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6 },
  sub: { color: '#F2C7B8', textAlign: 'center', fontSize: 13 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 30 },
  emptyText: { color: '#FFE9DD', textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  line: { gap: 22, paddingTop: 14 },
  rope: { position: 'absolute', top: 12, left: -16, right: -16, height: 3, backgroundColor: '#C9A27A' },
  print: { alignItems: 'stretch' },
  clip: { alignSelf: 'center', width: 16, height: 26, backgroundColor: '#D7A76B', borderRadius: 3, marginBottom: -12, zIndex: 2 },
  paper: { backgroundColor: '#FFFDF8', borderRadius: 6, padding: 10, paddingBottom: 12, gap: 6 },
  image: { width: '100%', aspectRatio: 4 / 3 },
  milky: { backgroundColor: '#EDE6DA', alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  ring: { width: 86, height: 86, borderRadius: 43, borderWidth: 6, borderColor: C.skySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ringFill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.sky, opacity: 0.35 },
  ringText: { fontFamily: Font.display, fontSize: 18, color: C.skyDeep },
  caption: { fontFamily: Font.display, fontSize: 16, color: C.ink, textAlign: 'center' },
  dest: { fontSize: 12, color: C.inkSoft, textAlign: 'center' },
});
