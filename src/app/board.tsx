import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TicketIcon } from '@/components/play/play-kit';
import { Button, Muted, Title } from '@/components/ui';
import { C, Font, Radius, shadow } from '@/constants/theme';
import { LINE_ART } from '@/lib/art';
import { friendlyError } from '@/lib/errors';
import { arrivalLabel, clock, josa, untilLabel } from '@/lib/format';
import { PLAYS, PLAY_ORDER } from '@/lib/play';
import { LINES, type LineId } from '@/lib/rules';
import { buzz } from '@/lib/sound';
import { useDerived, useStore } from '@/lib/store';

/**
 * 오늘 기분을 고르면 그 기분의 노선 열차에 탄다. 같은 기분의 사람끼리 8칸씩.
 * 기분은 나만 보고, 노선마다 보상은 같다. 출발 전까지 다른 노선으로 갈아탈 수 있다.
 */
export default function Board() {
  const { state, dispatch } = useStore();
  const { nextDeparture, tonight, ticketKinds, myTonight, myLine } = useDerived();
  const [picked, setPicked] = useState<LineId | null>(myLine && myLine.id !== 'drift' ? (myLine.id as LineId) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const arrive = nextDeparture + state.schedule.travelMinutes * 60000;
  const line = LINES.find((l) => l.id === picked);
  const photo = state.photos.find((p) => p.status === 'developed' && p.takenAt > nextDeparture - 86400000);
  const same = !!myTonight && myLine?.id === picked;

  const board = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch({ type: 'boardTonight', line: picked });
      buzz.success();
      router.back();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content}>
        <Title style={{ textAlign: 'center', fontSize: 26 }}>오늘 기분이 어때요?</Title>
        <Muted style={{ textAlign: 'center' }}>고른 기분이 오늘 밤 노선이 돼요. 기분은 나만 볼 수 있고, 어느 노선이든 받는 건 같아요.</Muted>

        <View style={s.grid}>
          {LINES.map((l) => {
            const on = picked === l.id;
            const riders = state.tonightLines[l.id] ?? 0;
            return (
              <Pressable
                key={l.id}
                onPress={() => {
                  setPicked(l.id);
                  buzz.tick();
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${l.mood}, ${l.name}`}
                style={({ pressed }) => [s.mood, on && { borderColor: l.color, backgroundColor: l.soft }, pressed && { transform: [{ scale: 0.97 }] }]}>
                <Text style={s.emoji}>{l.emoji}</Text>
                <Text style={[s.moodName, on && { color: l.color }]}>{l.mood}</Text>
                <Text style={s.lineName}>{l.name}</Text>
                <Text style={s.riders}>{riders > 0 ? `${riders}명 탑승 중` : '첫 승객'}</Text>
              </Pressable>
            );
          })}
        </View>

        {line && (
          <View style={[s.hero, { borderColor: line.color }]}>
            <Image source={LINE_ART[line.id]} style={s.art} contentFit="cover" transition={150} />
            <View style={s.heroText}>
              <Text style={[s.dest, { color: line.color }]}>{line.name}</Text>
              <Text style={s.desc}>{line.desc}에 타는 열차예요</Text>
              <Text style={s.times}>
                {clock(nextDeparture)} 출발 · {arrivalLabel(arrive, nextDeparture)} 도착 · 막차까지 {untilLabel(nextDeparture)}
              </Text>
            </View>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.section}>내 가방</Text>
          <View style={s.bag}>
            {PLAY_ORDER.map((k) => {
              const got = ticketKinds.has(k);
              return (
                <View key={k} style={[s.item, !got && { opacity: 0.45 }]}>
                  <TicketIcon size={26} color={PLAYS[k].tint} dim={!got} />
                  <Text style={s.itemText}>{got ? `${PLAYS[k].emoji} ${PLAYS[k].luggage}` : PLAYS[k].name}</Text>
                </View>
              );
            })}
          </View>
          {photo && <Muted>현상한 창밖 사진도 함께 실려요 📷</Muted>}
        </View>

        {error && <Text style={{ color: '#C0392B', textAlign: 'center' }}>{error}</Text>}
        {tonight.length === 0 ? (
          <>
            <Muted style={{ textAlign: 'center' }}>티켓이 1장만 있어도 탈 수 있어요. 쉼 놀이로 짐을 싸 볼까요?</Muted>
            <Button label="짐 싸러 가기" onPress={() => router.replace('/rest')} />
          </>
        ) : same ? (
          <>
            <Muted style={{ textAlign: 'center' }}>이미 {line?.name} 막차에 탔어요. 짐을 더 챙기면 같은 자리에 실려요.</Muted>
            <Button label="짐 더 싸러 가기" onPress={() => router.replace('/rest')} />
          </>
        ) : (
          <Button
            label={
              busy
                ? '탑승 중…'
                : !line
                  ? '기분을 골라 주세요'
                  : myTonight
                    ? `${josa(line.name, '으로', '로')} 갈아타기`
                    : `티켓 ${tonight.length}장으로 ${line.name} 타기`
            }
            onPress={board}
            disabled={!line || busy}
          />
        )}
        <Button label="나중에" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.cream },
  content: { padding: 16, gap: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  mood: { width: '30%', flexGrow: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 20, borderWidth: 2, borderColor: C.line, backgroundColor: C.card, gap: 1 },
  emoji: { fontSize: 30 },
  moodName: { fontFamily: Font.display, fontSize: 18, color: C.ink },
  lineName: { fontSize: 12, fontWeight: '700', color: C.inkSoft },
  riders: { fontSize: 11, color: C.inkSoft },
  hero: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: C.card, borderWidth: 2, ...shadow },
  art: { width: '100%', aspectRatio: 3 / 1.6 },
  heroText: { padding: 14, gap: 2 },
  dest: { fontFamily: Font.display, fontSize: 26 },
  desc: { fontSize: 13, color: C.inkSoft },
  times: { fontFamily: Font.display, fontSize: 15, color: C.ink, marginTop: 4 },
  card: { backgroundColor: C.card, borderRadius: Radius.lg, padding: 14, gap: 8, borderWidth: 1, borderColor: C.line },
  section: { fontFamily: Font.display, fontSize: 18, color: C.ink },
  bag: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8 },
  itemText: { fontSize: 12, fontWeight: '700', color: C.ink, textAlign: 'center' },
});
