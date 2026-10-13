// 금액 · 비율 · 한국 시간 표시와 공구 상태 칩. 공구 관리 화면들이 같이 쓴다.

import type { State } from "./types";
import { fmtKst } from "@/lib/time";

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toFixed(1)}%`);
/** 날짜·시간은 모든 화면·문자가 같은 모양 "10/17(토) 14:00"을 쓴다 (#12). 규칙은 lib/time.ts의 fmtKst 한 곳 */
export const kst = (iso: string | null | undefined) => fmtKst(iso);
/** 공구 상태 이름표 (#10): 홈 · 내 공구 · 상세 · 리포트가 모두 이것 하나를 쓴다. 이름이나 색을 바꾸려면 여기만 고친다.
 *  open은 홈 숫자 제목("모집 중인 공구")과 리포트 본문("모집 중이에요")에 맞춰 "모집 중". 고객 위젯은 단독 스크립트라 이름표를 따로 둔다(widget.js). */
export const CHIP: Record<State, [string, string]> = { open: ["모집 중", "open"], reached: ["달성 · 결제 기간", "warn"], failed: ["진행 안 됨", "bad"], settled: ["확정 완료", "ok"] };
/** 미달 뒤 판매자가 그래도 진행한 공구(#24)는 결제 기간 동안 이 이름표. 색은 '달성 · 결제 기간'과 같은 주황 */
export const chip = (state: State, proceeded = false): [string, string] => (proceeded && state === "reached" ? ["그래도 진행 · 결제 기간", "warn"] : CHIP[state]);
