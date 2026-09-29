import * as Haptics from 'expo-haptics';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

type AudioModule = typeof import('expo-audio');
type Player = ReturnType<AudioModule['createAudioPlayer']>;

/** 효과음 · 배경음 (tools/sound/make_sounds.py로 합성) */
const SOURCES = {
  squish: require('@/assets/sounds/squish.wav'),
  pop: require('@/assets/sounds/pop.wav'),
  stretch: require('@/assets/sounds/stretch.wav'),
  key1: require('@/assets/sounds/key1.wav'),
  key2: require('@/assets/sounds/key2.wav'),
  key3: require('@/assets/sounds/key3.wav'),
  inhale: require('@/assets/sounds/inhale.wav'),
  slurp: require('@/assets/sounds/slurp.wav'),
  blow: require('@/assets/sounds/blow.wav'),
  puff: require('@/assets/sounds/puff.wav'),
  fill: require('@/assets/sounds/fill.wav'),
  stamp: require('@/assets/sounds/stamp.wav'),
  paper: require('@/assets/sounds/paper.wav'),
  chime: require('@/assets/sounds/chime.wav'),
  step: require('@/assets/sounds/step.wav'),
} as const;

const MUSIC = require('@/assets/sounds/bgm_station.wav');

export type SoundId = keyof typeof SOURCES;

/** 빠르게 겹쳐 나는 소리는 플레이어 여러 개를 돌려 쓴다 (앞 소리가 끊기지 않게) */
const POOL: Partial<Record<SoundId, number>> = { key1: 2, key2: 2, key3: 2, squish: 2, pop: 2, fill: 2, step: 2 };

let audio: AudioModule | null | undefined;

/** 예전 개발 빌드처럼 오디오 모듈이 없으면 소리 없이 진동만 쓴다 */
function load(): AudioModule | null {
  if (audio !== undefined) return audio;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require('expo-audio') as AudioModule;
    // 폰이 진동·무음이어도 앱 소리는 낸다 (끄고 켜기는 앱 안 스위치로). 다른 앱 음악은 끊지 않는다.
    audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
  } catch {
    audio = null;
  }
  return audio;
}

function create(src: number): Player | null {
  const A = load();
  if (!A) return null;
  try {
    // downloadFirst는 쓰지 않는다: 소스 없이 만들어졌다가 나중에 바뀌어서 바로 부른 play()가 사라진다
    return A.createAudioPlayer(src, { updateInterval: 1000 });
  } catch {
    return null;
  }
}

const players = new Map<SoundId, { list: Player[]; next: number }>();

function slot(id: SoundId) {
  let s = players.get(id);
  if (s) return s;
  const list = Array.from({ length: POOL[id] ?? 1 }, () => create(SOURCES[id])).filter((p): p is Player => !!p);
  if (!list.length) return null;
  s = { list, next: 0 };
  players.set(id, s);
  return s;
}

/** 첫 소리가 늦지 않게 미리 불러 둔다 */
export function preload(ids: SoundId[]) {
  ids.forEach(slot);
}

export function play(id: SoundId, opts?: { volume?: number; rate?: number }) {
  if (muted) return;
  const s = slot(id);
  if (!s) return;
  const p = s.list[s.next];
  s.next = (s.next + 1) % s.list.length;
  try {
    p.volume = Math.max(0, Math.min(1, opts?.volume ?? 1));
    p.setPlaybackRate(opts?.rate ?? 1);
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // 소리는 놓쳐도 놀이는 이어진다
  }
}

/** 길게 나는 소리(들숨 바람 등)를 멈춘다 */
export function stop(id: SoundId) {
  players.get(id)?.list.forEach((p) => {
    try {
      p.pause();
    } catch {
      // 무시
    }
  });
}

// ─────────────────────────── 효과음 끄기 · 배경음 끄기 (이 기기에 기억)
const MUTE_KEY = 'rollroll.sound.muted';
const MUSIC_KEY = 'rollroll.music.off';
const read = (k: string) => {
  try {
    return globalThis.localStorage?.getItem(k) === '1';
  } catch {
    return false;
  }
};
const write = (k: string, v: boolean) => {
  try {
    globalThis.localStorage?.setItem(k, v ? '1' : '0');
  } catch {
    // 다음 실행 때는 기본값(켜짐)
  }
};

let muted = read(MUTE_KEY);
let musicOff = read(MUSIC_KEY);
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function setMuted(v: boolean) {
  muted = v;
  write(MUTE_KEY, v);
  notify();
}

export function useMuted() {
  return useSyncExternalStore(subscribe, () => muted);
}

export function setMusicOff(v: boolean) {
  musicOff = v;
  write(MUSIC_KEY, v);
  syncMusic();
  notify();
}

export function useMusicOff() {
  return useSyncExternalStore(subscribe, () => musicOff);
}

// ─────────────────────────── 배경음: 앱이 앞에 있는 동안 조용히 반복
const MUSIC_VOLUME = 0.32;
let music: Player | null = null;
let wanted = false;
let ducks = 0;
// 앱을 막 켰을 때는 상태가 아직 비어 있을 수 있다: 백그라운드가 아니면 앞에 있는 것으로 본다
let foreground = AppState.currentState !== 'background';

function syncMusic() {
  const should = wanted && !musicOff && foreground;
  if (should && !music) {
    music = create(MUSIC);
    if (music) music.loop = true;
  }
  if (!music) return;
  try {
    music.volume = ducks > 0 ? MUSIC_VOLUME * 0.35 : MUSIC_VOLUME;
    if (should) music.play();
    else music.pause();
  } catch {
    // 배경음은 없어도 된다
  }
}

AppState.addEventListener('change', (s) => {
  foreground = s !== 'background';
  syncMusic();
});

/** 배경음을 켤 화면(가입을 마친 뒤 앱 전체)에서 한 번 부른다 */
export function useBackgroundMusic(on: boolean) {
  useEffect(() => {
    wanted = on;
    syncMusic();
    return () => {
      wanted = false;
      syncMusic();
    };
  }, [on]);
}

/** 놀이 중에는 배경음을 작게 (숨소리 · 효과음이 잘 들리게) */
export function useDuckMusic() {
  useEffect(() => {
    ducks += 1;
    syncMusic();
    return () => {
      ducks -= 1;
      syncMusic();
    };
  }, []);
}

// ─────────────────────────── 진동
const native = Platform.OS !== 'web';
const safe = (p: Promise<void>) => p.catch(() => {});

export const buzz = {
  /** 말랑하게 누를 때 */
  soft: () => native && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  light: () => native && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => native && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => native && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** 키캡처럼 딱딱한 딸깍 */
  rigid: () => native && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** 늘어나는 동안 · 숨 박자 톡톡 */
  tick: () => native && safe(Haptics.selectionAsync()),
  success: () => native && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
