import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FilmStrip, FrameGap } from '@/components/film-strip';
import { MallangBall } from '@/components/mallang-ball';
import { Button, Card, FilmPhoto, Muted, Title } from '@/components/ui';
import { BODY_COLORS, C, Font, Radius } from '@/constants/theme';
import { STICKER_ART } from '@/lib/art';
import { friendlyError } from '@/lib/errors';
import { trainDestination, tripLabel } from '@/lib/format';
import { PLAYS } from '@/lib/play';
import { useStore } from '@/lib/store';
import { RULES } from '@/lib/rules';
import type { Action } from '@/lib/store';
import type { CrewPost, Passenger, ReportReason, Sticker } from '@/lib/types';

const STICKERS: Sticker[] = ['❤️', '✨', '☁️', '😆'];

export default function CrewAlbum() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch, mode } = useStore();
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ seat: number; who: Passenger } | null>(null);

  const crew = state.crews.find((c) => c.trainId === id);
  const train = state.trains.find((t) => t.id === id);
  if (!crew || !train) {
    return (
      <SafeAreaView style={[s.page, { alignItems: 'center', justifyContent: 'center' }]}>
        <Title>크루를 찾을 수 없어요</Title>
        <Button label="돌아가기" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const dest = trainDestination(train);
  const isBlocked = (p: Passenger) => !!p.blocked || state.blocked.includes(p.userId);
  const others = train.seats.filter((p) => p && !p.isMe && !isBlocked(p));

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };
  const run = async (a: Action, done?: string) => {
    try {
      await dispatch(a);
      if (done) say(done);
    } catch (e) {
      say(friendlyError(e));
    }
  };

  const mine = train.seats.find((p) => p?.isMe);
  const tint = (id: string) => BODY_COLORS.find((c) => c.id === id);

  return (
    <SafeAreaView edges={['top']} style={s.page}>
      <View style={s.top}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="뒤로" style={s.back}>
          <Text style={{ fontSize: 24, color: C.ink }}>‹</Text>
        </Pressable>
        <View style={s.titlePill}>
          {mine && <MallangBall animal={mine.animal} color={mine.color} size={38} />}
          <Text style={s.title} numberOfLines={1}>
            {dest.name} 크루 <Text style={s.titleSub}>· {tripLabel(train.endsAt, crew.closed)}</Text>
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* 크루원 8명: 꾹 누르면 인사 */}
        <View style={s.faces}>
          {train.seats.map((p, i) =>
            p ? (
              <View key={i} style={[s.faceRing, { backgroundColor: `${tint(p.color)?.fill}55`, borderColor: tint(p.color)?.fill }]}>
                <MallangBall
                  animal={p.animal}
                  color={p.color}
                  size={40}
                  squishable={!p.isMe && !isBlocked(p)}
                  onSquish={() => {
                    if (crew.pokesSent.includes(p.userId)) return say(`${p.nickname}에게 이미 인사했어요`);
                    run({ type: 'poke', trainId: train.id, userId: p.userId }, `${p.nickname}에게 말랑 꾹 인사를 보냈어요`);
                  }}
                />
              </View>
            ) : null,
          )}
        </View>
        <View style={s.pokeHint}>
          {mine && <MallangBall animal={mine.animal} color={mine.color} size={22} />}
          <Text style={s.pokeText}>말랑 꾹 👉 인사 보내기</Text>
        </View>

        {/* 8컷 필름 스트립 */}
        <FilmStrip label={`${dest.name} 크루`} frames={RULES.seatsPerTrain}>
          {train.seats.map((p, seat) => {
            if (!p) return null;
            const post = crew.posts.find((x) => x.seat === seat);
            const blocked = isBlocked(p);
            const nickColor = tint(p.color)?.shade ?? C.skyDeep;
            return (
              <View key={seat}>
                {seat > 0 && <FrameGap no={seat} />}
                <View style={s.row}>
                  <View style={s.shot}>
                    {blocked || p.hidden ? (
                      <View style={[StyleSheet.absoluteFill, s.veil]}>
                        <Text style={s.veilText}>{blocked ? '차단한 크루원의 사진이에요' : '신고가 쌓여 가려진 사진이에요'}</Text>
                      </View>
                    ) : p.photoUri ? (
                      <FilmPhoto source={p.photoUri} style={StyleSheet.absoluteFill} stamp={false} />
                    ) : (
                      <LuggageShot who={p} />
                    )}
                    <View style={s.no}>
                      <Text style={s.noText}>{String(seat + 1).padStart(2, '0')}</Text>
                    </View>
                    {!p.isMe && !blocked && (
                      <Pressable onPress={() => setSheet({ seat, who: p })} accessibilityRole="button" accessibilityLabel={`${p.nickname} 신고 또는 차단`} hitSlop={10} style={s.moreBtn}>
                        <Text style={s.more}>⋯</Text>
                      </Pressable>
                    )}
                  </View>
                  {!blocked && (
                    <View style={s.note}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <MallangBall animal={p.animal} color={p.color} size={26} />
                        <Text style={[s.nick, { color: nickColor }]} numberOfLines={1}>
                          {p.isMe ? `${p.nickname} (나)` : p.nickname}
                        </Text>
                      </View>
                      {post?.comments.map((c, i) => (
                        <Text key={i} style={s.comment}>
                          {c.body}
                          {!c.mine && <Text style={s.commentBy}> · {c.nickname}</Text>}
                        </Text>
                      ))}
                      <View style={s.stickers}>
                        {STICKERS.map((st) => {
                          const on = post?.myReaction === st;
                          const n = post?.reactions[st] ?? 0;
                          return (
                            <Pressable
                              key={st}
                              onPress={() => run({ type: 'react', trainId: train.id, seat, sticker: st })}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              style={[s.sticker, on && s.stickerOn]}>
                              <Image source={STICKER_ART[st]} style={s.stickerImg} contentFit="contain" transition={0} accessibilityLabel={st} />
                              {n > 0 && <Text style={s.stickerCount}>{n}</Text>}
                            </Pressable>
                          );
                        })}
                      </View>
                      <CommentBox post={post} onSend={(body) => run({ type: 'comment', trainId: train.id, seat, body })} />
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </FilmStrip>

        <View style={s.tip}>
          <Text style={s.tipText}>도착하면 서로 “또 타요”를 누른 크루원과{'\n'}단골 승객이 돼요 ✨</Text>
          {mine && <MallangBall animal={mine.animal} color={mine.color} size={44} expression="wink" />}
        </View>

        {/* 또 타요 */}
        <Card style={{ gap: 10 }}>
          <Text style={s.section}>또 타요</Text>
          {crew.closed ? (
            <Muted>
              선택을 마쳤어요. 지금 단골 승객은 {state.friends.length}명이에요.
            </Muted>
          ) : (
            <>
              {others.map((p) => {
                const on = crew.rideAgain.includes(p!.userId);
                return (
                  <View key={p!.userId} style={s.again}>
                    <MallangBall animal={p!.animal} color={p!.color} size={36} />
                    <Text style={[s.nick, { flex: 1 }]}>{p!.nickname}</Text>
                    <Pressable
                      onPress={() => run({ type: 'toggleRideAgain', trainId: train.id, userId: p!.userId })}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={[s.heart, on && s.heartOn]}>
                      <Text style={{ color: on ? '#D0587B' : C.inkSoft, fontWeight: '700' }}>{on ? '♥ 또 타요' : '♡ 또 타요'}</Text>
                    </Pressable>
                  </View>
                );
              })}
              {others.length === 0 && <Muted>함께 탄 크루원이 없어요. 다음 막차에서 만나요!</Muted>}
              <Muted>다시 만나고 싶은 크루원을 골라 두세요. 도착할 때 서로 고른 사람끼리만 단골 승객(친구)이 되고, 상대에게는 선택 여부가 보이지 않아요.</Muted>
              {mode === 'local' && <Button label="선택 완료 (개발용)" onPress={() => run({ type: 'closeTrip', trainId: train.id })} />}
            </>
          )}
        </Card>
      </ScrollView>

      <SafetySheet
        target={sheet}
        onClose={() => setSheet(null)}
        onReport={(reason) => {
          if (!sheet) return;
          setSheet(null);
          run({ type: 'report', trainId: train.id, userId: sheet.who.userId, photoId: sheet.who.photoId, reason }, '신고했어요. 운영자가 확인할게요.');
        }}
        onBlock={() => {
          if (!sheet) return;
          setSheet(null);
          run({ type: 'block', userId: sheet.who.userId }, `${sheet.who.nickname}님을 차단했어요.`);
        }}
      />

      {toast && (
        <View style={s.toast} pointerEvents="none">
          <Text style={{ color: '#fff' }}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

/** 사진 없이 탄 자리: 말랑볼과 챙겨 온 짐 */
function LuggageShot({ who }: { who: Passenger }) {
  const c = BODY_COLORS.find((b) => b.id === who.color);
  const bag = who.luggage ?? [];
  return (
    <View style={[StyleSheet.absoluteFill, s.luggage, { backgroundColor: c?.fill ?? C.skySoft }]}>
      <MallangBall animal={who.animal} color={who.color} size={58} expression="wink" />
      <Text style={s.luggageEmoji}>{bag.length ? bag.map((k) => PLAYS[k].emoji).join(' ') : '🎒'}</Text>
      <Text style={s.luggageText}>{bag.length ? `짐 ${bag.length}개` : '가벼운 가방'}</Text>
    </View>
  );
}

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'inappropriate', label: '부적절한 사진' },
  { id: 'privacy', label: '얼굴·개인정보가 드러나요' },
  { id: 'harassment', label: '불쾌한 말이나 괴롭힘' },
  { id: 'other', label: '기타' },
];

/** 신고·차단 시트. 차단은 한 번 더 확인한다. */
function SafetySheet({
  target,
  onClose,
  onReport,
  onBlock,
}: {
  target: { seat: number; who: Passenger } | null;
  onClose: () => void;
  onReport: (r: ReportReason) => void;
  onBlock: () => void;
}) {
  const [step, setStep] = useState<'menu' | 'report' | 'block'>('menu');
  const close = () => {
    setStep('menu');
    onClose();
  };
  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} accessibilityLabel="닫기" />
      <View style={s.sheet}>
        {step === 'menu' && (
          <>
            <Text style={s.sheetTitle}>{target?.who.nickname}</Text>
            <Pressable style={s.sheetRow} onPress={() => setStep('report')} accessibilityRole="button">
              <Text style={s.sheetText}>🚩 이 크루원 신고하기</Text>
            </Pressable>
            <Pressable style={s.sheetRow} onPress={() => setStep('block')} accessibilityRole="button">
              <Text style={[s.sheetText, { color: '#C0392B' }]}>🚫 이 크루원 차단하기</Text>
            </Pressable>
          </>
        )}
        {step === 'report' && (
          <>
            <Text style={s.sheetTitle}>어떤 문제가 있나요?</Text>
            {REASONS.map((r) => (
              <Pressable
                key={r.id}
                style={s.sheetRow}
                accessibilityRole="button"
                onPress={() => {
                  setStep('menu');
                  onReport(r.id);
                }}>
                <Text style={s.sheetText}>{r.label}</Text>
              </Pressable>
            ))}
            <Muted>신고한 사람은 상대에게 알려지지 않아요. 여러 명이 신고한 사진은 바로 가려져요.</Muted>
          </>
        )}
        {step === 'block' && (
          <>
            <Text style={s.sheetTitle}>{target?.who.nickname}님을 차단할까요?</Text>
            <Muted>차단하면 서로의 사진과 방명록이 보이지 않고, 인사를 주고받을 수 없어요. 앞으로 같은 열차에도 타지 않아요. 상대에게는 알리지 않아요.</Muted>
            <Button
              label="차단하기"
              onPress={() => {
                setStep('menu');
                onBlock();
              }}
              style={{ backgroundColor: '#C0392B', borderColor: '#E8A49B' }}
            />
          </>
        )}
        <Button label="닫기" variant="ghost" onPress={close} />
      </View>
    </Modal>
  );
}

function CommentBox({ post, onSend }: { post?: CrewPost; onSend: (body: string) => void }) {
  const mine = post?.comments.find((c) => c.mine);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={s.addComment}>{mine ? '한 줄 고치기' : '+ 한 줄 남기기'}</Text>
      </Pressable>
    );
  }
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft('');
    setOpen(false);
  };
  return (
    <View style={s.commentRow}>
      <TextInput
        value={draft}
        onChangeText={(t) => setDraft(t.slice(0, RULES.guestbookMaxLength))}
        placeholder={`한 줄로 남겨요 (${RULES.guestbookMaxLength}자)`}
        placeholderTextColor={C.inkSoft}
        style={s.commentInput}
        maxLength={RULES.guestbookMaxLength}
        returnKeyType="send"
        onSubmitEditing={send}
        autoFocus
      />
      <Pressable onPress={send} accessibilityRole="button" style={s.send}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>남기기</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.cream },
  addComment: { color: C.skyDeep, fontSize: 13, fontWeight: '700' },
  more: { color: '#FFFDF6', fontSize: 20, lineHeight: 20, paddingHorizontal: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  veil: { backgroundColor: '#4A3B31', alignItems: 'center', justifyContent: 'center', padding: 6 },
  luggage: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  luggageEmoji: { fontSize: 18, letterSpacing: 2 },
  luggageText: { fontFamily: Font.display, fontSize: 13, color: '#4A3426' },
  veilText: { color: '#E9DCCB', fontSize: 12, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(46,35,28,0.4)' },
  sheet: { backgroundColor: C.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 10 },
  sheetTitle: { fontFamily: Font.display, fontSize: 20, color: C.ink, marginBottom: 4 },
  sheetRow: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: C.line },
  sheetText: { fontSize: 15, color: C.ink },
  commentRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  commentInput: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.ink, backgroundColor: '#fff' },
  send: { backgroundColor: C.sky, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  back: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  titlePill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFDF6', borderRadius: 26, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 2, borderColor: '#F1E4CF' },
  title: { flex: 1, fontFamily: Font.display, fontSize: 21, color: C.ink },
  titleSub: { color: C.skyDeep, fontSize: 17 },
  content: { padding: 14, gap: 12, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' },
  faces: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 },
  faceRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pokeHint: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFDF6', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 2, borderColor: '#BFE0F7', marginBottom: -4 },
  pokeText: { fontFamily: Font.display, fontSize: 13, color: C.ink },
  row: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  shot: { width: '52%', aspectRatio: 4 / 3, borderRadius: 5, overflow: 'hidden', backgroundColor: '#3A302A' },
  no: { position: 'absolute', left: 5, top: 5, backgroundColor: 'rgba(255,253,246,0.95)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  noText: { fontFamily: Font.display, fontSize: 12, color: C.ink },
  moreBtn: { position: 'absolute', right: 4, top: 2 },
  note: { flex: 1, backgroundColor: '#FFFDF8', borderRadius: 8, padding: 7, gap: 4 },
  nick: { flex: 1, fontFamily: Font.display, fontSize: 13 },
  comment: { fontSize: 12, color: C.ink, lineHeight: 17 },
  commentBy: { color: C.inkSoft, fontSize: 11 },
  stickers: { flexDirection: 'row', gap: 3, flexWrap: 'wrap' },
  stickerImg: { width: 18, height: 18 },
  stickerCount: { fontFamily: Font.display, fontSize: 11, color: C.ink, marginLeft: 1 },
  sticker: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.pill, paddingHorizontal: 4, paddingVertical: 3, backgroundColor: '#F5ECDD' },
  stickerOn: { backgroundColor: C.pinkSoft, borderWidth: 1, borderColor: C.pink },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFDF6', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 2, borderColor: '#F1E4CF' },
  tipText: { flex: 1, fontSize: 13, color: '#8A5A3A', textAlign: 'center', lineHeight: 19, fontWeight: '700' },
  section: { fontFamily: Font.display, fontSize: 20, color: C.ink },
  again: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heart: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: C.line },
  heartOn: { borderColor: C.pink, backgroundColor: C.pinkSoft },
  toast: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(46,35,28,0.9)', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
});
