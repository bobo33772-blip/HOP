import { Image, type ImageSource } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';

import { C, Font, Radius, Space, shadow } from '@/constants/theme';
import { isBaked } from '@/lib/film';

export function Title({ style, ...p }: TextProps) {
  return <Text {...p} style={[s.title, style]} />;
}

export function Body({ style, ...p }: TextProps) {
  return <Text {...p} style={[s.body, style]} />;
}

export function Muted({ style, ...p }: TextProps) {
  return <Text {...p} style={[s.body, { color: C.inkSoft, fontSize: 13 }, style]} />;
}

type BtnProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, disabled, variant = 'primary', icon, style }: BtnProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.btn,
        primary ? s.btnPrimary : s.btnGhost,
        disabled && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}>
      {icon}
      <Text style={[s.btnText, { color: primary ? '#fff' : C.skyDeep }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Chip({ children, tone = 'sky' }: { children: ReactNode; tone?: 'sky' | 'pink' | 'film' }) {
  const bg = tone === 'sky' ? C.skySoft : tone === 'pink' ? C.pinkSoft : C.film;
  const fg = tone === 'sky' ? C.skyDeep : tone === 'pink' ? '#D0587B' : C.filmEdge;
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.chipText, { color: fg }]}>{children}</Text>
    </View>
  );
}

/**
 * 롤롤 필름 룩: 따뜻한 색 번짐 + 비네팅 + 날짜 각인.
 * MVP에서는 표시할 때 입히고, 이후 촬영 시 셰이더로 구워서 업로드한다.
 */
export function FilmPhoto({
  source,
  takenAt,
  style,
  stamp = true,
  autoAspect = false,
}: {
  source: ImageSource | number | string;
  takenAt?: number;
  style?: StyleProp<ViewStyle>;
  stamp?: boolean;
  /** 사진 원래 비율로 보여 준다 (구운 날짜 각인이 잘리지 않게) */
  autoAspect?: boolean;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  const d = takenAt ? new Date(takenAt) : null;
  const label = d ? `'${String(d.getFullYear()).slice(2)} ${d.getMonth() + 1} ${d.getDate()}` : null;
  // 이미 필름 룩이 구워진 사진에는 효과·각인을 다시 입히지 않는다
  const baked = isBaked(source);
  return (
    <View style={[s.photo, style, autoAspect && ratio ? { aspectRatio: ratio } : null]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        onLoad={autoAspect ? (e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height) : undefined}
      />
      {!baked && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F2A65A', opacity: 0.12 }]} />}
      {!baked && <View style={[StyleSheet.absoluteFill, s.vignette]} />}
      {stamp && !baked && label && <Text style={s.stamp}>{label}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: Font.display, fontSize: 24, color: C.ink },
  body: { fontSize: 15, color: C.ink, lineHeight: 22 },
  btn: {
    minHeight: 54,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  btnPrimary: { backgroundColor: C.sky, borderWidth: 3, borderColor: '#BFE0F7', ...shadow },
  btnGhost: { backgroundColor: C.card, borderWidth: 2, borderColor: C.skySoft },
  btnText: { fontFamily: Font.display, fontSize: 19 },
  card: { backgroundColor: C.card, borderRadius: Radius.lg, padding: Space.lg, borderWidth: 1, borderColor: C.line, ...shadow },
  chip: { alignSelf: 'flex-start', borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  photo: { overflow: 'hidden', backgroundColor: '#D9CBB5', borderRadius: 4 },
  vignette: { borderWidth: 10, borderColor: 'rgba(40,24,10,0.10)', borderRadius: 4 },
  stamp: {
    position: 'absolute',
    right: 8,
    bottom: 6,
    color: '#FF9A3C',
    fontFamily: Font.mono,
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(255,120,30,0.6)',
    textShadowRadius: 4,
  },
});
