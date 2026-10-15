"use client";

// 공구 매출 (#79): 합계 · 매출 추이(일 · 주 · 월) · 공구별 표 · 엑셀(CSV) 내려받기. 운영자 화면과 판매자 화면이 같이 쓴다.
// 숫자 기준은 리포트의 확정 매출과 같다(lib/engine/sales.ts). 기능만 먼저 둔 기본 모양이고, 위치 · 모양은 디자인 작업에서 정한다.
// compact: 홈에서 짧게 (#92). 합계 · 추이 그래프만 두고, 공구별 표 · 엑셀은 '자세히'로 내 공구 화면에 보낸다.

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Sales, SalesBy } from "./types";
import { chip, kst, won } from "./format";
import { useNarrow } from "./radar-picker";

const BY: [SalesBy, string][] = [["day", "일별"], ["week", "주별"], ["month", "월별"]];
const nowrap = { whiteSpace: "nowrap" } as const; // 숫자 칸은 한 줄 (#35)

export function SalesPanel({ say, compact = false }: { say: (t: string) => void; compact?: boolean }) {
  const a = useConsole();
  const narrow = useNarrow();
  const [by, setBy] = useState<SalesBy>("week");
  const [s, setS] = useState<Sales | null>(null);
  const load = useCallback(() => a.call<Sales>("GET", `${a.mallBase}/sales?by=${by}`).then(setS).catch((e) => say((e as Error).message)), [a, by, say]);
  useEffect(() => { load(); }, [load]);
  if (!s) return null;

  const t = s.totals, pts = s.trend.points;
  const file = (kind: "campaigns" | "daily") => `${a.mallBase}/sales?format=csv&kind=${kind}`;
  const max = Math.max(1, ...pts.map((p) => p.revenue));
  return (
    <section className="card" aria-labelledby="sales-title">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <h2 id="sales-title" style={{ fontSize: 18, margin: 0 }}>공구 매출</h2>
        {compact ? <a className="ghost" href="/campaigns">자세히 · 엑셀 ›</a> : s.campaigns.length > 0 && (
          <span className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* 엑셀에서 바로 열리는 CSV. 날짜별은 엑셀 피벗으로 원하는 단위의 추이를 볼 수 있다 */}
            <a className="ghost" href={file("campaigns")} download>엑셀 내려받기 · 공구별</a>
            <a className="ghost" href={file("daily")} download>엑셀 내려받기 · 날짜별</a>
          </span>
        )}
      </div>
      {!s.campaigns.length ? <p className="muted">결제 기간이 시작된 공구가 생기면 여기에 확정 매출이 쌓여요.</p> : (
        <>
          {/* 금액은 자릿수가 길어 칸을 넓게 잡는다 (휴대폰에서 "5,505,000원"이 잘리지 않게. 공용 .kpi.many는 100px) */}
          <div className="kpi many" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div><small>확정 매출</small><strong>{won(t.revenue)}</strong></div>
            {!compact && <div><small>확정 수량</small><strong>{t.qty}개</strong></div>}
            <div><small>이번 달 매출</small><strong>{won(t.thisMonth)}</strong></div>
            <div><small>지난달 매출</small><strong>{won(t.lastMonth)}</strong></div>
          </div>
          {!compact && (
            <p className="small">
              결제 기간 안에 공구 쿠폰으로 결제된 금액이에요. 취소 · 반품은 빼고, 결제 기간 중인 공구는 숫자가 더 늘 수 있어요.
            </p>
          )}

          <div className="row" style={{ flexWrap: "wrap" }}>
            <b style={{ fontSize: 15 }}>매출 추이</b>
            <div className="seg" role="radiogroup" aria-label="추이 단위">
              {BY.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => setBy(k)}>{l}</button>)}
            </div>
          </div>
          {!pts.length ? <p className="muted">아직 결제된 주문이 없어요.</p> : (
            <>
              <div role="img" aria-label={`${BY.find(([k]) => k === by)![1]} 매출 막대그래프, ${pts[0].label}부터 ${pts[pts.length - 1].label}까지. 아래 '추이를 표로 보기'에 같은 숫자가 있어요.`}
                style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, overflowX: "auto" }}>
                {pts.map((p) => (
                  <span key={p.key} title={`${p.label} · ${won(p.revenue)} · ${p.qty}개`}
                    style={{ flex: "1 0 8px", height: `${(p.revenue / max) * 100}%`, minHeight: p.revenue > 0 ? 3 : 1, background: p.revenue > 0 ? "var(--brand)" : "var(--line)", borderRadius: "4px 4px 0 0" }} />
                ))}
              </div>
              <div className="row small"><span>{pts[0].label}</span><span>{pts[pts.length - 1].label}</span></div>
              {s.trend.truncated && <p className="small">최근 {pts.length}칸만 보여요. 전체는 엑셀 날짜별로 받아 보세요.</p>}
              <details>
                <summary>추이를 표로 보기</summary>
                <div className="tw"><table>
                  <thead><tr><th>기간</th><th>결제 주문</th><th>확정 수량</th><th>확정 매출</th></tr></thead>
                  <tbody>{[...pts].reverse().map((p) => (
                    <tr key={p.key}><td style={nowrap}>{p.label}</td><td className="mono" style={nowrap}>{p.orders}건</td><td className="mono" style={nowrap}>{p.qty}개</td><td className="mono" style={nowrap}>{won(p.revenue)}</td></tr>
                  ))}</tbody>
                </table></div>
              </details>
            </>
          )}

          {!compact && <b style={{ fontSize: 15 }}>공구별</b>}
          {compact ? null : narrow ? (
            // 휴대폰: 열이 많은 표는 카드보다 넓어진다 → 목록으로 (#36)
            <ul className="list" style={{ wordBreak: "keep-all" }}>{s.campaigns.map((r) => {
              const [label, cls] = chip(r.state, r.proceeded);
              return (
                <li key={r.id}><div className="item">
                  <span className="meta">
                    <b style={{ whiteSpace: "normal" }}>{r.productName}</b>
                    <small>{r.qty}개 · 매출 {won(r.revenue)}</small>
                    <small>결제 마감 {kst(r.payUntil)}{r.cancelledOrders + r.lateOrders > 0 && ` · 취소 ${r.cancelledOrders}건 · 기한 뒤 결제 ${r.lateOrders}건`}</small>
                  </span>
                  <span className={`chip ${cls}`} style={{ flex: "none" }}>{label}</span>
                </div></li>
              );
            })}</ul>
          ) : (
            <div className="tw"><table style={{ wordBreak: "keep-all" }}>
              <thead><tr><th>상품</th><th>상태</th><th>결제 마감</th><th>확정 수량</th><th>확정 매출</th><th>취소 · 기한 뒤 결제</th></tr></thead>
              <tbody>{s.campaigns.map((r) => {
                const [label, cls] = chip(r.state, r.proceeded);
                return (
                  <tr key={r.id}>
                    <td>{r.productName}</td><td><span className={`chip ${cls}`}>{label}</span></td><td>{kst(r.payUntil)}</td>
                    <td className="mono" style={nowrap}>{r.qty}개</td><td className="mono" style={nowrap}>{won(r.revenue)}</td>
                    <td className="mono" style={nowrap}>{r.cancelledOrders}건 · {r.lateOrders}건</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </>
      )}
    </section>
  );
}
