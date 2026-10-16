"use client";

// 모니터링 › 기간별 (#92): 고른 달의 확정 매출을 크게, "지난달 같은 기간보다 ▲ ○원", 최근 6개월 막대(막대 위에 만원 단위),
// 그 아래 상품별 · 유입별 비중 막대와 목록. 막대를 누르면 그 달로 바뀐다. 숫자 기준은 공구 매출과 같다(lib/engine/sales.ts).

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { SalesPeriods, SalesSource } from "./types";
import { won } from "./format";

/** 막대 위 짧은 금액: 1만원 이상은 만원 단위(반올림), 그 아래는 원 */
const short = (n: number) => (n >= 10_000 ? `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원` : won(n));
const SOURCE: Record<SalesSource, string> = { cart: "장바구니 고객", alert: "재입고 알림 고객", direct: "직접 신청" };
// 비중 막대 색: 분홍(포인트) 다음 보조색. 칸은 연하게, 목록의 점은 진하게
const COLORS = ["var(--brand)", "var(--blue)", "var(--amber)", "var(--violet)", "var(--green)"];
const tint = (c: string) => `color-mix(in srgb, ${c} 32%, var(--surface))`;
const MAX_ROWS = 5; // 상품이 많으면 5개 뒤는 '그 밖'으로 묶는다

export function PeriodPanel({ say }: { say: (t: string) => void }) {
  const a = useConsole();
  const [month, setMonth] = useState<string | null>(null);
  const [by, setBy] = useState<"product" | "source">("product");
  const [p, setP] = useState<SalesPeriods | null>(null);
  const load = useCallback(() => a.call<SalesPeriods>("GET", `${a.mallBase}/sales/periods${month ? `?month=${month}` : ""}`).then(setP).catch((e) => say((e as Error).message)), [a, month, say]);
  useEffect(() => { load(); }, [load]);
  if (!p) return <p className="muted">불러오는 중…</p>;

  const max = Math.max(1, ...p.months.map((m) => m.revenue));
  const d = p.compare.diff;
  const rows = by === "product"
    ? p.byProduct.map((x) => ({ key: String(x.productNo), name: x.name, revenue: x.revenue, qty: x.qty }))
    : p.bySource.map((x) => ({ key: x.source, name: SOURCE[x.source], revenue: x.revenue, qty: x.qty }));
  const shown = rows.length > MAX_ROWS
    ? [...rows.slice(0, MAX_ROWS - 1), rows.slice(MAX_ROWS - 1).reduce((acc, r) => ({ ...acc, revenue: acc.revenue + r.revenue, qty: acc.qty + r.qty }), { key: "etc", name: "그 밖", revenue: 0, qty: 0 })]
    : rows;
  const total = Math.max(1, p.revenue);

  return (
    <>
      <section className="card" aria-labelledby="period-title">
        <div style={{ display: "grid", gap: 2 }}>
          <span id="period-title" className="small">{p.label}{p.isCurrent ? " · 오늘까지" : ""} 확정 매출</span>
          <strong style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{won(p.revenue)}</strong>
          {/* 올랐으면 분홍 ▲, 내렸으면 파랑 ▼ (증권 앱처럼) */}
          <span style={{ fontSize: 14, fontWeight: 600, color: d > 0 ? "var(--brand-ink)" : d < 0 ? "var(--blue-ink, var(--fg2))" : "var(--fg2)" }}>
            {p.compare.label}보다 {d === 0 ? "같아요" : `${d > 0 ? "▲" : "▼"} ${won(Math.abs(d))}`}
          </span>
        </div>

        {/* 최근 6개월. 막대 위에 금액, 아래에 달. 누르면 그 달을 본다 */}
        <div role="group" aria-label="월별 확정 매출. 막대를 누르면 그 달을 봐요" style={{ display: "flex", gap: 8, alignItems: "stretch", height: 200, marginTop: 6 }}>
          {p.months.map((m) => {
            const on = m.key === p.month;
            return (
              <button key={m.key} type="button" aria-pressed={on} aria-label={`${m.label} ${won(m.revenue)}`} onClick={() => setMonth(m.key)}
                style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 6, padding: 0, border: 0, background: "none", color: "var(--fg)" }}>
                <span className="small" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: on ? "var(--fg)" : "var(--fg2)", fontWeight: on ? 700 : 500 }}>{short(m.revenue)}</span>
                <span style={{ display: "flex", alignItems: "flex-end" }}>
                  <span style={{
                    display: "block", width: "100%", height: `${(m.revenue / max) * 100}%`, minHeight: 4, borderRadius: "10px 10px 4px 4px",
                    background: on ? tint("var(--brand)") : "var(--soft)", boxShadow: on ? "inset 0 0 0 1.5px var(--brand)" : undefined,
                  }} />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: on ? 800 : 600, color: on ? "var(--fg)" : "var(--fg2)" }}>{m.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card" aria-label={`${p.label} ${by === "product" ? "상품별" : "유입별"} 매출`}>
        <div className="seg" role="radiogroup" aria-label="나눠 보기" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {([["product", "상품별"], ["source", "유입별"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => setBy(k)}>{l}</button>
          ))}
        </div>
        {!shown.length ? <p className="muted">{p.label}에는 확정 매출이 없어요.</p> : (
          <>
            {/* 비중 막대: 칸 너비 = 매출 비중 */}
            <div aria-hidden="true" style={{ display: "flex", height: 34, borderRadius: 12, overflow: "hidden", background: "var(--soft)" }}>
              {shown.map((r, i) => <span key={r.key} style={{ width: `${(r.revenue / total) * 100}%`, background: tint(COLORS[i % COLORS.length]) }} />)}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
              {shown.map((r, i) => (
                <li key={r.key} className="row" style={{ gap: 10, alignItems: "baseline" }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                    <i aria-hidden="true" style={{ flex: "none", width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], transform: "translateY(1px)" }} />
                    <span style={{ wordBreak: "keep-all" }}>{r.name}</span>
                  </span>
                  <span className="mono" style={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                    {won(r.revenue)} <span className="small">({((r.revenue / total) * 100).toFixed(1)}% · {r.qty}개)</span>
                  </span>
                </li>
              ))}
            </ul>
            {by === "source" && (
              <p className="small">장바구니 · 재입고 알림 고객은 그 이유로 공구 초대 문자를 받은 고객이에요. 직접 신청은 초대 없이 상품 페이지 위젯에서 신청한 고객이에요.</p>
            )}
          </>
        )}
      </section>
    </>
  );
}
