import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall } from '@/components/mallang-ball';
import { TicketIcon } from '@/components/play/play-kit';
import { Button, Muted } from '@/components/ui';
import { C, Font, shadow } from '@/constants/theme';
import { arrivalLabel, clock, trainDestination, untilLabel } from '@/lib/format';
import { PLAYS, PLAY_ORDER, restLabel } from '@/lib/play';
import { useDerived, useStore } from '@/lib/store';

/** 쉼: 오감 놀이 3종으로 짐을 싸고, 티켓이 생기면 오늘 밤 막차에 탄다 */
export default function Rest() {
  const { state } = useStore();
  const { ticketKinds, tonight, ticketsMax, nextDeparture, myTonight, myLine, traveling } = useDerived();
  const me = state.profile;
  if (!me) return null;

  return (
    <SafeAreaView style={s.page}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={10} style={s.close}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>✕</Text>
        </Pressable>
        <Text style={s.title}>오늘의 짐 싸기</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* 오늘 받은 티켓 */}
        <View style={s.rail}>
          {PLAY_ORDER.map((k) => {
            const got = ticketKinds.has(k);
            return (
              <View key={k} style={[s.slot, got && { backgroundColor: PLAYS[k].soft, borderColor: PLAYS[k].tint, borderStyle: 'solid' }]}>
                <TicketIcon size={30} color={PLAYS[k].tint} dim={!got} />
                <Text style={[s.slotText, got && { color: PLAYS[k].tint }]}>{got ? `${PLAYS[k].emoji} ${PLAYS[k].luggage}` : '빈 칸'}</Text>
              </View>
            );
          })}
        </View>
        <Muted style={{ textAlign: 'center' }}>
          놀이마다 만족 게이지를 채우면 티켓 1장 · 시간 제한은 없어요{'\n'}오늘 쉰 시간 {restLabel(state.rest.cycleMs)}
        </Muted>

        {/* 놀이 3종 */}
        {PLAY_ORDER.map((k) => {
          const m = PLAYS[k];
          const got = ticketKinds.has(k);
          return (
            <Pressable
              key={k}
              onPress={() => router.push(m.route)}
              accessibilityRole="button"
              accessibilityLabel={`${m.name}, ${m.senses}${got ? ', 오늘 티켓 받음' : ''}`}
              style={({ pressed }) => [s.card, pressed && { transform: [{ scale: 0.98 }] }]}>
              <View style={[s.badge, { backgroundColor: m.soft }]}>
                {k === 'squish' ? <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={56} /> : <Text style={{ fontSize: 34 }}>{k === 'noodle' ? '🍜' : '🖼️'}</Text>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.cardName}>{m.name}</Text>
                <Text style={[s.senses, { color: m.tint }]}>{m.senses}</Text>
                <Text style={s.blurb}>{m.blurb}</Text>
              </View>
              <View style={[s.state, got && { backgroundColor: m.tint }]}>
                <Text style={[s.stateText, got && { color: '#fff' }]}>{got ? '티켓 ✓' : '놀기'}</Text>
              </View>
            </Pressable>
          );
        })}

        {/* 오늘 밤 막차 */}
        <View style={s.train}>
          {traveling ? (
            <>
              <Text style={s.trainTitle}>🚂 {trainDestination(traveling).name} 여행 중</Text>
              <Muted>{arrivalLabel(traveling.arrivesAt!)}에 도착해요. 그동안 다음 막차 짐을 싸 두어도 좋아요.</Muted>
            </>
          ) : null}
          {myTonight ? (
            <>
              <Text style={s.trainTitle}>{myLine ? `${myLine.emoji} ${myLine.name}` : '막차'} 탑승 완료 ✓</Text>
              <Muted>
                오늘 밤 {clock(nextDeparture)}에 떠나요 ({untilLabel(nextDeparture)} 남음).
                {tonight.length < ticketsMax ? ' 짐을 더 챙기면 같은 자리에 실려요.' : ' 짐을 모두 챙겼어요!'}
              </Muted>
              <Button label="기분 바꾸기" variant="ghost" onPress={() => router.push('/board')} />
            </>
          ) : tonight.length > 0 ? (
            <>
              <Text style={s.trainTitle}>티켓 {tonight.length}장이 모였어요</Text>
              <Muted>오늘 기분을 고르면 그 기분의 노선 열차에 타요. 막차까지 {untilLabel(nextDeparture)}. 깜빡해도 막차가 떠돌이행으로 태우고 가요.</Muted>
              <Button label={`기분 고르고 ${clock(nextDeparture)} 막차 타기`} onPress={() => router.push('/board')} />
            </>
          ) : (
            <>
              <Text style={s.trainTitle}>오늘 밤 {clock(nextDeparture)} 막차</Text>
              <Muted>티켓이 1장만 있어도 탈 수 있어요. 막차까지 {untilLabel(nextDeparture)} 남았어요.</Muted>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.cream },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  title: { flex: 1, textAlign: 'center', fontFamily: Font.display, fontSize: 24, color: C.ink },
  content: { padding: 16, gap: 12, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  rail: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 16, borderWidth: 2, borderColor: C.line, borderStyle: 'dashed', backgroundColor: '#FFFDF7' },
  slotText: { fontSize: 12, fontWeight: '700', color: C.inkSoft },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 12, borderWidth: 1, borderColor: C.line, ...shadow },
  badge: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontFamily: Font.display, fontSize: 19, color: C.ink },
  senses: { fontSize: 12, fontWeight: '700' },
  blurb: { fontSize: 13, color: C.inkSoft, lineHeight: 18 },
  state: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.skySoft },
  stateText: { fontFamily: Font.display, fontSize: 14, color: C.skyDeep },
  train: { backgroundColor: '#FFFDF6', borderRadius: 22, padding: 16, gap: 8, borderWidth: 2, borderColor: '#F1E4CF' },
  trainTitle: { fontFamily: Font.display, fontSize: 19, color: C.ink },
  error: { color: '#C0392B', fontSize: 13 },
});
