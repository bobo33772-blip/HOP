import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hud } from '@/components/hud';
import { StationScene } from '@/components/station-scene';
import { seatCount } from '@/components/train';
import { Button, Muted } from '@/components/ui';
import { C, Font, shadow } from '@/constants/theme';
import { STICKER_ART } from '@/lib/art';
import { friendlyError } from '@/lib/errors';
import { arrivalLabel, clock, trainDestination } from '@/lib/format';
import { RULES } from '@/lib/rules';
import { setMusicOff, useMusicOff } from '@/lib/sound';
import { useDerived, useStore } from '@/lib/store';
import type { Train } from '@/lib/types';

const EMPTY_TRAIN: Train = { id: 'empty', destinationId: 'pick', dayKey: '', seats: Array(8).fill(null), status: 'filling', createdAt: 0 };

export default function Station() {
  const { state, dispatch, mode } = useStore();
  const { nextDeparture, tonight, ticketsMax, myTonight, myLine, traveling, returned } = useDerived();
  const me = state.profile!;
  // 아직 안 탔으면 빈 막차가 정거장에 서서 기다린다
  const shown = myTonight ?? EMPTY_TRAIN;
  const hung = state.photos.filter((p) => p.status === 'boarded').slice(0, 4);
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const filled = shown ? seatCount(shown) : 0;
  const lastTrain = clock(nextDeparture);
  const musicOff = useMusicOff();

  // 내 말랑볼 머리 위 말풍선: 지금 할 일 하나
  const guide = traveling
    ? { text: `${trainDestination(traveling).name} 여행 중이에요! ${arrivalLabel(traveling.arrivesAt!)}에 도착해요`, onPress: () => router.push(`/crew/${traveling.id}`) }
    : myTonight
      ? {
          text: `${myLine?.name ?? '막차'} 탑승 완료! ${lastTrain}에 출발해요${tonight.length < ticketsMax ? ' · 짐을 더 챙겨도 돼요' : ''}`,
          onPress: () => router.push('/rest'),
        }
      : returned
        ? { text: `${trainDestination(returned).name} 여행에서 돌아왔어요! 크루 앨범을 볼까요?`, onPress: () => router.push(`/crew/${returned.id}`) }
        : tonight.length > 0
          ? { text: `티켓 ${tonight.length}장! 오늘 기분을 고르고 ${lastTrain} 막차에 탈까요?`, onPress: () => router.push('/board') }
          : { text: '잠깐 쉬어 갈까요? 짐을 싸면 막차 티켓이 생겨요', onPress: () => router.push('/rest') };

  const canDevDepart = myTonight || tonight.length > 0;

  return (
    <View style={s.bg}>
      <StationScene
        train={shown}
        destination={{ id: myLine?.id ?? 'pick', name: myLine?.name ?? '기분을 골라요' }}
        me={{ animal: me.animal, color: me.color, stage: me.stage, nickname: me.nickname }}
        hung={hung.map((p) => ({ id: p.id, uri: p.uri, takenAt: p.takenAt }))}
        guide={guide}
        onBoard={() => router.push(tonight.length > 0 ? '/board' : '/rest')}
        onStudio={() => router.push('/darkroom')}
      />

      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <Hud />
        <Pressable
          onPress={() => setMusicOff(!musicOff)}
          accessibilityRole="switch"
          accessibilityState={{ checked: !musicOff }}
          accessibilityLabel="배경음"
          hitSlop={8}
          style={s.music}>
          <Text style={[s.musicText, musicOff && { opacity: 0.4 }]}>♪</Text>
          {musicOff && <View style={s.musicSlash} />}
        </Pressable>
        <View style={s.rolling} pointerEvents="none">
          <Image source={STICKER_ART['☁️']} style={s.cloud} contentFit="contain" transition={0} />
          <View>
            <Text style={s.rollingText}>{traveling ? 'On the trip…' : 'Rolling...'}</Text>
            <Text style={s.rollingSub}>
              {myLine?.name ?? '오늘 밤'} 막차 {lastTrain} ·{' '}
              <Text style={{ color: C.skyDeep }}>
                {filled}/{RULES.seatsPerTrain}
              </Text>
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {__DEV__ && state.devTools && canDevDepart && (
        <View style={s.dev}>
          <Muted>테스트 도구 · 서버 dev_tools가 켜져 있을 때만 보여요</Muted>
          <Button
            variant="ghost"
            label={devBusy ? '출발시키는 중…' : '지금 막차 출발 (2분 뒤 도착)'}
            disabled={devBusy}
            onPress={async () => {
              setDevBusy(true);
              setDevError(null);
              try {
                await dispatch({ type: 'devDepartNow' });
              } catch (e) {
                setDevError(friendlyError(e));
              } finally {
                setDevBusy(false);
              }
            }}
          />
          {devError && <Muted style={{ color: '#C0392B' }}>{devError}</Muted>}
        </View>
      )}

      {__DEV__ && mode === 'local' && canDevDepart && (
        <View style={s.dev}>
          <Button variant="ghost" label="지금 막차 출발 (개발용)" onPress={() => dispatch({ type: 'devDepartNow' })} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.cream },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 14, paddingTop: 6, gap: 10 },
  rolling: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,253,246,0.95)',
    borderRadius: 26,
    paddingLeft: 10,
    paddingRight: 18,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#DCEEFB',
    ...shadow,
  },
  cloud: { width: 34, height: 34 },
  music: { position: 'absolute', right: 14, top: 86, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,253,246,0.95)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#DCEEFB', ...shadow },
  musicText: { fontFamily: Font.display, fontSize: 20, color: C.skyDeep, marginTop: -2 },
  musicSlash: { position: 'absolute', width: 26, height: 2.5, borderRadius: 2, backgroundColor: '#C0392B', transform: [{ rotate: '-45deg' }] },
  rollingText: { fontFamily: Font.display, fontSize: 22, color: '#6B4A33', letterSpacing: 0.5 },
  rollingSub: { fontFamily: Font.display, fontSize: 15, color: C.ink, marginTop: -2 },
  dev: { position: 'absolute', left: 12, right: 12, bottom: 8, gap: 6, backgroundColor: 'rgba(255,248,236,0.9)', borderRadius: 14, padding: 8 },
});
