"use client";

// 공구 조건 시나리오 · 예상 결과 (#125). 계산은 lib/core/scenario.ts의 정해진 공식(AI 아님)이고, 화면에는 '예상'으로 보여 준다.
// ScenarioPick: 카드 3개(누르면 공구가 · 목표 · 마감이 채워짐) + 할인율 막대. ScenarioResult: 공구 열기 버튼 바로 위의 예상 결과 + 할인율별 그래프.

import { DISCOUNT_STEPS, curve, dealPriceFor, discountOf, outcome, scenarios, type Outcome, type ScenarioBase, type ScenarioKey } from "@/lib/core/scenario";
import { BASE_PLEDGE_RATE, BASE_DISCOUNT } from "@/lib/core/scenario";
import { EXPECTED_PAY_RATE } from "@/lib/core/pledge";
import { won } from "./format";

const ICON: Record<ScenarioKey, string> = { fast: "⚡", profit: "💰", moq: "📦" };
const pct = (r: number) => `${Math.round(r * 100)}%`;
const money = (o: Outcome) => (o.profit != null ? o.profit : o.revenue);

export function ScenarioPick({ base, dealPrice, targetQty, onPick, onDiscount }: {
  base: ScenarioBase; dealPrice: number; targetQty: number;
  onPick: (s: { dealPrice: number; targetQty: number; days: number }) => void;
  onDiscount: (dealPrice: number) => void;
}) {
  const list = scenarios(base);
  const off = discountOf(base.listPrice, dealPrice);
  return (
    <div className="sc">
      <div className="sc-cards" role="list">
        {list.map((s) => {
          const o = s.outcome;
          const on = !!o && o.dealPrice === dealPrice && o.targetQty === targetQty;
          return (
            <button key={s.key} type="button" role="listitem" className={`sc-card${on ? " on" : ""}`} disabled={!o} aria-pressed={on}
              onClick={() => o && onPick({ dealPrice: o.dealPrice, targetQty: o.targetQty, days: s.days })}>
              <b><span aria-hidden="true">{ICON[s.key]}</span> {s.title}</b>
              <small>{s.why}</small>
              {o ? (
                <span className="sc-sum">
                  <span>{o.discountPct}% 할인 · {won(o.dealPrice)} · 목표 {o.targetQty}개</span>
                  <strong>예상 결제 {o.paid}개 · {o.profit == null ? `매출 ${won(o.revenue)}` : o.profit < 0 ? `손해 ${won(-o.profit)}` : `이익 ${won(o.profit)}`}</strong>
                </span>
              ) : <span className="sc-sum muted">{s.note}</span>}
            </button>
          );
        })}
      </div>
      <label className="sc-slider">
        <span>할인율 <b>{off}%</b> · 공구가 {won(dealPrice)}</span>
        <input type="range" min={DISCOUNT_STEPS[0]} max={DISCOUNT_STEPS[DISCOUNT_STEPS.length - 1]} step={5} value={Math.min(60, Math.max(5, Math.round(off / 5) * 5))}
          onChange={(e) => onDiscount(dealPriceFor(base.listPrice, Number(e.target.value)))} aria-label="할인율" />
      </label>
    </div>
  );
}

export function ScenarioResult({ base, dealPrice, targetQty, onDiscount }: { base: ScenarioBase; dealPrice: number; targetQty: number; onDiscount: (dealPrice: number) => void }) {
  if (!(dealPrice > 0) || !(targetQty > 0)) return null;
  const o = outcome(base, dealPrice, targetQty);
  const pts = curve(base, targetQty);
  const max = Math.max(1, ...pts.map((p) => Math.abs(money(p))));
  const cur = Math.min(60, Math.max(5, Math.round(o.discountPct / 5) * 5));
  return (
    <div className="sc-res" aria-live="polite">
      <b className="sc-h">예상 결과</b>
      <div className="sc-funnel">
        <div><span>초대</span><b>{base.invited}명</b></div>
        <div><span>예상 신청</span><b>{o.pledged}개</b></div>
        <div className={o.reached ? "ok" : "bad"}><span>목표 {targetQty}개</span><b>{o.reached ? "달성 예상" : "못 채울 수 있어요"}</b></div>
        <div><span>예상 결제</span><b>{o.paid}개</b></div>
      </div>
      <div className="sc-money">
        <div><span>예상 매출</span><b>{won(o.revenue)}</b></div>
        <div className={o.profit == null ? "" : o.profit >= 0 ? "ok" : "bad"}><span>{o.profit == null ? "예상 이익" : o.profit >= 0 ? "예상 이익" : "예상 손해"}</span><b>{o.profit == null ? "원가를 넣으면 보여요" : won(Math.abs(o.profit))}</b></div>
        {base.moq != null && <div className={o.moqMet ? "ok" : "bad"}><span>최소 생산 {base.moq}개</span><b>{o.moqMet ? "채워요" : "못 채워요"}</b></div>}
      </div>
      {o.leftover > 0 && base.costPrice != null && <p className="small">최소 생산 수량 때문에 {o.produce}개를 만들면 {o.leftover}개가 남아요(원가 {won(o.leftover * base.costPrice)}). 정가로 팔면 손해가 줄어요.</p>}
      <div className="sc-chart" role="group" aria-label={`할인율별 예상 ${base.costPrice != null ? "이익" : "매출"}`}>
        {pts.map((p) => {
          const v = money(p), h = Math.round((Math.abs(v) / max) * 100);
          const step = discountOf(base.listPrice, p.dealPrice);
          const on = Math.round(step / 5) * 5 === cur;
          return (
            <button key={p.dealPrice} type="button" className={`sc-bar${on ? " on" : ""}${v < 0 ? " neg" : ""}`} onClick={() => onDiscount(p.dealPrice)}
              aria-label={`${step}% 할인: 예상 ${base.costPrice != null ? (v < 0 ? "손해" : "이익") : "매출"} ${won(Math.abs(v))}`} title={`${step}% · ${won(v)}`}>
              <i style={{ height: `${Math.max(v === 0 ? 0 : 4, h)}%` }} />
              <small>{step}</small>
            </button>
          );
        })}
      </div>
      <small className="sc-cap">막대: 목표 {targetQty}개일 때 할인율(%)별 예상 {base.costPrice != null ? "이익(빨강은 손해)" : "매출"} · 빈 칸은 목표를 못 채우는 할인율 · 눌러서 바꿔 보세요</small>
      <small className="sc-cap">예상치예요. 초대 → 신청 {pct(BASE_PLEDGE_RATE)}(할인 {pct(BASE_DISCOUNT)} 기준, 할인에 따라 3~15%) · 신청 → 결제 {pct(EXPECTED_PAY_RATE)}로 계산했어요. 파일럿 결과로 맞춰 갈게요.</small>
    </div>
  );
}
