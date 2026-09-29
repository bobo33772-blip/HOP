import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MallangBall } from '@/components/mallang-ball';
import { Button, Muted, Title } from '@/components/ui';
import { C, Radius } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { useStore, type AuthMode } from '@/lib/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 이메일 6자리 코드로
 * - link: 지금 쓰는 익명 계정에 이메일을 연결하고
 * - restore: 다른 기기에서 쓰던 계정을 불러온다
 */
export default function AccountScreen() {
  const params = useLocalSearchParams<{ mode?: AuthMode }>();
  const mode: AuthMode = params.mode === 'restore' ? 'restore' : 'link';
  const { auth, state } = useStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = state.profile;
  const emailOk = EMAIL_RE.test(email.trim());
  const codeOk = /^\d{6,10}$/.test(code);

  const send = async () => {
    if (!auth || !emailOk) return;
    setBusy(true);
    setError(null);
    try {
      await auth.sendCode(email.trim().toLowerCase(), mode);
      setStep('code');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!auth || !codeOk) return;
    setBusy(true);
    setError(null);
    try {
      await auth.verifyCode(email.trim().toLowerCase(), code, mode);
      if (mode === 'restore') {
        router.dismissAll();
        router.replace('/');
      } else {
        setStep('done');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!auth) {
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <Title>로컬 모드에서는 쓸 수 없어요</Title>
        <Button label="돌아가기" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center' }}>
            {me ? (
              <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={110} expression={step === 'done' ? 'wink' : 'happy'} />
            ) : (
              <MallangBall animal="bear" color="sky" size={110} />
            )}
          </View>

          {step === 'done' ? (
            <>
              <Title style={s.center}>연결됐어요!</Title>
              <Muted style={s.centerText}>이제 폰을 바꾸거나 앱을 다시 설치해도, 처음 화면의 “이어하기”에서 {email.trim()}로 불러올 수 있어요.</Muted>
              <Button label="확인" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Title style={s.centerText}>{mode === 'link' ? '계정 연결하기' : '이어하기'}</Title>
              <Muted style={s.centerText}>
                {mode === 'link'
                  ? '지금은 이 폰에만 저장되고 있어요. 이메일을 연결하면 폰을 바꿔도 말랑볼과 크루, 친구가 그대로 남아요.'
                  : '전에 연결해 둔 이메일로 롤롤 계정을 불러와요.'}
              </Muted>

              <Text style={s.label}>이메일</Text>
              <TextInput
                id="account-email"
                value={email}
                onChangeText={setEmail}
                editable={step === 'email'}
                placeholder="me@example.com"
                placeholderTextColor={C.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                style={[s.input, step !== 'email' && { opacity: 0.6 }]}
              />

              {step === 'code' && (
                <>
                  <Text style={s.label}>메일로 받은 인증 코드</Text>
                  <TextInput
                    id="account-code"
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 10))}
                    placeholder="숫자 6자리"
                    placeholderTextColor={C.inkSoft}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    style={[s.input, s.code]}
                    autoFocus
                  />
                  <Muted>메일이 안 보이면 스팸함도 확인해 주세요.</Muted>
                </>
              )}

              {error && <Text style={s.error}>{error}</Text>}

              {step === 'email' ? (
                <Button label={busy ? '보내는 중…' : '인증 코드 받기'} onPress={send} disabled={!emailOk || busy} />
              ) : (
                <>
                  <Button label={busy ? '확인 중…' : mode === 'link' ? '연결하기' : '불러오기'} onPress={verify} disabled={!codeOk || busy} />
                  <Button
                    variant="ghost"
                    label="이메일 다시 입력"
                    onPress={() => {
                      setStep('email');
                      setCode('');
                      setError(null);
                    }}
                  />
                </>
              )}
              <Button variant="ghost" label="닫기" onPress={() => router.back()} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.cream },
  content: { padding: 20, gap: 12, paddingBottom: 40, maxWidth: 520, width: '100%', alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  centerText: { textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 6 },
  input: { backgroundColor: C.card, borderRadius: Radius.md, borderWidth: 2, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, color: C.ink },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  error: { color: '#C0392B', fontSize: 14, textAlign: 'center' },
});
