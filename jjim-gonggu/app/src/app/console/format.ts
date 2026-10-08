// 금액 · 비율 · 한국 시간 표시와 공구 상태 칩. 공구 관리 화면들이 같이 쓴다.

import type { State } from "./types";

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toFixed(1)}%`);
export const kst = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "–";
export const CHIP: Record<State, [string, string]> = { open: ["진행 중", "open"], reached: ["달성 · 결제 기간", "ok"], failed: ["진행 안 됨", "bad"], settled: ["확정 완료", "ok"] };
