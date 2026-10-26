"use client";

// 공구 조건 시나리오 · 예상 결과 (#125). 계산은 lib/core/scenario.ts의 정해진 공식(AI 아님)이고, 화면에는 '예상'으로 보여 준다.
// AutoFilled: 자동으로 채운 칸과 출처. ScenarioPick: 카드 3개(누르면 공구가 · 목표 · 마감이 채워짐) + 할인율 막대.
// ScenarioResult: 공구 열기 버튼 바로 위의 예상 결과 · 신청률 가정 · 할인율별 기대 이익 그래프.

import { ASSUME, DISCOUNT_STEPS, LEVELS, avgQtyOf, baseRate, curve, dealPriceFor, discountOf, outcome, payRateOf, scenarios, value, type Level, type Outcome, type ScenarioBase, type ScenarioKey } from "@/lib/core/scenario";
import type { ProductDefaults } from "./types";
import { won } from "./format";

const ICON: Record<ScenarioKey, string> = { fast: "⚡", best: "💰", moq: "📦" };
const CHANCE: Record<Outcome["chance"], string> = { high: "높음", mid: "반반", low: "낮음" };
const pct = (r: number) => `${Math.round(r * 100)}%`;
const signed = (v: number) => (v < 0 ? `손해 ${won(-v)}` : won(v));
const step5 = (p: number) => Math.min(60, Math.max(5, Math.round(p / 5) * 5));

/** 자동으로 채운 칸 (판매자가 일일이 적지 않게) */
export function AutoFilled({ costFrom, def, auto, edited }: { costFrom: ProductDefaults["costFrom"]; def: ProductDefaults | null; auto: boolean; edited: Set<string> }) {
  const items: string[] = [];
  if (costFrom === "cafe24") items.push("원가: 카페24 공급가");
  else if (costFrom === "last") items.push("원가: 지난 공구");
  if (def?.moq != null && !edited.has("moq")) items.push("최소 생산 수량: 지난 공구");
  const past = [def?.perMemberLimit != null && !edited.has("perMemberLimit") && "1인 최대", def?.payWindowHours != null && !edited.has("payWindowHours") && "결제 기간"].filter(Boolean);
  if (past.length) items.push(`${past.join(" · ")}: 지난 공구`);
  if (auto) items.push("공구가 · 목표 · 마감: 💰 추천 조건");
  if (!items.length) return null;
  return <p className="sc-auto"><b>자동으로 채웠어요</b> {items.join(" · ")} <span>바꿔도 돼요</span></p>;
}

export function ScenarioPick({ base, dealPrice, targetQty, days, onPick, onDiscount }: {
  base: ScenarioBase; dealPrice: number; targetQty: number; days: number;
  onPick: (s: { dealPrice: number; targetQty: number; days: number }) => void;
  onDiscount: (dealPrice: number) => void;
}) {
  const list = scenarios(base);
  const off = discountOf(base.listPrice, dealPrice);
  const money = base.costPrice != null ? "이익" : "매출";
  return (
    <div className="sc">
      <div className="sc-cards" role="group" aria-label="공구 조건 시나리오">
        {list.map((s) => {
          const o = s.outcome;
          const on = !!o && o.dealPrice === dealPrice && o.targetQty === targetQty && o.days === days;
          return (
            <button key={s.key} type="button" className={`sc-card${on ? " on" : ""}`} disabled={!o} aria-pressed={on}
              onClick={() => o && onPick({ dealPrice: o.dealPrice, targetQty: o.targetQty, days: o.days })}>
              <b><span aria-hidden="true">{ICON[s.key]}</span> {s.title}</b>
              <small>{s.why}</small>
              {o ? (
                <span className="sc-sum">
                  <span>{o.discountPct}% 할인 · {won(o.dealPrice)} · 목표 {o.targetQty}개 · {o.days}일</span>
                  <span>성사 가능성 <em className={`ch-${o.chance}`}>{CHANCE[o.chance]} {pct(o.reachProb)}</em></span>
                  <strong>기대 {money} {signed(value(o))}</strong>
                  <span>성사되면 평균 결제 {o.ifReached.paid}개 · {money} {signed(o.ifReached.profit ?? o.ifReached.revenue)}</span>
                </span>
              ) : <span className="sc-sum muted">{s.note}</span>}
            </button>
          );
        })}
      </div>
      <label className="sc-slider">
        <span>할인율 <b>{off}%</b> · 공구가 {won(dealPrice)}</span>
        <input type="range" min={DISCOUNT_STEPS[0]} max={DISCOUNT_STEPS[DISCOUNT_STEPS.length - 1]} step={5} value={DISCOUNT_STEPS.find((p) => dealPriceFor(base.listPrice, p) === dealPrice) ?? step5(off)}
          onChange={(e) => onDiscount(dealPriceFor(base.listPrice, Number(e.target.value)))} aria-label="할인율" />
      </label>
    </div>
  );
}

export function ScenarioResult({ base, dealPrice, targetQty, days, level, onLevel, onDiscount }: {
  base: ScenarioBase; dealPrice: number; targetQty: number; days: number; level: Level;
  onLevel: (l: Level) => void; onDiscount: (dealPrice: number) => void;
}) {
  if (!(dealPrice > 0) || !(targetQty > 0)) return null;
  const o = outcome(base, dealPrice, targetQty, days);
  const pts = curve(base, targetQty, days);
  const max = Math.max(1, ...pts.map((p) => Math.abs(value(p.o))));
  const cur = step5(o.discountPct);
  const money = base.costPrice != null ? "이익" : "매출";
  const r = o.ifReached;
  const src = baseRate(base);
  return (
    <div className="sc-res" aria-live="polite">
      <div className="sc-top">
        <b className="sc-h">예상 결과</b>
        <div className="sc-lv" role="radiogroup" aria-label="신청률 가정">
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? "on" : ""} onClick={() => onLevel(l)}>
              {l === "low" ? "보수적" : l === "mid" ? "보통" : "기대"}
            </button>
          ))}
        </div>
      </div>
      <div className="sc-chance">
        <span>성사 가능성</span>
        <i aria-hidden="true"><i className={`ch-${o.chance}`} style={{ width: pct(o.reachProb) }} /></i>
        <b className={`ch-${o.chance}`}>{CHANCE[o.chance]} {pct(o.reachProb)}</b>
      </div>
      <div className="sc-funnel">
        <div><span>초대</span><b>{base.audience.reachable}명</b></div>
        <div><span>예상 신청</span><b>{o.expectedPledged}개</b></div>
        <div><span>목표 (신청)</span><b>{targetQty}개</b></div>
        <div><span>성사되면 평균 결제</span><b>{r.paid}개</b></div>
      </div>
      <div className="sc-money">
        <div><span>성사되면 매출</span><b>{won(r.revenue)}</b></div>
        <div className={r.profit == null ? "" : r.profit >= 0 ? "ok" : "bad"}><span>성사되면 이익</span><b>{r.profit == null ? "원가를 넣으면 보여요" : signed(r.profit)}</b></div>
        <div className={value(o) > 0 ? "ok" : value(o) < 0 ? "bad" : ""}><span>기대 {money}</span><b>{signed(value(o))}</b></div>
      </div>
      {base.moq != null && <p className={`small ${o.moqMet === "sure" ? "" : "warn"}`}>최소 생산 {base.moq}개: {o.moqMet === "sure" ? "목표만큼만 모여도 채워요(90% 확률)" : o.moqMet === "likely" ? `예상대로 모이면 채우지만, 신청이 목표만큼만 모이면 결제 ${o.minPaid}개라 못 채워요` : `성사돼도 결제 ${r.paid}개 예상이라 못 채워요`}{r.leftover > 0 && base.costPrice != null ? ` · ${r.produce}개를 만들면 ${r.leftover}개가 남아요(원가 ${won(r.leftover * base.costPrice)})` : ""}</p>}
      <div className="sc-chart" role="group" style={{ gridTemplateColumns: `repeat(${pts.length}, minmax(0, 1fr))` }} aria-label={`할인율별 기대 ${money}`}>
        {pts.map(({ step, o: p }) => {
          const v = value(p), h = Math.round((Math.abs(v) / max) * 100);
          const on = p.dealPrice === dealPrice || (step5(p.discountPct) === cur && !pts.some((x) => x.o.dealPrice === dealPrice));
          return (
            <button key={step} type="button" className={`sc-bar${on ? " on" : ""}${v < 0 ? " neg" : ""}`} onClick={() => onDiscount(p.dealPrice)} aria-pressed={on}
              aria-label={`${p.discountPct}% 할인: 기대 ${money} ${signed(v)}, 성사 가능성 ${pct(p.reachProb)}`} title={`${p.discountPct}% · ${signed(v)} · 성사 ${pct(p.reachProb)}`}>
              <i style={{ height: `${v === 0 ? 0 : Math.max(4, h)}%` }} />
              <small>{p.discountPct}</small>
            </button>
          );
        })}
      </div>
      <small className="sc-cap">막대: 목표 {targetQty}개 · {days}일일 때 할인율(%)별 기대 {money}(성사 가능성 × 성사되면 {money}{base.costPrice != null ? ", 빨강은 손해" : ""}) · 눌러서 바꿔 보세요</small>
      <small className="sc-cap">
        예상치예요. 신청률(할인 20% · 5일 기준) {pct(src.rate)}{src.from === "mall" ? ` · 이 쇼핑몰 지난 공구 ${base.history?.campaigns}건 실측` : ` · 기본값(알림 신청 ${pct(ASSUME.alertRate)} · 장바구니 ${pct(ASSUME.cartRate)})`}
        {level !== "mid" ? ` × ${LEVELS[level]}` : ""} · 1명 평균 {avgQtyOf(base)}개 · 신청 → 결제 {pct(payRateOf(base))}{base.history?.payRate != null ? "(실측)" : ""}
      </small>
    </div>
  );
}
