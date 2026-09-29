import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall } from '@/components/mallang-ball';
import { Card, Chip, Muted, Title } from '@/components/ui';
import { C, Font, Radius } from '@/constants/theme';
import { trainArt } from '@/lib/art';
import { trainDestination, tripLabel } from '@/lib/format';
import { useStore } from '@/lib/store';

export default function CrewList() {
  const { state } = useStore();
  const crews = [...state.crews].reverse();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.cream }}>
      <ScrollView contentContainerStyle={s.page}>
        <Title style={{ fontSize: 28 }}>크루</Title>
        <Muted>함께 막차를 타고 떠난 열차들이에요.</Muted>

        {crews.length === 0 && (
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <MallangBall animal="rabbit" color="lilac" size={90} expression="surprised" />
            <Text style={{ color: C.ink, textAlign: 'center', lineHeight: 22 }}>아직 떠난 열차가 없어요.{'\n'}쉼 놀이로 티켓을 모아 오늘 밤 막차를 타 보세요.</Text>
          </Card>
        )}

        {crews.map((crew) => {
          const train = state.trains.find((t) => t.id === crew.trainId);
          if (!train) return null;
          const dest = trainDestination(train);
          return (
            <Pressable key={crew.trainId} onPress={() => router.push(`/crew/${crew.trainId}`)} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Image source={trainArt(train)} style={s.banner} contentFit="cover" transition={200} />
              <View style={s.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.name}>
                  {dest.name} 크루
                </Text>
                <View style={s.faces}>
                  {train.seats.map((p, i) => (p ? <MallangBall key={i} animal={p.animal} color={p.color} size={30} style={{ marginRight: -6 }} /> : null))}
                </View>
              </View>
              <Chip tone={crew.closed ? 'film' : 'sky'}>{tripLabel(train.endsAt, crew.closed)}</Chip>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: C.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  banner: { width: '100%', aspectRatio: 3.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  name: { fontFamily: Font.display, fontSize: 20, color: C.ink },
  faces: { flexDirection: 'row' },
});
