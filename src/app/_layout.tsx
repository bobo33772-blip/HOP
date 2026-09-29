import { Jua_400Regular, useFonts } from '@expo-google-fonts/jua';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BootSplash } from '@/components/boot-splash';
import { MallangBall } from '@/components/mallang-ball';
import { Button, Muted, Title } from '@/components/ui';
import { C } from '@/constants/theme';
import { onNotificationTap } from '@/lib/notify';
import { useBackgroundMusic } from '@/lib/sound';
import { StoreProvider } from '@/lib/provider';
import { useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Jua_400Regular });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#E9DAC3' : C.cream }}>
      {/* 웹(PC)에서는 가운데 폰 크기 틀 안에 보여 준다 */}
      <View style={Platform.OS === 'web' ? s.webFrame : { flex: 1 }}>
        <StoreProvider>
          <StatusBar style="dark" />
          {fontsLoaded && <Routes />}
          <Splash fontsLoaded={fontsLoaded} />
        </StoreProvider>
      </View>
    </GestureHandlerRootView>
  );
}

/** 글꼴과 첫 데이터가 준비될 때까지 크림색 + 곰 스플래시 */
function Splash({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready } = useStore();
  return <BootSplash ready={fontsLoaded && ready} />;
}

function Routes() {
  const { ready, error, state, retry } = useStore();
  useBackgroundMusic(!!state.profile);

  // 푸시 알림을 누르면 해당 화면으로 (예: 크루 앨범)
  useEffect(() => onNotificationTap((url) => router.push(url as never)), []);

  if (!ready) return null;

  // 서버에 처음 연결조차 못 했을 때만 전체 화면으로 알린다 (이후 오류는 화면 안에서 처리)
  if (error && !state.profile) {
    return (
      <View style={s.center}>
        <MallangBall animal="bear" color="sky" size={120} expression="surprised" />
        <Title style={{ textAlign: 'center' }}>정거장에 연결하지 못했어요</Title>
        <Muted style={{ textAlign: 'center' }}>{error}</Muted>
        <Button label="다시 시도" onPress={retry} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.cream } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="board" options={{ presentation: 'modal' }} />
      <Stack.Screen name="rest" options={{ presentation: 'modal' }} />
      <Stack.Screen name="play/squish" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="play/noodle" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="play/color" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="departure" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="evolve" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="crew/[id]" />
      <Stack.Screen name="account" options={{ presentation: 'modal' }} />
      <Stack.Screen name="dev-gallery" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

const s = StyleSheet.create({
  webFrame: { flex: 1, width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: C.cream, overflow: 'hidden', shadowColor: '#4A3426', shadowOpacity: 0.18, shadowRadius: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: C.cream },
});
