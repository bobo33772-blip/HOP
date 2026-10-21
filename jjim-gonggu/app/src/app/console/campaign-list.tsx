"use client";

// 공구 목록 (시안 3). 넓은 화면은 웹 시안: 상태 필터 · 검색 + 표(상품 · 상태 · 신청 · 목표 · 달성률 · 공구가 · 마감), 고른 줄 아래에 상세.
// 휴대폰은 C 시안: 숫자 상태 탭 + 공구 카드, 카드를 누르면 목록 대신 상세가 열린다(‹ 공구 관리로 돌아감).
// 운영자 OP-4로 들어가는 목록 / 판매자 S-12 · S-E1(빈 상태).

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Camp, State } from "./types";
import { CHIP } from "./format";
import { fmtKst } from "@/lib/time";
import { CampaignDetail } from "./campaign-detail";

type Filter = "all" | State;
// 상태 점 색: 웹은 상태마다, 휴대폰은 진행 중(분홍)과 끝난 것(먹색 · 회색) 둘만
export const DOT: Record<State, string> = { open: "var(--brand)", reached: "var(--warning)", settled: "var(--lav)", failed: "var(--muted)", cancelled: "var(--muted)" };
const M_DOT: Record<State, string> = { open: "var(--brand)", reached: "var(--fg)", settled: "var(--fg)", failed: "var(--muted)", cancelled: "var(--muted)" };
const W_FILTERS: [Filter, string][] = [["all", "전체"], ["open", "모집 중"], ["reached", "결제 기간"], ["settled", "확정"], ["failed", "진행 안 됨"], ["cancelled", "취소"]];
const M_FILTERS: [Filter, string][] = [["all", "전체"], ["open", "모집 중"], ["reached", "결제 기간"], ["settled", "확정 완료"]];

export function ListTab({ mall, openId, setOpenId, say, goNew }: { mall: string; openId: string | null; setOpenId: (id: string | null) => void; say: (t: string) => void; goNew: () => void }) {
  const a = useConsole();
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const [now, setNow] = useState(0);
  const [f, setF] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [top, setTop] = useState<{ name: string; n: number } | null>(null);
  const load = useCallback(() => Promise.all([a.call<{ campaigns: Camp[] }>("GET", `${a.mallBase}/campaigns`), a.call<{ now: string }>("GET", a.now)])
    .then(([j, c]) => { setCamps(j.campaigns); setNow(new Date(c.now).getTime()); }).catch((e) => say(e.message)), [a, mall, say]);
  useEffect(() => { load(); }, [load]);
  // 휴대폰 맨 아래 '고객 N명이 기다려요' 한 칸: 고객이 기다리는 상품 1위 (판매자 화면만)
  useEffect(() => {
    if (a.role !== "seller") return;
    fetch("/api/v1/demand?sort=total", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j: { rows?: { name: string; alert: number; cart: number }[] } | null) => { const r = j?.rows?.[0]; if (r) setTop({ name: r.name, n: r.alert + r.cart }); }).catch(() => {});
  }, [a.role]);
  if (!camps) return <p className="muted">불러오는 중…</p>;
  if (!camps.length) return (
    <div className="card empty">
      <img src="/logo.svg" alt="" />
      <b>아직 연 공구가 없어요</b>
      <p className="muted">고객이 장바구니에 많이 담아 두거나 공구 알림을 신청한 상품으로 첫 공구를 열어 보세요.<br />목표 수량이 모이면 그때 결제를 받아요.</p>
      <button className="btn brand" onClick={goNew}>첫 공구 열기</button>
    </div>
  );

  const md = (iso: string | null) => (iso ? fmtKst(iso).split("(")[0] : "–");
  const dn = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
  const dday = (iso: string) => (dn(iso) === 0 ? "D-DAY" : `D-${dn(iso)}`);
  const due = (c: Camp) => {
    if (c.state === "open") return `${dday(c.deadlineAt)} · ${md(c.deadlineAt)}`;
    if (c.state === "reached") return c.payUntil ? `결제 ${dday(c.payUntil)} · ${md(c.payUntil)}` : md(c.deadlineAt);
    if (c.state === "settled") return `${md(c.payUntil ?? c.deadlineAt)} 확정`;
    return `${md(c.deadlineAt)} 종료`;
  };
  const mDue = (c: Camp) => (c.state === "open" ? dday(c.deadlineAt) : c.state === "reached" && c.payUntil ? `결제 ${dday(c.payUntil)}` : c.state === "settled" ? `${md(c.payUntil ?? c.deadlineAt)} 확정` : `${md(c.deadlineAt)} 끝남`);
  const left = (c: Camp) => {
    if (c.state === "failed") return "목표에 못 미쳐 끝났어요";
    if (c.state === "cancelled") return "모집 중에 취소했어요";
    if (c.state === "settled") return `확정 · 생산 결정하기`;
    if (c.pledgedQty >= c.targetQty) return c.state === "reached" ? "목표 달성 · 결제 받는 중" : "목표 달성 · 마감 기다리는 중";
    return `${c.targetQty - c.pledgedQty}개 더 모이면 목표 달성`;
  };
  const count = (k: Filter) => (k === "all" ? camps.length : camps.filter((c) => c.state === k).length);
  const shown = camps.filter((c) => (f === "all" || c.state === f) && (!q.trim() || c.productName.includes(q.trim())));
  const pick = (id: string) => setOpenId(openId === id ? null : id);

  return (
    <div className={`cm${openId ? " cm-open" : ""}`}>
      {/* 넓은 화면: 필터 · 검색 + 표 */}
      <section className="cm-list only-w" aria-label="공구 목록">
        <div className="cm-tools">
          <div className="cm-chips" role="radiogroup" aria-label="공구 상태">
            {W_FILTERS.filter(([k]) => k === "all" || k === "open" || k === "reached" || count(k) > 0).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={f === k} onClick={() => setF(k)}>{l} <span>{count(k)}</span></button>
            ))}
          </div>
          <label className="cm-search"><span className="sr">상품 이름으로 찾기</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" placeholder="상품 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <table className="cm-table">
          <thead><tr><th>상품</th><th>상태</th><th className="n">신청</th><th className="n">목표</th><th>달성률</th><th className="n">공구가</th><th className="n">마감</th></tr></thead>
          <tbody>
            {shown.map((c) => {
              const ratio = c.pledgedQty / c.targetQty;
              return (
                <tr key={c.id} className={openId === c.id ? "on" : undefined} onClick={() => pick(c.id)}>
                  <td><button type="button" className="nm" aria-pressed={openId === c.id} onClick={(e) => { e.stopPropagation(); pick(c.id); }}>{c.productName}</button></td>
                  <td><span className="st"><i style={{ background: DOT[c.state] }} />{CHIP[c.state][0] === "달성 · 결제 기간" ? "결제 기간" : CHIP[c.state][0]}</span></td>
                  <td className="n"><b>{c.pledgedQty}</b></td>
                  <td className="n">{c.targetQty}</td>
                  <td><span className="rate"><span className="track"><i style={{ width: `${Math.min(100, ratio * 100)}%`, background: DOT[c.state] }} /></span><span>{Math.round(ratio * 100)}%</span></span></td>
                  <td className="n"><b>{c.dealPrice != null ? c.dealPrice.toLocaleString("ko-KR") : "–"}</b></td>
                  <td className="n due">{due(c)}</td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={7} className="muted">맞는 공구가 없어요.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* 휴대폰: 숫자 상태 탭 + 카드 */}
      <div className="cm-m only-m">
        <div className="cm-mtabs" role="radiogroup" aria-label="공구 상태">
          {M_FILTERS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f === k} onClick={() => setF(k)}><b>{count(k)}</b>{l}</button>)}
        </div>
        {shown.map((c) => {
          const ratio = c.pledgedQty / c.targetQty;
          return (
            <button key={c.id} type="button" className="cm-card" onClick={() => setOpenId(c.id)}>
              <span className="top">
                <span className="t"><b>{c.productName}</b><span className="st"><i style={{ background: M_DOT[c.state] }} />{CHIP[c.state][0]}</span></span>
                <span className={c.state === "reached" ? "dd hot" : "dd"}>{mDue(c)}</span>
              </span>
              <span className="big"><b>{Math.round(ratio * 100)}%</b><span>{left(c)}</span></span>
              <span className="track"><i className={c.state} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></span>
            </button>
          );
        })}
        {!shown.length && <p className="muted">이 상태인 공구가 없어요.</p>}
        {top && (
          <button type="button" className="cm-card cm-wait" onClick={goNew}>
            <span className="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6 5 3H2" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /></svg></span>
            <span className="t"><b>고객 {top.n}명이 기다려요</b><span>{top.name} · 다음 공구로 열기</span></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        )}
      </div>

      {openId && (
        <>
          <button type="button" className="cm-back only-m" onClick={() => setOpenId(null)}><span aria-hidden="true">‹</span> 공구 상세</button>
          <CampaignDetail key={openId} id={openId} say={say} onChanged={load} />
        </>
      )}
    </div>
  );
}
