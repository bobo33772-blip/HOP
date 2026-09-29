import type { ReactNode } from 'react';

import { RemoteProvider } from './remote';
import { LocalProvider } from './store';
import { supabase } from './supabase';

/** Supabase 설정(.env)이 있으면 서버 모드, 없으면 로컬 모드 */
export function StoreProvider({ children }: { children: ReactNode }) {
  return supabase ? <RemoteProvider>{children}</RemoteProvider> : <LocalProvider>{children}</LocalProvider>;
}
