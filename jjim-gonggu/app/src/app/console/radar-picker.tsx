"use client";

// 공구 열기 1단계: 알림 신청 · 장바구니가 많은 상품 상위 20에서 고르기. 운영자 OP-1(상위 20) / 판매자 S-04 · S-E2(첫 수집 중).
// 시안 3: 넓은 화면은 단계 표시 + 표(# · 상품 · 정가 · 알림 신청 · 장바구니 · 선택), 휴대폰은 ① 라디오 목록(장바구니 · 알림 머리글로 정렬).
// 진행 중인 공구가 있는 상품은 고를 수 없다(한 상품에 공구는 하나).

import { useCallback, useEffect, useState } from "react";

/** 휴대폰 폭(560px 이하)인지. 표 대신 목록으로 그릴 때 쓴다 (#9) */
export function useNarrow(max = 560) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${max}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [max]);
  return narrow;
}
import { useConsole } from "./provider";
import type { Camp, RadarRow, Run } from "./types";
import { kst, won } from "./format";
import { CampaignForm } from "./campaign-form";
import s from "./radar-picker.module.css";

type Sort = "total" | "cart" | "alert";
/** 처음에는 상위 5개만 보여 주고 나머지는 "더보기"로 펼친다 */
const TOP = 5;

export function NewTab({ mall, say, onOpened }: { mall: string; say: (t: string) => void; onOpened: (id: string) => void }) {
  const a = useConsole();
  const [radar, setRadar] = useState<{ run: Run | null; current: Run | null; rows: RadarRow[] } | null>(null);
  const [busyNos, setBusyNos] = useState<Set<number>>(new Set());
  const [pick, setPick] = useState<RadarRow | null>(null);
  const [sort, setSort] = useState<Sort>("total");
  const [mSort, setMSort] = useState<"cart" | "alert">("cart");
  const [all, setAll] = useState(false);
  const [wAll, setWAll] = useState(false);
  const [step, setStep] = useState<2 | 3>(2);
  const load = useCallback(() => a.call<{ run: Run | null; current: Run | null; rows: RadarRow[] }>("GET", `${a.mallBase}/radar`).then(setRadar).catch((e) => say(e.message)), [a, mall, say]);
  const collect = async () => { await a.call("POST", `${a.mallBase}/radar`).catch((e) => say((e as Error).message)); load(); };
  useEffect(() => { load(); }, [load]);
  // 모집 중 · 결제 기간인 공구가 있는 상품
  useEffect(() => {
    a.call<{ campaigns: Camp[] }>("GET", `${a.mallBase}/campaigns`)
      .then((j) => setBusyNos(new Set(j.campaigns.filter((c) => c.state === "open" || c.state === "reached").map((c) => c.productNo!).filter((n) => n != null))))
      .catch(() => {});
  }, [a, mall]);
  const running = radar?.current?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running, load]);

  if (!radar) return <p className="muted">불러오는 중…</p>;
  const busy = (p: RadarRow) => busyNos.has(p.productNo);
  const choose = (p: RadarRow) => { if (!busy(p)) setPick(p); };
  const by = (k: Sort) => (x: RadarRow, y: RadarRow) => (k === "total" ? y.alert + y.cart - (x.alert + x.cart) : y[k] - x[k] || y.cart + y.alert - (x.cart + x.alert));
  const rows = [...radar.rows].sort(by(sort)).slice(0, 20);
  const mRows = [...radar.rows].sort(by(mSort));
  const empty = radar.rows.length === 0;
  const collectBtn = <button type="button" className="ghost op-collect" onClick={collect} disabled={running}>{running ? `수집 중 ${radar.current!.done}/${radar.current!.total}` : radar.run ? "다시 수집" : "관심 데이터 모으기"}</button>;
  const emptyNote = !radar.run && empty
    ? (running ? "상품마다 하나씩 확인하는 중이에요. 상품이 많으면 몇 분에서 몇 시간 걸려요." : "아직 모은 데이터가 없어요. 오른쪽 위 버튼으로 시작하세요.")
    : "아직 공구 알림 신청이나 장바구니에 담긴 상품이 없어요. 고객이 쇼핑몰에 로그인한 뒤 상품을 장바구니에 담거나, 품절 상품의 '재입고 · 공구 알림 받기'를 누르면 여기에 나와요. 처음 설치했다면 테스트 회원으로 직접 담아 보고 '다시 수집'을 누르세요.";
  const cur = !pick ? 1 : step;

  return (
    <div className="op">
      {/* 단계 표시 (넓은 화면) */}
      <ol className="op-steps only-w" aria-label="공구 여는 단계">
        {([["상품 고르기", pick?.name ?? "고객이 기다리는 상품"], ["조건 정하기", "목표 · 공구가 · 마감"], ["미리보기 · 열기", "초대 대상 · 문자 확인"]] as const).map(([t, sub], i) => (
          <li key={t} aria-current={cur === i + 1 ? "step" : undefined} className={cur > i + 1 ? "done" : undefined}>
            <span className="n">{cur > i + 1 ? "✓" : i + 1}</span><span><b>{t}</b><small>{sub}</small></span>
          </li>
        ))}
      </ol>

      {/* 1 상품 고르기: 넓은 화면 표 */}
      <section className="op-card only-w" aria-labelledby="op-s1">
        <div className="op-head">
          <div><h2 id="op-s1">1 상품 고르기 <span>· 알림 신청 · 장바구니 많은 순 상위 {Math.min(20, radar.rows.length) || 20}개</span></h2>
            <small>{radar.run ? `${kst(radar.run.finishedAt ?? radar.run.startedAt)} 기준` : a.role === "admin" ? "판매자와 통화하며 함께 고르세요" : "공구 알림 신청과 장바구니가 많은 상품부터 보여 드려요"}</small></div>
          {collectBtn}
        </div>
        {empty ? <p className="muted op-empty">{emptyNote}</p> : (
          <table className="op-table">
            <caption className="sr">상품별 알림 신청 · 장바구니 수</caption>
            <thead><tr>
              <th className="rk">#</th><th>상품</th><th className="n">정가</th>
              {([["alert", "알림 신청"], ["cart", "장바구니"]] as const).map(([k, l]) => (
                <th key={k} className="n" aria-sort={sort === k ? "descending" : "none"}><button type="button" className={sort === k ? "on" : undefined} onClick={() => setSort(sort === k ? "total" : k)}>{l}{sort === k ? " ↓" : ""}</button></th>
              ))}
              <th><span className="sr">선택</span></th>
            </tr></thead>
            <tbody>{(wAll ? rows : rows.slice(0, TOP)).map((p, i) => {
              const on = pick?.productNo === p.productNo, b = busy(p);
              return (
                <tr key={p.productNo} className={on ? "on" : b ? "busy" : undefined} onClick={() => choose(p)}>
                  <td className="rk">{i + 1}</td>
                  <td><b>{p.name}</b>{p.soldOut && <span className="tag">품절</span>}{b && <span className="tag">공구 진행 중</span>}</td>
                  <td className="n">{p.price.toLocaleString("ko-KR")}</td>
                  <td className="n al">{p.alert}</td>
                  <td className="n">{p.cart}</td>
                  <td className="n"><button type="button" className={on ? "sel on" : "sel"} disabled={b} aria-pressed={on} onClick={(e) => { e.stopPropagation(); choose(p); }}>{on ? "선택됨" : "선택"}</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {rows.length > TOP && <button type="button" className={s.more} aria-expanded={wAll} onClick={() => setWAll(!wAll)}>{wAll ? "접기 ▴" : `더보기 (${rows.length - TOP}개) ▾`}</button>}
      </section>

      {/* ① 어떤 상품을 열까요? 휴대폰 목록 */}
      <h2 className="op-q only-m">① 어떤 상품을 열까요?</h2>
      <section className="op-mlist only-m" aria-label="상품별 장바구니 수">
        <div className="op-mtop"><span>{radar.run ? `상품 ${radar.run.total}개 · ${kst(radar.run.finishedAt ?? radar.run.startedAt)} 기준` : "관심 데이터"}</span>{collectBtn}</div>
        {empty ? <p className="muted op-empty">{emptyNote}</p> : (
          <>
            <div className="op-mrow head" role="row">
              <span /><span>상품</span>
              <button type="button" className={mSort === "cart" ? "on" : undefined} onClick={() => setMSort("cart")}>장바구니{mSort === "cart" ? " ↓" : ""}</button>
              <button type="button" className={mSort === "alert" ? "on" : undefined} onClick={() => setMSort("alert")}>알림{mSort === "alert" ? " ↓" : ""}</button>
            </div>
            {(all ? mRows : mRows.slice(0, TOP)).map((p) => {
              const on = pick?.productNo === p.productNo, b = busy(p);
              return (
                <button key={p.productNo} type="button" className={`op-mrow${on ? " on" : ""}${b ? " busy" : ""}`} aria-pressed={on} disabled={b} onClick={() => choose(p)}>
                  <span className="radio" aria-hidden="true"><i /></span>
                  <span className="t"><b>{p.name}</b><small>{b ? "공구 진행 중 · 고를 수 없어요" : `정가 ${won(p.price)}${p.soldOut ? " · 품절" : ""}`}</small></span>
                  <b className="c">{p.cart}</b><span className="a">{p.alert}</span>
                </button>
              );
            })}
            {mRows.length > TOP && <button type="button" className="op-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "접기 ▴" : `더보기 (${mRows.length - TOP}개) ▾`}</button>}
          </>
        )}
      </section>

      {pick && <CampaignForm key={pick.productNo} mall={mall} p={pick} say={say} onOpened={onOpened} onStep={setStep} />}
    </div>
  );
}
