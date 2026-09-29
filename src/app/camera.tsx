import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TAB_ART } from '@/lib/art';
import { MallangBall } from '@/components/mallang-ball';
import { Button, Muted, Title } from '@/components/ui';
import { C, Font, Radius } from '@/constants/theme';
import { MOCK_PHOTOS } from '@/lib/mock';
import { friendlyError } from '@/lib/errors';
import { bakeFilm } from '@/lib/film';
import { scheduleDeveloped } from '@/lib/notify';
import { developDelayMs } from '@/lib/rules';
import { useDerived, useStore } from '@/lib/store';

/**
 * 찍은 사진을 줄이고 JPEG로 다시 저장한다(재인코딩으로 위치 정보 EXIF 제거).
 * 그다음 롤롤 필름 룩을 구워 앱 폴더에 보관한다. 굽기에 실패하면 원본을 보관한다.
 */
async function develop(uri: string): Promise<{ uri: string; baked: boolean }> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1440, height: null });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
  if (Platform.OS === 'web') return { uri: out.uri, baked: false };
  const film = await bakeFilm(out.uri, Date.now());
  if (film.baked) return film;
  const dir = new Directory(Paths.document, 'films');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${Date.now()}.jpg`);
  await new File(out.uri).copy(dest);
  return { uri: dest.uri, baked: false };
}

export default function CameraScreen() {
  const { state, dispatch } = useStore();
  const { filmsLeft, myLine } = useDerived();
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [done, setDone] = useState(false);
  const me = state.profile!;

  const [error, setError] = useState<string | null>(null);

  /** 서버 모드에서는 업로드 후 서버가 정한 현상 시각을 돌려받는다 */
  const finish = async (uri: string | number, baked = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await dispatch({ type: 'takePhoto', uri, readyAt: Date.now() + developDelayMs(), baked });
      // 즉시·짧은 현상이면 알림 대신 현상소에서 바로 보여 준다
      if (res?.readyAt && res.readyAt - Date.now() > 60000) scheduleDeveloped(res.readyAt);
      setDone(true);
      setTimeout(() => router.replace('/darkroom'), 1100);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  const shoot = async () => {
    if (!cam.current || !ready || busy || filmsLeft <= 0) return;
    setBusy(true);
    try {
      const pic = await cam.current.takePictureAsync({ quality: 0.9, exif: false });
      const film = await develop(pic.uri);
      await finish(film.uri, film.baked);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  const header = (
    <View style={s.header}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="닫기" style={s.close}>
        <Text style={{ fontSize: 22, color: C.ink }}>✕</Text>
      </Pressable>
      <View style={s.destPill}>
        <Text style={s.destLabel}>창밖 한 컷</Text>
        <Text style={s.dest}>
          {myLine ? `${myLine.emoji} ${myLine.name}` : '🪟 오늘 밤 막차에 함께'}
        </Text>
      </View>
      <View style={s.filmPill}>
        <Image source={TAB_ART.darkroom} style={{ width: 26, height: 26 }} contentFit="contain" transition={0} />
        <Text style={s.film}>
          {filmsLeft}/{state.filmsPerDay}
        </Text>
      </View>
    </View>
  );

  if (done) {
    return (
      <SafeAreaView style={[s.page, s.center]}>
        <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={140} expression="wink" />
        <Title>찰칵!</Title>
        <Muted>현상소로 보냈어요. 현상되면 알려 드릴게요.</Muted>
      </SafeAreaView>
    );
  }

  if (filmsLeft <= 0) {
    return (
      <SafeAreaView style={s.page}>
        {header}
        <View style={s.center}>
          <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={130} expression="sleepy" />
          <Title>오늘 필름을 다 썼어요</Title>
          <Muted>내일 새 필름 {state.filmsPerDay}장이 도착해요.</Muted>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page}>
      {header}

      <View style={s.viewfinder}>
        {!permission ? (
          <ActivityIndicator color={C.sky} />
        ) : permission.granted ? (
          <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" flash={flash} onCameraReady={() => setReady(true)} />
        ) : (
          <View style={[s.center, { padding: 24 }]}>
            <Title style={{ fontSize: 20, textAlign: 'center', color: '#FFF8EC' }}>일상을 찍으려면 카메라가 필요해요</Title>
            <Button label="카메라 허용하기" onPress={requestPermission} />
          </View>
        )}
        {/* 레인지파인더 브라이트 라인 */}
        <View pointerEvents="none" style={s.frameLines}>
          <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
          <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
          <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />
        </View>
        <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={78} style={s.peek} />
      </View>

      <Text style={s.prompt}>“지금 창밖에 보이는 것”</Text>

      <View style={s.controls}>
        <View style={s.filmChip}>
          <Text style={s.filmChipText}>기본 컬러</Text>
        </View>
        <Pressable
          onPress={shoot}
          disabled={busy || !ready}
          accessibilityRole="button"
          accessibilityLabel="셔터"
          style={({ pressed }) => [s.shutter, pressed && { transform: [{ scale: 0.93 }] }, (!ready || busy) && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <View style={s.shutterDot} />}
        </Pressable>
        <Pressable onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))} style={s.filmChip} accessibilityRole="switch" accessibilityState={{ checked: flash === 'on' }}>
          <Text style={s.filmChipText}>⚡ {flash === 'on' ? 'ON' : 'OFF'}</Text>
        </Pressable>
      </View>
      {error ? (
        <Text style={{ textAlign: 'center', color: '#C0392B' }}>{error}</Text>
      ) : (
        <Muted style={{ textAlign: 'center' }}>한 번 찍으면 고칠 수 없어요 · 필름처럼</Muted>
      )}

      {__DEV__ && (
        <Button
          variant="ghost"
          label="샘플 사진으로 찍기 (개발용)"
          onPress={() => finish(MOCK_PHOTOS[Math.floor(Math.random() * MOCK_PHOTOS.length)])}
          style={{ marginHorizontal: 16 }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.cream, gap: 12, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  destPill: { flex: 1, backgroundColor: '#fff', borderRadius: Radius.lg, paddingVertical: 6, paddingHorizontal: 14 },
  destLabel: { fontSize: 11, color: C.inkSoft },
  dest: { fontFamily: Font.display, fontSize: 20, color: C.skyDeep },
  filmPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: Radius.lg, paddingVertical: 8, paddingHorizontal: 12 },
  film: { fontFamily: Font.display, fontSize: 18, color: C.ink },
  viewfinder: { flex: 1, marginHorizontal: 16, borderRadius: 26, overflow: 'hidden', backgroundColor: '#2E231C', alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#FFFFFF' },
  frameLines: { position: 'absolute', top: 24, left: 24, right: 24, bottom: 24 },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 4 },
  peek: { position: 'absolute', left: 8, bottom: 6 },
  prompt: { textAlign: 'center', fontFamily: Font.display, fontSize: 16, color: C.ink },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  filmChip: { minWidth: 88, alignItems: 'center', backgroundColor: '#fff', borderRadius: Radius.pill, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 2, borderColor: C.line },
  filmChipText: { fontFamily: Font.display, fontSize: 14, color: C.ink },
  shutter: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.sky, borderWidth: 6, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 4, borderColor: '#fff' },
});
