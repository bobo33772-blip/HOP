"use client";

// 공구 매출 (#79): 운영자 화면과 판매자 화면이 같이 쓴다. 숫자 기준은 리포트의 확정 매출과 같다(lib/engine/sales.ts).
// 판매자가 궁금한 순서로 보여 준다 (#92): 이번 달 얼마 벌었나(지난달보다) → 결제 기다리는 돈 · 마감 → 모집 중 공구가 다 되면 →
// 언제 많이 팔렸나(막대를 눌러 그 기간 숫자) → 공구마다 목표를 얼마나 채웠고 쿠폰 받은 사람 중 몇 명이 냈나. 엑셀(CSV)로도 내려받는다.
// 판매자는 모니터링 › 리포트, 운영자는 공구 목록 위. compact: 홈에서 짧게(숫자 칸 · 그래프), 공구별 표 · 엑셀은 '자세히'로 모니터링에 보낸다.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useConsole } from "./provider";
import type { Sales, SalesBy, SalesRow } from "./types";
import { chip, kst, won } from "./format";
import { useNarrow } from "./radar-picker";
import { Bars } from "./bars";

const BY: [SalesBy, string][] = [["day", "일별"], ["week", "주별"], ["month", "월별"]];
const nowrap = { whiteSpace: "nowrap" } as const; // 숫자 칸은 한 줄 (#35)
/** 막대 아래 짧은 이름: 월별은 "10월", 주별 · 일별은 시작일 "10/12" */
const barName = (key: string, by: SalesBy) => (by === "month" ? `${Number(key.slice(5, 7))}월` : `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`);

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

export type CsvKind = "campaigns" | "daily";
const EXCEL: [CsvKind, string][] = [["daily", "날짜별"], ["campaigns", "공구별"]];

/** '엑셀 내려받기' 버튼 하나를 누르면 아래에 날짜별 · 공구별 목록이 뜬다. 하나를 고르거나 바깥 · Esc를 누르면 닫힌다 */
export function ExcelMenu({ file }: { file: (kind: CsvKind) => string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => { setOpen(false); btn.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    // Tab으로 목록 밖에 나가면 닫는다. 누른 곳에 포커스가 안 가는 브라우저(사파리)는 relatedTarget이 비어 있어 그대로 둔다
    <div ref={box} style={{ position: "relative" }} onBlur={(e) => { const to = e.relatedTarget as Node | null; if (to && !box.current?.contains(to)) setOpen(false); }}>
      <button ref={btn} type="button" className="ghost" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        엑셀 내려받기 <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={id} style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 4, minWidth: "max(100%, 160px)", display: "grid", gap: 2, padding: 6,
          background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-pop)",
        }}>
          {/* 다운로드가 시작된 뒤에 닫는다(누르는 순간 링크가 사라지지 않게). 위 고정 메뉴바(z-index 5) 밑으로 지나가게 4 */}
          {EXCEL.map(([kind, name]) => (
            <a key={kind} className="ghost" href={file(kind)} download aria-label={`${name} 엑셀 내려받기`} onClick={() => setTimeout(close)} style={{ border: 0, justifyContent: "flex-start" }}>{name}</a>
          ))}
        </div>
      )}
    </div>
  );
}

export function SalesPanel({ say, compact = false, excel = true, report = false }: { say: (t: string) => void; compact?: boolean; excel?: boolean; report?: boolean }) {
  const a = useConsole();
  const narrow = useNarrow();
  const [by, setBy] = useState<SalesBy>("week");
  const [pick, setPick] = useState<string | null>(null);
  const [s, setS] = useState<Sales | null>(null);
  const load = useCallback(() => a.call<Sales>("GET", `${a.mallBase}/sales?by=${by}`).then(setS).catch((e) => say((e as Error).message)), [a, by, say]);
  useEffect(() => { load(); }, [load]);
  if (!s) return null;

  const t = s.totals, w = s.waiting, rc = s.recruiting, pts = s.trend.points;
  const file = (kind: CsvKind) => `${a.mallBase}/sales?format=csv&kind=${kind}`;
  // 고른 막대. 처음에는 가장 최근에 매출이 있었던 칸
  const cur = pts.find((p) => p.key === pick) ?? [...pts].reverse().find((p) => p.revenue > 0) ?? pts[pts.length - 1];
  const sold = s.campaigns.length > 0;
  const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
  // 매출 추이 (리포트): 그라디언트 판 안에 제목 · 단위 고르기, 세로 눈금 그래프, 아래에 고른 기간 한 줄
  const trend = (
    <section className="rp-chart" aria-labelledby="rp-chart-t">
      <div className="row"><h2 id="rp-chart-t">매출 추이</h2>
        <div className="seg" role="radiogroup" aria-label="추이 단위">
          {BY.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => { setBy(k); setPick(null); }}>{l}</button>)}
        </div>
      </div>
      {!pts.length ? <p className="muted">아직 결제된 주문이 없어요.</p> : (
        <>
          <Bars axis height={260} label={`${BY.find(([k]) => k === by)![1]} 매출 막대. 막대를 누르면 그 기간 숫자가 아래에 보여요`}
            bars={pts.map((p) => ({ key: p.key, name: barName(p.key, by), value: p.revenue }))} picked={cur.key} onPick={setPick} />
          <p aria-live="polite" className="pick"><b>{cur.label}</b> · <b className="mono">{won(cur.revenue)}</b> <span>결제 {cur.orders}건 · {cur.qty}개</span></p>
          {s.trend.truncated && <p className="small">최근 {pts.length}칸만 보여요. 전체는 엑셀 날짜별로 받아 보세요.</p>}
        </>
      )}
    </section>
  );
  // 공구별 표 (시안 3): 상태는 점 + 이름, 숫자는 고정폭. 휴대폰은 목록
  const DOT: Record<string, string> = { open: "var(--brand)", reached: "var(--warning)", settled: "var(--lav)", failed: "var(--muted)", cancelled: "var(--muted)" };
  const table = sold && (
    <section className="rp-table" aria-labelledby="rp-t">
      <h2 id="rp-t">공구별 <span>· 생산을 정할 때 보는 숫자예요</span></h2>
      {narrow ? (
        <ul>{s.campaigns.map((r) => (
          <li key={r.id}>
            <span className="top"><b>{r.productName}</b><span className="st"><i style={{ background: DOT[r.state] }} />{chip(r.state, r.proceeded)[0].replace("달성 · ", "")}</span></span>
            <small>{goal(r)} · 매출 {num(r.revenue)}원</small>
            <small>{payLine(r)} · {dueLine(r)}{extra(r)}</small>
          </li>
        ))}</ul>
      ) : (
        <table>
          <thead><tr><th>상품</th><th>상태</th><th>목표 대비 확정</th><th>결제 (쿠폰 받은 사람 중)</th><th className="n">확정 매출</th><th className="n">마감</th></tr></thead>
          <tbody>{s.campaigns.map((r) => (
            <tr key={r.id}>
              <td><b>{r.productName}</b></td>
              <td><span className="st"><i style={{ background: DOT[r.state] }} />{chip(r.state, r.proceeded)[0].replace("달성 · ", "")}</span></td>
              <td className="mono">{goal(r)}</td>
              <td className="mono">{r.couponMembers ? `${r.paidMembers} / ${r.couponMembers}명` : "–"}{r.waitingMembers ? ` · 대기 ${r.waitingMembers}명` : ""}{r.cancelledOrders ? ` · 취소 ${r.cancelledOrders}건` : ""}{r.lateOrders ? ` · 기한 뒤 ${r.lateOrders}건` : ""}</td>
              <td className="n mono"><b>{num(r.revenue)}</b></td>
              <td className="n due">{r.state === "settled" ? `확정 ${kst(r.settledAt)}` : r.state === "reached" ? `결제 마감 ${kst(r.payUntil)}` : r.state === "open" ? `마감 ${kst(r.deadlineAt)}` : `${kst(r.deadlineAt).split(" ")[0]} 종료`}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="foot">확정 매출은 결제 기간 안에 공구 쿠폰으로 결제된 금액이에요(취소 · 반품은 빼요). 결제 기다리는 금액은 쿠폰을 받고 아직 결제하지 않은 신청이 모두 결제했을 때의 금액이에요.</p>
    </section>
  );

  // 판매자 매출 리포트 (시안 3 W-Report): 숫자 카드 4개 → 매출 추이 판 → 공구별 표
  if (report) {
    const up = t.lastMonth > 0 && t.thisMonth >= t.lastMonth;
    const vs = !t.lastMonth ? vsLastMonth(t.thisMonth, t.lastMonth) : `${up ? "▲" : "▼"} ${Math.abs(Math.round(((t.thisMonth - t.lastMonth) / t.lastMonth) * 100))}% 지난달 대비`;
    if (!sold && !rc.campaigns) return <p className="muted">공구를 열고 결제가 시작되면 여기에 매출이 쌓여요.</p>;
    return (
      <>
        <section className="rp-kpis" aria-label="매출 숫자">
          <div><small>이번 달 확정 매출</small><strong>{num(t.thisMonth)}</strong><span className={up ? "up" : undefined}>{vs}</span></div>
          <div><small>결제 기다리는 금액</small><strong>{num(w.amount)}</strong><span>{w.members ? `${w.members}명${w.payUntil ? ` · ${kst(w.payUntil)} 마감` : ""}` : "결제 기다리는 고객이 없어요"}</span></div>
          <div><small>모집 중 신청 금액</small><strong>{num(rc.amount)}</strong><span>공구 {rc.campaigns}건 · {rc.qty}개</span></div>
          <div className="hl"><small>누적 확정 매출</small><strong>{num(t.revenue)}</strong><span>공구 {t.campaigns}건 · {t.qty}개</span></div>
        </section>
        {sold && trend}
        {table}
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="sales-title">
      {/* 홈(compact)에서는 '내 공구'처럼 구역 제목 줄(section-head)로: '자세히 보기 ›'가 '전체 보기 ›'와 같은 글자 링크 */}
      <div className={compact ? "section-head" : "row"} style={{ flexWrap: "wrap" }}>
        <h2 id="sales-title" style={{ fontSize: 18, margin: 0 }}>공구 매출</h2>
        {compact ? <a href="/radar">자세히 보기 ›</a> : sold && excel && (
          <span className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* 엑셀에서 바로 열리는 CSV. 날짜별은 엑셀 피벗으로 원하는 단위의 추이를 볼 수 있다 */}
            <ExcelMenu file={file} />
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
                  {/* 막대를 누르면 그 기간 숫자가 아래에 보인다 (휴대폰은 마우스를 올릴 수 없어서). 모양은 기간별과 같은 부품 (#99) */}
                  <Bars label={`${BY.find(([k]) => k === by)![1]} 매출 막대. 막대를 누르면 그 기간 숫자가 아래에 보여요`}
                    bars={pts.map((p) => ({ key: p.key, name: barName(p.key, by), value: p.revenue }))} picked={cur.key} onPick={setPick} />
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
