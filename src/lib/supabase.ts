import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import './storage-polyfill';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** 환경 변수가 없으면 null — 앱은 로컬 모드(가짜 승객)로 동작한다 */
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: globalThis.localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => (s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
}
