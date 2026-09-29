import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

// Android용 Expo Go(SDK 53+)는 expo-notifications를 import하는 순간 에러를 던진다.
// 그래서 정적 import 대신, 쓸 수 있는 환경에서만 필요할 때 불러온다.
const unsupported =
  Platform.OS === 'web' ||
  (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

let mod: NotificationsModule | null = null;
let prepared = false;

async function prepare(): Promise<NotificationsModule | null> {
  if (unsupported) return null;
  if (!mod) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as NotificationsModule;
  }
  const N = mod;
  if (prepared) return N;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: '현상 알림',
      importance: N.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await N.requestPermissionsAsync();
  prepared = status === 'granted';
  return prepared ? N : null;
}

/** 현상이 끝나는 시각에 로컬 알림. 서버 연결 후에는 서버 푸시로 대체한다. */
export async function scheduleDeveloped(readyAt: number) {
  try {
    const N = await prepare();
    if (!N) return;
    const seconds = Math.max(1, Math.round((readyAt - Date.now()) / 1000));
    await N.scheduleNotificationAsync({
      content: { title: '사진이 현상됐어요 🎞️', body: '롤롤 사진관에서 확인하고 열차에 태워 보세요.', data: { url: '/darkroom' } },
      trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: 'default' },
    });
  } catch {
    // 알림 실패는 앱 흐름을 막지 않는다
  }
}

/**
 * 서버 푸시용 Expo 토큰. 개발 빌드·출시 앱에서만 받는다(Expo Go·웹·에뮬레이터는 null).
 * projectId는 app.json의 extra.eas.projectId (eas init으로 연결).
 */
export async function getPushToken(): Promise<string | null> {
  try {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device') as typeof import('expo-device');
    if (!Device.isDevice) return null;
    const N = await prepare();
    if (!N) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    return (await N.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** 알림을 눌렀을 때 data.url로 이동한다. 해제 함수를 돌려준다. */
export function onNotificationTap(go: (url: string) => void): () => void {
  if (unsupported) return () => {};
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const N = (mod ??= require('expo-notifications') as NotificationsModule);
  const sub = N.addNotificationResponseReceivedListener((res) => {
    const url = res.notification.request.content.data?.url;
    if (typeof url === 'string') go(url);
  });
  return () => sub.remove();
}
