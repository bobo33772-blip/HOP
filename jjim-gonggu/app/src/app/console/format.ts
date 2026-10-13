// 금액 · 비율 · 한국 시간 표시와 공구 상태 칩. 공구 관리 화면들이 같이 쓴다.

import type { State } from "./types";
import { fmtKst } from "@/lib/time";

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toFixed(1)}%`);
/** 날짜·시간은 모든 화면·문자가 같은 모양 "10/17(토) 14:00"을 쓴다 (#12). 규칙은 lib/time.ts의 fmtKst 한 곳 */
export const kst = (iso: string | null | undefined) => fmtKst(iso);
export const CHIP: Record<State, [string, string]> = { open: ["진행 중", "open"], reached: ["달성 · 결제 기간", "ok"], failed: ["진행 안 됨", "bad"], settled: ["확정 완료", "ok"] };
