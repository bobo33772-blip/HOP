"use client";

// 공구 관리 화면 공용 틀. 운영자 화면(/admin)과 판매자 화면(/campaigns)이 같은 화면 부품을 쓰고, 부르는 주소만 다르다.
// 화면 부품: radar-picker(상품 고르기) · campaign-form(조건 · 미리보기 · 열기) · campaign-list · campaign-detail · profile-card · score-tab

import { createContext, useCallback, useContext, useState } from "react";

export interface ConsoleApi {
  role: "admin" | "seller";
  mallBase: string; // 몰 단위 주소: 운영자 /api/admin/malls/<몰>, 판매자 /api/seller
  campaignBase: string; // 공구 단위 주소: 운영자 /api/admin/campaigns, 판매자 /api/seller/campaigns
  now: string; // 엔진 시계
  loginUrl: string; // 세션이 끊기면 보낼 곳
}

type Console = ConsoleApi & { call<T>(method: string, path: string, body?: unknown): Promise<T> };
const Ctx = createContext<Console | null>(null);

export function ConsoleProvider({ api, children }: { api: ConsoleApi; children: React.ReactNode }) {
  const [value] = useState<Console>(() => ({
    ...api,
    async call<T>(method: string, path: string, body?: unknown): Promise<T> {
      const r = await fetch(path, { method, cache: "no-store", headers: { "Content-Type": "application/json", "X-JJG": "1" }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (r.status === 401) { location.href = api.loginUrl; throw new Error("로그인이 필요해요"); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string }).message ?? "요청에 실패했어요");
      return j as T;
    },
  }));
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsole(): Console {
  const c = useContext(Ctx);
  if (!c) throw new Error("ConsoleProvider가 필요해요");
  return c;
}

/** 화면 아래 잠깐 뜨는 안내 */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 2600); }, []);
  return { say, node: toast ? <div className="toast" role="status">{toast}</div> : null };
}
