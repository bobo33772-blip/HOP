import { StyleSheet, Text, View } from 'react-native';

import { C, Font, Radius, shadow } from '@/constants/theme';
import { STAGES, nextGoal } from '@/lib/rules';
import { useDerived, useStore } from '@/lib/store';

import { MallangBall } from './mallang-ball';
import { TicketIcon } from './play/play-kit';

/** 상단 HUD: 아바타 · 성장(여행 · 쉰 시간 · 다음 단계까지) · 오늘 받은 쉼 티켓 */
export function Hud() {
  const { state } = useStore();
  const { tonight, ticketsMax } = useDerived();
  const p = state.profile;
  if (!p) return null;
  const g = state.growth;
  const goal = nextGoal(p.stage, state.growthRules);
  // 다음 단계까지: 기준마다 채운 비율의 평균 (한 가지만 모자라도 막대가 멈추지 않게)
  const parts = goal ? [g.trips / goal.trips, g.restMinutes / goal.rest, ...(goal.riders ? [g.riders / goal.riders] : [])].map((r) => Math.min(1, r)) : [1];
  const ratio = parts.reduce((a, b) => a + b, 0) / parts.length;

  return (
    <View style={s.row}>
      <View style={[s.pill, { flex: 1 }]}>
        <MallangBall animal={p.animal} color={p.color} stage={p.stage} size={44} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.lv} numberOfLines={1}>
            {STAGES[p.stage].label}
            {goal && <Text style={s.stage}> → {STAGES[goal.stage].label}</Text>}
          </Text>
          <View style={s.bar} accessibilityLabel={goal ? `${STAGES[goal.stage].label}까지 ${Math.round(ratio * 100)}%` : '최종 단계'}>
            <View style={[s.fill, { width: `${ratio * 100}%` }]} />
          </View>
          <Text style={s.xp} numberOfLines={1}>
            {goal
              ? `여행 ${g.trips}/${goal.trips} · 쉼 ${g.restMinutes}/${goal.rest}분${goal.riders ? ` · 함께 ${g.riders}/${goal.riders}` : ''}`
              : `여행 ${g.trips}번 · 쉰 시간 ${g.restMinutes}분`}
          </Text>
        </View>
      </View>
      <View style={s.pill} accessibilityLabel={`오늘 밤 막차 티켓 ${tonight.length}장, 최대 ${ticketsMax}장`}>
        <TicketIcon size={32} color={C.sky} dim={tonight.length === 0} />
        <View>
          <Text style={s.filmLabel}>티켓</Text>
          <Text style={s.film}>
            {tonight.length}/{ticketsMax}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function FilmCanister({ size = 30 }: { size?: number }) {
  return (
    <View style={{ width: size * 0.8, height: size, alignItems: 'center' }}>
      <View style={{ width: size * 0.4, height: size * 0.14, backgroundColor: '#6B4A33', borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
      <View style={{ flex: 1, width: '100%', backgroundColor: '#8A5A3A', borderRadius: 5, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '70%', height: '55%', backgroundColor: C.cream, borderRadius: 3 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...shadow,
  },
  lv: { fontFamily: Font.display, fontSize: 17, color: C.skyDeep },
  stage: { color: C.inkSoft, fontSize: 14 },
  bar: { height: 8, borderRadius: 4, backgroundColor: C.skySoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.sky, borderRadius: 4 },
  xp: { fontSize: 11, color: C.inkSoft, fontVariant: ['tabular-nums'] },
  filmLabel: { fontSize: 11, color: C.inkSoft },
  film: { fontFamily: Font.display, fontSize: 20, color: C.ink, fontVariant: ['tabular-nums'] },
});
