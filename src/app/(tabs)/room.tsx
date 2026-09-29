import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { MallangBall } from '@/components/mallang-ball';
import { TicketIcon } from '@/components/play/play-kit';
import { RoomView } from '@/components/room-view';
import { Button, Card, Muted } from '@/components/ui';
import { C, Font, Radius, shadow } from '@/constants/theme';
import { ROOM_THUMB, SLOT_ICON } from '@/lib/art';
import { friendlyError } from '@/lib/errors';
import { ROOM_ITEMS, SLOTS, isUnlocked, resolveRoom, unlockHint, type SlotId } from '@/lib/room';
import { STAGES, type Stage } from '@/lib/rules';
import { useDerived, useStore } from '@/lib/store';

const ORDER: Stage[] = ['mallang', 'banjjak', 'rollroll'];
/** 방 그림 맨 위 하늘색 (그림 위로 이어 칠한다) */
const ROOM_SKY = '#B2DAFA';

export default function Room() {
  const { state, account, dispatch } = useStore();
  const { level, tonight, ticketsMax } = useDerived();
  const insets = useSafeAreaInsets();
  const me = state.profile!;
  const rolls = state.crews.length;
  const [slot, setSlot] = useState<SlotId>('left');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await dispatch({ type: 'deleteAccount' });
      router.replace('/onboarding');
    } catch (e) {
      setDeleteError(friendlyError(e));
      setDeleting(false);
    }
  };

  const ctx = { level, stage: me.stage, rolls, friends: state.friends.length };
  const rules = state.growthRules;
  const room = resolveRoom(me.room, ctx);
  const unlockedCount = ROOM_ITEMS.filter((i) => isUnlocked(i, ctx)).length;

  // 크루 앨범 액자: 최근 크루의 사진 3장 (다른 크루원 사진을 먼저)
  const crewPhotos = useMemo(() => {
    const out: (string | number)[] = [];
    for (const c of [...state.crews].reverse()) {
      const t = state.trains.find((x) => x.id === c.trainId);
      const seats = (t?.seats ?? []).filter((p) => p && !p.blocked && !p.hidden && p.photoUri !== undefined && p.photoUri !== '');
      seats.sort((a, b) => Number(!!a?.isMe) - Number(!!b?.isMe));
      for (const p of seats) if (out.length < 3) out.push(p!.photoUri!);
      if (out.length >= 3) break;
    }
    return out;
  }, [state.crews, state.trains]);

  const equip = async (itemId: string) => {
    setError(null);
    try {
      await dispatch({ type: 'setRoom', slot, itemId });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: ROOM_SKY }} contentContainerStyle={{ paddingBottom: 40, backgroundColor: C.cream }}>
      {/* 3D 방 + 머리 알약. 알약이 방을 가리지 않게 그림 위로 하늘을 이어 붙인다 */}
      <View style={{ backgroundColor: ROOM_SKY }}>
        <View style={{ height: insets.top + 64 }} />
        <View>
          <RoomView room={room} avatar={{ animal: me.animal, color: me.color, stage: me.stage }} crewPhotos={crewPhotos} />
          <Svg width="100%" height={48} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
            <Defs>
              <LinearGradient id="roomfade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ROOM_SKY} stopOpacity={1} />
                <Stop offset="1" stopColor={ROOM_SKY} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width="100%" height={48} fill="url(#roomfade)" />
          </Svg>
        </View>
        <View style={[s.head, { top: insets.top + 6 }]} pointerEvents="none">
          <View style={[s.pill, { flex: 1 }]}>
            <MallangBall animal={me.animal} color={me.color} stage={me.stage} size={42} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.roomName} numberOfLines={1}>
                {me.nickname}의 방
              </Text>
              <View style={s.bar} accessibilityLabel={`모은 아이템 ${unlockedCount} / ${ROOM_ITEMS.length}`}>
                <View style={[s.fill, { width: `${(unlockedCount / ROOM_ITEMS.length) * 100}%` }]} />
              </View>
              <Text style={s.stat}>
                친구 {state.friends.length}명 · 롤 {rolls}개 · 아이템 {unlockedCount}/{ROOM_ITEMS.length}
              </Text>
            </View>
          </View>
          <View style={s.pill}>
            <TicketIcon size={30} color={C.sky} dim={tonight.length === 0} />
            <View>
              <Text style={s.stat}>티켓</Text>
              <Text style={s.film}>
                {tonight.length}/{ticketsMax}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 꾸미기 시트 */}
      <View style={s.sheet}>
        <View style={s.handle} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {SLOTS.map((sl) => {
            const on = sl.id === slot;
            return (
              <Pressable key={sl.id} onPress={() => setSlot(sl.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.tab, on && s.tabOn]}>
                <Image source={SLOT_ICON[sl.id]} style={s.tabIcon} contentFit="contain" transition={0} />
                <Text style={[s.tabText, on && { color: '#fff' }]}>{sl.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={s.items}>
          {ROOM_ITEMS.filter((i) => i.slot === slot).map((item) => {
            const open = isUnlocked(item, ctx);
            const on = room[slot] === item.id;
            return (
              <Pressable
                key={item.id}
                disabled={!open || on}
                onPress={() => equip(item.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !open }}
                accessibilityLabel={open ? item.name : `${item.name}, ${unlockHint(item)}`}
                style={[s.item, on && s.itemOn, !open && s.itemLocked]}>
                <Image source={ROOM_THUMB[item.id]} style={[s.thumb, !open && { opacity: 0.45 }]} contentFit="contain" transition={0} />
                {!open && (
                  <View style={s.lockBadge}>
                    <Text style={s.lockText} numberOfLines={2}>
                      🔒 {unlockHint(item)}
                    </Text>
                  </View>
                )}
                <Text style={s.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[s.itemHint, on && { color: C.skyDeep }]}>{on ? '배치 중' : open ? '눌러서 배치' : ''}</Text>
              </Pressable>
            );
          })}
        </View>
        {error && <Muted style={{ color: '#C0392B', paddingHorizontal: 16 }}>{error}</Muted>}
      </View>

      <View style={s.below}>
        <Card style={{ gap: 12 }}>
          <Text style={s.section}>성장</Text>
          <View style={s.stages}>
            {ORDER.map((st) => {
              const reached = ORDER.indexOf(st) <= ORDER.indexOf(me.stage);
              const info = STAGES[st];
              return (
                <View key={st} style={[s.stage, !reached && { opacity: 0.45 }]}>
                  <MallangBall animal={me.animal} color={me.color} stage={st} size={64} />
                  <Text style={s.stageName}>{info.label}</Text>
                  <Text style={s.stageReq}>
                    {st === 'mallang'
                      ? '시작'
                      : st === 'banjjak'
                        ? `여행 ${rules.banjjakTrips}번\n쉰 시간 ${rules.banjjakRest}분`
                        : `여행 ${rules.rollrollTrips}번\n쉰 시간 ${rules.rollrollRest}분\n함께 탄 ${rules.rollrollRiders}명`}
                  </Text>
                </View>
              );
            })}
          </View>
          <Muted>
            지금 여행 {state.growth.trips}번 · 쉰 시간 {state.growth.restMinutes}분 · 함께 탄 말랑볼 {state.growth.riders}명. 쉰 시간은 하루 {rules.restDailyCap}분까지 성장에 쳐요. 한번 자라면 되돌아가지 않아요.
          </Muted>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={s.section}>노선 공개</Text>
          <Pressable
            onPress={() => dispatch({ type: 'setShareLine', on: !me.shareLine }).catch((e) => setError(friendlyError(e)))}
            accessibilityRole="switch"
            accessibilityState={{ checked: !!me.shareLine }}
            style={s.toggleRow}>
            <Text style={{ flex: 1, color: C.ink, lineHeight: 21 }}>친구 크루에게 내 노선 보여주기</Text>
            <View style={[s.toggle, me.shareLine && s.toggleOn]}>
              <View style={[s.knob, me.shareLine && { alignSelf: 'flex-end' }]} />
            </View>
          </Pressable>
          <Muted>고른 기분은 나만 봐요. 켜면 친구 크루 열차에서 내 칸이 노선 색으로 보여요(친구 크루 열차는 곧 열려요). 같은 기분 열차에서는 서로 같은 노선이라는 것만 알 수 있어요.</Muted>
        </Card>

        {account && (
          <Card style={{ gap: 8 }}>
            <Text style={s.section}>계정</Text>
            {account.anonymous ? (
              <>
                <Muted>지금은 이 폰에만 저장되고 있어요. 앱을 지우거나 폰을 바꾸면 말랑볼과 친구가 사라질 수 있어요.</Muted>
                <Button label="이메일로 계정 연결하기" onPress={() => router.push('/account?mode=link')} />
              </>
            ) : (
              <Muted>✅ {account.email ?? '이메일'} 계정에 연결돼 있어요. 다른 폰에서도 “이어하기”로 불러올 수 있어요.</Muted>
            )}
          </Card>
        )}

        {__DEV__ && <Button variant="ghost" label="캐릭터 도감 (개발용)" onPress={() => router.push('/dev-gallery')} />}

        <Card style={{ gap: 8 }}>
          <Text style={s.section}>계정 삭제</Text>
          {!confirmDelete ? (
            <>
              <Muted>계정을 지우면 말랑볼, 사진, 크루 기록, 친구가 모두 사라지고 되돌릴 수 없어요.</Muted>
              <Pressable onPress={() => setConfirmDelete(true)} accessibilityRole="button" style={s.dangerLink}>
                <Text style={s.dangerText}>계정 삭제하기</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ color: C.ink, lineHeight: 21 }}>
                정말 지울까요? {me.nickname}의 사진 파일과 크루 앨범 속 내 사진, 방명록, 친구 관계가 모두 바로 지워져요. 함께 탔던 크루원의 앨범에서도 내 칸이 사라져요.
              </Text>
              {deleteError && <Muted style={{ color: '#C0392B' }}>{deleteError}</Muted>}
              <Button label={deleting ? '지우는 중…' : '네, 영구히 삭제할게요'} onPress={deleteAccount} disabled={deleting} style={s.dangerButton} />
              <Button variant="ghost" label="취소" onPress={() => setConfirmDelete(false)} disabled={deleting} />
            </>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,253,246,0.95)', borderRadius: 22, paddingVertical: 7, paddingHorizontal: 10, ...shadow },
  roomName: { fontFamily: Font.display, fontSize: 17, color: C.ink },
  bar: { height: 7, borderRadius: 4, backgroundColor: C.skySoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.sky, borderRadius: 4 },
  stat: { fontSize: 11, color: C.inkSoft },
  film: { fontFamily: Font.display, fontSize: 19, color: C.ink },
  sheet: { marginTop: -26, backgroundColor: C.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingBottom: 12, gap: 12 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#E3D3BC' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 14, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: '#F3E6D2' },
  tabOn: { backgroundColor: C.skyDeep },
  tabIcon: { width: 26, height: 26 },
  tabText: { fontFamily: Font.display, fontSize: 15, color: C.ink },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  item: { width: '31%', flexGrow: 1, maxWidth: '33%', borderRadius: Radius.md, borderWidth: 2, borderColor: C.line, backgroundColor: '#FFFDF8', padding: 8, alignItems: 'center', gap: 2 },
  itemOn: { borderColor: C.sky, backgroundColor: '#F2F9FF' },
  itemLocked: { backgroundColor: '#F1EBE2' },
  thumb: { width: '100%', aspectRatio: 1.15 },
  lockBadge: { position: 'absolute', top: 30, left: 6, right: 6, backgroundColor: 'rgba(255,248,236,0.95)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#E8D2A8' },
  lockText: { fontSize: 10, color: '#8A6A3A', textAlign: 'center', fontWeight: '700' },
  itemName: { fontFamily: Font.display, fontSize: 14, color: C.ink },
  itemHint: { fontSize: 11, color: C.inkSoft },
  below: { padding: 16, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' },
  section: { fontFamily: Font.display, fontSize: 20, color: C.ink },
  stages: { flexDirection: 'row', justifyContent: 'space-between' },
  stage: { alignItems: 'center', flex: 1, gap: 2 },
  stageName: { fontFamily: Font.display, fontSize: 16, color: C.ink },
  stageReq: { fontSize: 11, color: C.inkSoft, textAlign: 'center' },
  dangerLink: { alignSelf: 'flex-start', paddingVertical: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: '#E3D6C3', padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: C.sky },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  dangerText: { color: '#C0392B', fontWeight: '700' },
  dangerButton: { backgroundColor: '#C0392B', borderColor: '#E8A49B' },
});
