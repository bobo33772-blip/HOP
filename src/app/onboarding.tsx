import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall } from '@/components/mallang-ball';
import { Button, Muted, Title } from '@/components/ui';
import { BODY_COLORS, C, Font, Radius, type BodyColorId } from '@/constants/theme';
import { SCENE } from '@/lib/art';
import { friendlyError } from '@/lib/errors';
import { useStore } from '@/lib/store';
import { ANIMALS, type AnimalId } from '@/lib/types';

const NAME_MAX = 8;
/** 온보딩 무대 그림 비율 (1200×896) */
const STAGE_RATIO = 1200 / 896;

/** 커뮤니티 규칙 — 앱스토어 UGC 요건(약관 동의)을 겸한다 */
const PROMISES = [
  '다른 사람의 얼굴이나 개인정보(주소, 번호판, 학교 이름)가 보이는 사진은 올리지 않아요.',
  '불쾌하거나 선정적인 사진, 상처 주는 말은 남기지 않아요.',
  '불편한 사진이나 크루원은 언제든 신고하고 차단할 수 있어요.',
  '약속을 어기면 사진이 가려지거나 이용이 제한될 수 있어요.',
];

export default function Onboarding() {
  const [stageW, setStageW] = useState(0);
  const { dispatch, auth } = useStore();
  const [animal, setAnimal] = useState<AnimalId>('bear');
  const [color, setColor] = useState<BodyColorId>('sky');
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const year = Number(birth);
  const thisYear = new Date().getFullYear();
  const yearValid = birth.length === 4 && year >= 1900 && year <= thisYear;
  // 서버 check_age_14와 같은 기준 (연도 차이 14 이상)
  const oldEnough = yearValid && thisYear - year >= 14;
  const canStart = trimmed.length >= 1 && oldEnough && agreed && !busy;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await dispatch({ type: 'createProfile', nickname: trimmed, avatar: { animal, color }, birthYear: year });
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <Title style={{ textAlign: 'center', fontSize: 28 }}>
            나의 <Text style={{ color: C.skyDeep }}>말랑볼</Text> 만들기
          </Title>

          {/* 바닷가 무대 그림: 받침대 윗면(그림 높이 약 66%)에 발이 닿게 */}
          <View style={s.stageWrap} onLayout={(e) => setStageW(e.nativeEvent.layout.width)}>
            <Image source={SCENE.onboarding} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            {stageW > 0 && (
              <View style={[s.onStage, { top: (stageW / STAGE_RATIO) * 0.66 - stageW * 0.5 * 0.93 }]}>
                <MallangBall animal={animal} color={color} size={stageW * 0.5} squishable />
              </View>
            )}
            <Muted style={s.hint}>꾹 눌러보세요!</Muted>
          </View>

          <Text style={s.section}>얼굴</Text>
          <View style={s.grid}>
            {ANIMALS.map((a) => {
              const on = a.id === animal;
              return (
                <Pressable key={a.id} onPress={() => setAnimal(a.id)} style={[s.option, on && s.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={a.label}>
                  <MallangBall animal={a.id} color={color} size={48} />
                  <Text style={[s.optLabel, on && { color: C.skyDeep }]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.section}>색</Text>
          <View style={s.swatches}>
            {BODY_COLORS.map((c) => {
              const on = c.id === color;
              return (
                <Pressable key={c.id} onPress={() => setColor(c.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={c.label} style={[s.swatchRing, on && { borderColor: C.skyDeep }]}>
                  <View style={[s.swatch, { backgroundColor: c.fill }]} />
                </Pressable>
              );
            })}
          </View>

          <Text style={s.section}>이름</Text>
          <TextInput
            id="nickname"
            value={name}
            onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
            placeholder="예: 곰말랑"
            placeholderTextColor={C.inkSoft}
            style={s.input}
            maxLength={NAME_MAX}
            returnKeyType="done"
          />
          <Muted>
            크루 친구들에게 보이는 이름이에요. {trimmed.length}/{NAME_MAX}
          </Muted>

          <Text style={s.section}>태어난 해</Text>
          <TextInput
            id="birth-year"
            value={birth}
            onChangeText={(t) => setBirth(t.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="예: 2001"
            placeholderTextColor={C.inkSoft}
            keyboardType="number-pad"
            style={s.input}
            maxLength={4}
          />
          <Muted style={yearValid && !oldEnough ? { color: '#C0392B' } : undefined}>
            {yearValid && !oldEnough ? '롤롤은 만 14세 이상만 이용할 수 있어요.' : '나이 확인에만 쓰고 다른 사람에게는 보이지 않아요.'}
          </Muted>

          <View style={s.promise}>
            <Text style={s.promiseTitle}>롤롤 약속</Text>
            {PROMISES.map((line) => (
              <Text key={line} style={s.promiseLine}>
                · {line}
              </Text>
            ))}
            <Pressable onPress={() => setAgreed((v) => !v)} style={s.check} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
              <View style={[s.box, agreed && s.boxOn]}>{agreed && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}</View>
              <Text style={{ color: C.ink, flex: 1, fontWeight: '600' }}>약속을 지킬게요 (이용 약관 동의)</Text>
            </Pressable>
          </View>

          {error && <Text style={s.error}>{error}</Text>}
          <Button label={busy ? '정거장으로 가는 중…' : '이 친구로 시작하기'} onPress={start} disabled={!canStart} style={{ marginTop: 8 }} />
          {auth && (
            <Pressable onPress={() => router.push('/account?mode=restore')} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ color: C.skyDeep, fontWeight: '700' }}>이미 롤롤을 하고 있었나요? 이어하기</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 12, paddingBottom: 40, maxWidth: 520, width: '100%', alignSelf: 'center' },
  stageWrap: { width: '100%', aspectRatio: STAGE_RATIO, borderRadius: 24, overflow: 'hidden' },
  onStage: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: { position: 'absolute', bottom: 8, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden' },
  section: { fontFamily: Font.display, fontSize: 18, color: C.ink, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '23%', flexGrow: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.md, backgroundColor: C.card, borderWidth: 2, borderColor: C.line },
  optionOn: { borderColor: C.skyDeep, backgroundColor: C.skySoft },
  optLabel: { fontSize: 13, color: C.ink, marginTop: 2 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: { padding: 3, borderRadius: 24, borderWidth: 3, borderColor: 'transparent' },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  input: { backgroundColor: C.card, borderRadius: Radius.md, borderWidth: 2, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: C.ink },
  error: { color: '#C0392B', fontSize: 14 },
  promise: { backgroundColor: C.card, borderRadius: Radius.md, borderWidth: 2, borderColor: C.line, padding: 14, gap: 6, marginTop: 8 },
  promiseTitle: { fontFamily: Font.display, fontSize: 17, color: C.ink },
  promiseLine: { fontSize: 13, color: C.ink, lineHeight: 19 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.skyDeep, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.skyDeep },
});
