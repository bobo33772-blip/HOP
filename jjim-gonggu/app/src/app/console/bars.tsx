"use client";

// 매출 막대그래프 (#99): 셀러박스 '기간별' 그래프처럼 막대 위에 금액, 아래에 기간 이름.
// 시안 3: 옅은 그라디언트 유리판 위에 반투명 라벤더 막대(폭 48px, 일별 · 주별 · 월별 같게), 고른 칸만 반투명 분홍.
// 막대(칸 전체)를 누르면 그 칸을 고른다. 공구 매출의 '매출 추이'와 모니터링 › 판매 통계의 '기간별'이 같이 써서 모양이 늘 같다.

import { useEffect, useRef } from "react";
import { won } from "./format";

export type Bar = { key: string; name: string; value: number };

/** 막대 위 짧은 금액: 1만원 이상은 만원 단위(반올림), 그 아래는 원 */
export const shortWon = (n: number) => (n >= 10_000 ? `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원` : won(n));

const GRAY = "color-mix(in srgb, var(--lav) 30%, transparent)";
const PICK = "color-mix(in srgb, var(--brand) 75%, transparent)";
/** 그래프 뒤 판: 보라 → 분홍 → 주황이 아주 옅게 비치는 유리 */
const PANEL = "linear-gradient(135deg, rgba(185, 166, 255, .14), rgba(243, 166, 208, .10) 55%, rgba(255, 159, 128, .08))";
/** 막대 폭: 일별 · 주별 · 월별 모두 같게 (#121). 칸이 많으면 옆으로 밀어 본다 */
const BAR = 48;
const TEXT = 22; // 막대 위 금액 한 줄 높이(px). 가장 긴 막대도 이만큼 아래에서 멈춘다

/** 칸이 많으면(일별 등) 글자가 겹치지 않게 금액은 고른 칸만, 이름은 몇 칸 걸러 보여 준다 */
const MANY = 8;

/** 세로 눈금 간격: 1 · 2 · 2.5 · 5 × 10^n 중 최댓값을 4칸에 담는 것 */
const tick = (top: number) => { if (top <= 0) return 1; const raw = top / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw)!; };
const axisName = (v: number) => (v >= 10_000 ? `${Math.round(v / 10_000).toLocaleString("ko-KR")}만` : v.toLocaleString("ko-KR"));

/** axis: 매출 리포트 (시안 3 W-Report). 왼쪽 세로 눈금 · 막대 위 금액 없음 · 판 배경 없음(바깥 판이 그린다) */
export function Bars({ bars, picked, onPick, label, height = 150, axis = false }: {
  bars: Bar[]; picked: string; onPick: (key: string) => void; label: string; height?: number; axis?: boolean;
}) {
  const top = Math.max(1, ...bars.map((b) => b.value));
  const step = axis ? tick(top) : 0;
  const max = axis ? step * 4 : top;
  const text = axis ? 0 : TEXT;
  const many = bars.length > MANY;
  const every = many ? Math.ceil(bars.length / 6) : 1;
  const box = useRef<HTMLDivElement>(null);
  // 칸이 넘쳐 옆으로 밀어 보는 그래프(일별)는 처음에 오른쪽 끝(최근 칸)이 보이게 민다
  useEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth; }, [bars.length]);
  return (
    <div style={axis ? { display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)" } : undefined}>
    {axis && (
      <div aria-hidden="true" style={{ height, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end", paddingRight: 10, marginTop: -7, fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
        {[4, 3, 2, 1, 0].map((i) => <span key={i} style={{ lineHeight: "14px" }}>{axisName(step * i)}</span>)}
      </div>
    )}
    <div ref={box} role="group" aria-label={label} style={axis
      ? { display: "flex", overflowX: "auto", backgroundImage: `linear-gradient(color-mix(in srgb, var(--fg) 6%, transparent) 1px, transparent 1px)`, backgroundSize: `100% ${height / 4}px`, backgroundRepeat: "repeat-y", backgroundPosition: "0 0" }
      : { display: "flex", overflowX: "auto", padding: "12px 8px 6px", borderRadius: "var(--r-sm)", background: PANEL, border: "1px solid color-mix(in srgb, var(--lav) 20%, transparent)" }}>
      {bars.map((b, i) => {
        const on = b.key === picked;
        const named = !many || i % every === 0 || i === bars.length - 1;
        return (
          <button key={b.key} type="button" aria-pressed={on} aria-label={`${b.name} 매출 ${won(b.value)}`} onClick={() => onPick(b.key)}
            style={{ flex: `1 0 ${BAR + 16}px`, minWidth: 0, display: "grid", gridTemplateRows: `${height}px auto`, padding: 0, border: 0, background: "none", color: "var(--fg2)" }}>
            <span style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", borderBottom: "1px solid color-mix(in srgb, var(--fg) 8%, transparent)" }}>
              {!axis && b.value > 0 && (!many || on) && (
                <span style={{ height: TEXT, lineHeight: `${TEXT}px`, fontSize: 12.5, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{shortWon(b.value)}</span>
              )}
              <span style={{
                display: "block", width: BAR, minWidth: 4, height: `calc((100% - ${text}px) * ${b.value / max})`, minHeight: b.value > 0 ? 4 : 0,
                borderRadius: "8px 8px 2px 2px", background: on ? PICK : GRAY,
              }} />
            </span>
            <span style={{ fontSize: 13, paddingTop: 8, whiteSpace: "nowrap", visibility: named ? "visible" : "hidden" }}>{b.name}</span>
          </button>
        );
      })}
    </div>
    </div>
  );
}
