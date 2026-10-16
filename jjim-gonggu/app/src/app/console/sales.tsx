"use client";

// 공구 매출 (#79): 운영자 화면과 판매자 화면이 같이 쓴다. 숫자 기준은 리포트의 확정 매출과 같다(lib/engine/sales.ts).
// 판매자가 궁금한 순서로 보여 준다 (#92): 이번 달 얼마 벌었나(지난달보다) → 결제 기다리는 돈 · 마감 → 모집 중 공구가 다 되면 →
// 언제 많이 팔렸나(막대를 눌러 그 기간 숫자) → 공구마다 목표를 얼마나 채웠고 쿠폰 받은 사람 중 몇 명이 냈나. 엑셀(CSV)로도 내려받는다.
// 판매자는 모니터링 › 리포트, 운영자는 공구 목록 위. compact: 홈에서 짧게(숫자 칸 · 그래프), 공구별 표 · 엑셀은 '자세히'로 모니터링에 보낸다.

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Sales, SalesBy, SalesRow } from "./types";
import { chip, kst, won } from "./format";
import { useNarrow } from "./radar-picker";

const BY: [SalesBy, string][] = [["day", "일별"], ["week", "주별"], ["month", "월별"]];
const nowrap = { whiteSpace: "nowrap" } as const; // 숫자 칸은 한 줄 (#35)

/** 지난달 대비. 지난달이 0원이면 비율 대신 말로 */
function vsLastMonth(now: number, last: number): string {
  if (!last) return now ? "지난달은 매출이 없었어요" : "아직 이번 달 매출이 없어요";
  const r = Math.round(((now - last) / last) * 100);
  return r === 0 ? "지난달과 같아요" : `지난달보다 ${r > 0 ? "▲" : "▼"} ${Math.abs(r)}%`;
}

const goal = (r: SalesRow) => `${r.qty} / ${r.targetQty}개 (${Math.round((r.qty / r.targetQty) * 100)}%)`;
const payLine = (r: SalesRow) => `결제 ${r.paidMembers} / ${r.couponMembers}명${r.waitingMembers ? ` · 대기 ${r.waitingMembers}명` : ""}`;
const dueLine = (r: SalesRow) => (r.state === "settled" ? `확정 ${kst(r.settledAt)}` : `결제 마감 ${kst(r.payUntil)}`);
const extra = (r: SalesRow) => (r.cancelledOrders + r.lateOrders ? ` · 취소 ${r.cancelledOrders}건 · 기한 뒤 결제 ${r.lateOrders}건` : "");

export function SalesPanel({ say, compact = false }: { say: (t: string) => void; compact?: boolean }) {
  const a = useConsole();
  const narrow = useNarrow();
  const [by, setBy] = useState<SalesBy>("week");
  const [pick, setPick] = useState<string | null>(null);
  const [s, setS] = useState<Sales | null>(null);
  const load = useCallback(() => a.call<Sales>("GET", `${a.mallBase}/sales?by=${by}`).then(setS).catch((e) => say((e as Error).message)), [a, by, say]);
  useEffect(() => { load(); }, [load]);
  if (!s) return null;

  const t = s.totals, w = s.waiting, rc = s.recruiting, pts = s.trend.points;
  const file = (kind: "campaigns" | "daily") => `${a.mallBase}/sales?format=csv&kind=${kind}`;
  const max = Math.max(1, ...pts.map((p) => p.revenue));
  // 고른 막대. 처음에는 가장 최근에 매출이 있었던 칸
  const cur = pts.find((p) => p.key === pick) ?? [...pts].reverse().find((p) => p.revenue > 0) ?? pts[pts.length - 1];
  const sold = s.campaigns.length > 0;

  return (
    <section className="card" aria-labelledby="sales-title">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <h2 id="sales-title" style={{ fontSize: 18, margin: 0 }}>공구 매출</h2>
        {compact ? <a className="ghost" href="/radar">자세히 · 엑셀 ›</a> : sold && (
          <span className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* 엑셀에서 바로 열리는 CSV. 날짜별은 엑셀 피벗으로 원하는 단위의 추이를 볼 수 있다 */}
            <a className="ghost" href={file("campaigns")} download>엑셀 내려받기 · 공구별</a>
            <a className="ghost" href={file("daily")} download>엑셀 내려받기 · 날짜별</a>
          </span>
        )}
      </div>

      {!sold && !rc.campaigns ? <p className="muted">공구를 열고 결제가 시작되면 여기에 매출이 쌓여요.</p> : (
        <>
          {/* 금액은 자릿수가 길어 칸을 넓게 잡는다 (휴대폰에서 "5,505,000원"이 잘리지 않게. 공용 .kpi.many는 100px) */}
          <div className="kpi many" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div><small>이번 달 확정 매출</small><strong>{won(t.thisMonth)}</strong><span className="small">{vsLastMonth(t.thisMonth, t.lastMonth)}</span></div>
            {w.members > 0 && (
              <div><small>결제 기다리는 금액</small><strong>{won(w.amount)}</strong>
                <span className="small">{w.members}명{w.payUntil ? ` · ${kst(w.payUntil)} 마감` : ""}</span></div>
            )}
            {rc.campaigns > 0 && (
              <div><small>모집 중 신청 금액</small><strong>{won(rc.amount)}</strong>
                <span className="small">공구 {rc.campaigns}건 · {rc.qty}개{rc.reachedTarget ? ` · 목표 달성 ${rc.reachedTarget}건` : ""}</span></div>
            )}
            {!compact && <div><small>누적 확정 매출</small><strong>{won(t.revenue)}</strong><span className="small">공구 {t.campaigns}건 · {t.qty}개</span></div>}
          </div>
          {!compact && (
            <p className="small">
              확정 매출은 결제 기간 안에 공구 쿠폰으로 결제된 금액이에요(취소 · 반품은 빼요). 결제 기다리는 금액은 쿠폰을 받고 아직 결제하지 않은 신청이 모두 결제했을 때,
              모집 중 신청 금액은 목표를 채워 신청한 만큼 모두 결제했을 때의 금액이에요.
            </p>
          )}

          {sold && (
            <>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <b style={{ fontSize: 15 }}>매출 추이</b>
                <div className="seg" role="radiogroup" aria-label="추이 단위">
                  {BY.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => { setBy(k); setPick(null); }}>{l}</button>)}
                </div>
              </div>
              {!pts.length ? <p className="muted">아직 결제된 주문이 없어요.</p> : (
                <>
                  {/* 막대를 누르면 그 기간 숫자가 아래에 보인다 (휴대폰은 마우스를 올릴 수 없어서) */}
                  <div role="group" aria-label={`${BY.find(([k]) => k === by)![1]} 매출 막대. 막대를 누르면 그 기간 숫자가 아래에 보여요`}
                    style={{ display: "flex", alignItems: "stretch", gap: 3, height: 120, overflowX: "auto", borderBottom: "1px solid var(--line)" }}>
                    {pts.map((p) => {
                      const on = p.key === cur.key;
                      return (
                        <button key={p.key} type="button" aria-pressed={on} aria-label={`${p.label} 매출 ${won(p.revenue)}`} onClick={() => setPick(p.key)}
                          style={{ flex: "1 0 10px", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0, border: 0, background: "none", minWidth: 10 }}>
                          <span style={{
                            // 막대는 칸 가운데에 가늘게(칸의 45%, 최대 28px) 세우고 위쪽만 둥글게 해서 얄쌍하게 보이게 한다
                            display: "block", width: "min(28px, 45%)", minWidth: 4, height: `${(p.revenue / max) * 100}%`, minHeight: p.revenue > 0 ? 3 : 0, borderRadius: "999px 999px 2px 2px",
                            background: p.revenue <= 0 ? "var(--line)" : on ? "var(--brand)" : "color-mix(in srgb, var(--brand) 40%, transparent)",
                          }} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="row small"><span>{pts[0].label}</span><span>{pts[pts.length - 1].label}</span></div>
                  <p aria-live="polite" style={{ margin: 0 }}>
                    <b>{cur.label}</b> · <b>{won(cur.revenue)}</b> <span className="small">결제 {cur.orders}건 · {cur.qty}개</span>
                  </p>
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
            </>
          )}
          {!sold && <p className="small">결제가 시작되면 확정 매출과 추이 그래프가 여기에 쌓여요.</p>}

          {!compact && sold && <b style={{ fontSize: 15 }}>공구별</b>}
          {compact || !sold ? null : narrow ? (
            // 휴대폰: 열이 많은 표는 카드보다 넓어진다 → 목록으로 (#36)
            <ul className="list" style={{ wordBreak: "keep-all" }}>{s.campaigns.map((r) => {
              const [label, cls] = chip(r.state, r.proceeded);
              return (
                <li key={r.id}><div className="item">
                  <span className="meta">
                    <b style={{ whiteSpace: "normal" }}>{r.productName}</b>
                    <small>{goal(r)} · 매출 {won(r.revenue)}</small>
                    <small>{payLine(r)} · {dueLine(r)}{extra(r)}</small>
                  </span>
                  <span className={`chip ${cls}`} style={{ flex: "none" }}>{label}</span>
                </div></li>
              );
            })}</ul>
          ) : (
            <div className="tw"><table style={{ wordBreak: "keep-all" }}>
              <thead><tr><th>상품</th><th>상태</th><th>목표 대비 확정</th><th>결제 (쿠폰 받은 사람 중)</th><th>확정 매출</th><th>마감</th></tr></thead>
              <tbody>{s.campaigns.map((r) => {
                const [label, cls] = chip(r.state, r.proceeded);
                return (
                  <tr key={r.id}>
                    <td>{r.productName}</td><td><span className={`chip ${cls}`}>{label}</span></td>
                    <td className="mono" style={nowrap}>{goal(r)}</td>
                    <td className="mono" style={nowrap}>{r.paidMembers} / {r.couponMembers}명{r.waitingMembers ? <span className="small"> · 대기 {r.waitingMembers}명</span> : null}{extra(r) && <span className="small">{extra(r)}</span>}</td>
                    <td className="mono" style={nowrap}>{won(r.revenue)}</td>
                    <td style={nowrap}>{dueLine(r)}</td>
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
