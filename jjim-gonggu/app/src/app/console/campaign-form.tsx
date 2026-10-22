"use client";

// 공구 열기 2 · 3단계: 조건 입력 → 미리보기(초대 대상 · 문자) → 공구 열기. 운영자 OP-2 · OP-3 / 판매자 S-06 · S-07 · S-08.
// 시안 3: 넓은 화면은 '2 조건 정하기'(입력 8칸) 옆에 '3 미리보기 · 열기'. 휴대폰은 질문 3개(② 목표 수량 −/+ · ③ 공구가 · 마감)와
// 결과 한 줄 + 큰 '공구 열기' 버튼. 미리보기는 조건을 바꾸면 잠시 뒤 저절로 다시 계산한다.

import { useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Preview, ProductDefaults, RadarRow } from "./types";
import { kst, won } from "./format";
import { EXPECTED_PAY_RATE, pledgesNeeded } from "@/lib/core/pledge";

const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

export function CampaignForm({ mall, p, say, onOpened, onStep }: { mall: string; p: RadarRow; say: (t: string) => void; onOpened: (id: string) => void; onStep?: (s: 2 | 3) => void }) {
  const a = useConsole();
  const [f, setF] = useState<Record<string, string | boolean> | null>(null);
  const [now, setNow] = useState(0);
  const [pv, setPv] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [showMsg, setShowMsg] = useState(false);
  const [costFrom, setCostFrom] = useState<ProductDefaults["costFrom"]>(null);
  useEffect(() => {
    // 원가 · 최소 생산 수량은 지난 공구 → 카페24 공급가로 미리 채운다 (#124). 못 받아도 빈칸으로 연다
    const d = a.call<ProductDefaults>("GET", `${a.mallBase}/products/${p.productNo}/defaults`).catch(() => null);
    Promise.all([a.call<{ now: string }>("GET", a.now), d]).then(([{ now }, def]) => {
      const t = new Date(now).getTime(), dl = t + 5 * 86_400_000;
      setNow(t);
      setCostFrom(def?.costPrice != null ? def.costFrom : null);
      setF({ targetQty: String(def?.moq ?? 30), dealPrice: String(Math.round((p.price * 0.75) / 500) * 500), costPrice: def?.costPrice != null ? String(def.costPrice) : "", moq: def?.moq != null ? String(def.moq) : "", perMemberLimit: "2", deadline: `${kstDay(dl)}T14:00`, payWindowHours: "72", shipEta: kstDay(dl + 14 * 86_400_000), confirmBelowCost: false });
    }).catch((e) => say(e.message));
  }, [a, p.price, p.productNo, say]);

  const input = (v: Record<string, string | boolean>) => ({
    productNo: p.productNo, targetQty: v.targetQty, dealPrice: v.dealPrice, costPrice: v.costPrice, moq: v.moq, perMemberLimit: v.perMemberLimit,
    deadlineAt: v.deadline ? new Date(`${v.deadline}:00+09:00`).toISOString() : "", payWindowHours: v.payWindowHours, shipEta: v.shipEta, confirmBelowCost: v.confirmBelowCost,
  });
  // 조건이 바뀌면 0.7초 뒤 미리보기를 다시 받는다
  useEffect(() => {
    if (!f) return;
    let live = true;
    const t = setTimeout(() => {
      a.call<Preview>("POST", `${a.mallBase}/campaigns/preview`, input(f))
        .then((r) => { if (live) { setPv(r); setErr(null); } })
        .catch((e) => { if (live) { setPv(null); setErr((e as Error).message); } });
    }, 700);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, a, mall]);
  const ok = !!pv && pv.errors.length === 0;
  useEffect(() => { onStep?.(ok ? 3 : 2); }, [ok, onStep]);
  if (!f) return null;

  const put = (k: string, v: string | boolean) => setF({ ...f, [k]: v });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => put(k, e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value);
  // 신청은 결제가 아니다: 목표만큼 확정하려면 예상 결제율로 나눈 만큼 신청이 모여야 한다 (검증 보고서 L-1)
  const target = Number(f.targetQty);
  const need = Number.isInteger(target) && target > 0 ? pledgesNeeded(target) : 0;
  const payPct = Math.round(EXPECTED_PAY_RATE * 100);
  const deal = Number(f.dealPrice);
  const off = deal > 0 && deal < p.price ? Math.round((1 - deal / p.price) * 100) : 0;
  const dlMs = f.deadline ? new Date(`${f.deadline}:00+09:00`).getTime() : 0;
  const dlDays = now && dlMs ? Math.max(0, Math.round((dlMs - now) / 86_400_000)) : null;
  const open = async () => {
    setBusy(true);
    try { const r = await a.call<{ campaign: { id: string }; invited: number }>("POST", `${a.mallBase}/campaigns`, input(f)); say(`공구를 열었어요 · 초대 ${r.invited}명`); onOpened(r.campaign.id); }
    catch (e) { setBusy(false); say((e as Error).message); }
  };
  const openLabel = busy ? "여는 중…" : pv ? `공구 열기 · 초대 ${pv.audience.reachable}명 예약` : "공구 열기";
  const problems = err ? [err] : pv?.errors ?? [];

  const fields = {
    target: <label key="t">목표 수량<input type="number" min={1} value={String(f.targetQty)} onChange={set("targetQty")} /><span className="hint">이만큼 신청이 모이면 공구가 성사돼요</span></label>,
    price: <label key="p">공구가 (원)<input type="number" min={0} step={500} value={String(f.dealPrice)} onChange={set("dealPrice")} /><span className="hint">정가보다 낮아야 해요{off ? ` · ${off}% 할인` : ""}</span></label>,
    cost: <label key="c">원가 (1개당, 원)<input type="number" min={0} step={500} value={String(f.costPrice)} onChange={(e) => { setCostFrom(null); set("costPrice")(e); }} /><span className="hint">{costFrom === "cafe24" ? "카페24 공급가에서 불러왔어요. 포장 · 배송비가 있으면 더해 주세요" : costFrom === "last" ? "지난 공구에 적은 원가예요" : "고객에게 보이지 않아요. 마진 계산에만 써요"}</span></label>,
    moq: <label key="q">최소 생산 수량 (선택)<input type="number" min={1} value={String(f.moq)} onChange={set("moq")} /><span className="hint">가마 1회분 · 원단 1롤처럼 한 번에 만들어야 하는 수량 · 고객에게 보이지 않아요</span></label>,
    limit: <label key="l">1인 최대 수량<input type="number" min={1} max={5} value={String(f.perMemberLimit)} onChange={set("perMemberLimit")} /><span className="hint">1 ~ 5개</span></label>,
    deadline: <label key="d">마감 일시<input type="datetime-local" value={String(f.deadline)} onChange={set("deadline")} /><span className="hint">한국 시간 · 이 시각에 목표 달성 여부를 판정해요</span></label>,
    pay: <label key="w">결제 기간<select value={String(f.payWindowHours)} onChange={set("payWindowHours")}><option value="72">달성 후 72시간</option><option value="48">달성 후 48시간</option></select></label>,
    ship: <label key="s">예상 출고일<input type="date" value={String(f.shipEta)} onChange={set("shipEta")} /><span className="hint">고객에게 그대로 보여요</span></label>,
    below: <label key="b" className="chk"><input type="checkbox" checked={!!f.confirmBelowCost} onChange={set("confirmBelowCost")} />원가 미만이어도 열기</label>,
  };

  return (
    <>
      {/* 넓은 화면: 2 조건 정하기 | 3 미리보기 · 열기 */}
      <div className="op-grid only-w">
        <section className="op-card op-pad" aria-labelledby="op-s2">
          <h2 id="op-s2">2 조건 정하기 <span>· {p.name} · 정가 {won(p.price)}</span></h2>
          <div className="form op-form">{fields.target}{fields.price}{fields.cost}{fields.moq}{fields.limit}{fields.deadline}{fields.pay}{fields.ship}{fields.below}</div>
          {need > 0 && <p className="op-note">결제율 {payPct}%로 보면 신청 <b>{need}</b>개가 모여야 <b>{target}</b>개가 확정돼요. 신청은 결제가 아니라서 목표만큼 모여도 일부는 결제하지 않아요.</p>}
        </section>
        <section className="op-card op-pad" aria-labelledby="op-s3">
          <h2 id="op-s3">3 미리보기 · 열기</h2>
          {pv ? (
            <>
              <div className="op-aud">
                <div><span>알림 신청</span><b>{pv.audience.alert}명</b></div>
                <div><span>장바구니</span><b>{pv.audience.cart}명</b></div>
                <div><span>중복 제외</span><b>{pv.audience.unique}명</b></div>
                <div className="hl"><span>{pv.audience.consentChecked ? "문자 발송 대상 (수신 동의)" : "초대 대상 (최대)"}</span><b>{pv.audience.reachable}명</b></div>
              </div>
              <ul className="op-facts">
                <li>초대 대상 {pv.audience.reachable}명이 1인 최대 {Number(f.perMemberLimit) || 1}개까지 신청할 수 있어요.</li>
                {pv.marginPerUnit != null && <li>개당 마진 <b>{won(pv.marginPerUnit)}</b></li>}
                <li>초대 문자 발송: {kst(pv.sendAt)} (밤 9시 ~ 오전 8시는 자동으로 미뤄요)</li>
                {!pv.audience.consentChecked && <li>문자 수신을 거부한 고객은 카페24가 발송할 때 자동으로 빼요. 실제 받는 사람은 이보다 적을 수 있어요.</li>}
              </ul>
              <div className="op-msg"><span>초대 문자 미리보기</span><p className="bubble">{pv.message}</p>
                <small>문자는 판매자님의 카페24 SMS로 보내요. 충전 잔액이 초대 인원보다 적으면 충전할 때까지 30분마다 다시 보내요.</small></div>
              {pv.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
            </>
          ) : !problems.length && <p className="muted">초대 대상을 확인하는 중…</p>}
          {problems.length > 0 && <div className="err" role="alert">{problems.map((e) => <div key={e}>{e}</div>)}</div>}
          <button className="btn brand op-open" disabled={busy || !ok} onClick={open}>{openLabel}</button>
          <small className="op-after">{a.role === "admin" ? "판매자에게 조건을 다시 읽어 주고 동의를 받은 뒤 여세요." : "열면 쿠폰이 만들어지고 공구 관리로 이동해요."}</small>
        </section>
      </div>

      {/* 휴대폰: ② 목표 수량 · ③ 공구가 · 마감 · 결과 한 줄 · 공구 열기 */}
      <div className="op-m only-m">
        <h2 className="op-q">② 몇 개 모이면 만들까요?</h2>
        <div className="op-step">
          <button type="button" aria-label="목표 수량 줄이기" onClick={() => put("targetQty", String(Math.max(1, (target || 0) - 5)))}>−</button>
          <span><b>{f.targetQty || 0}개</b><small>{Number(f.moq) > 0 ? `최소 생산 수량 ${f.moq}개` : "이만큼 모이면 공구가 성사돼요"}</small></span>
          <button type="button" aria-label="목표 수량 늘리기" onClick={() => put("targetQty", String((target || 0) + 5))}>+</button>
        </div>
        <h2 className="op-q">③ 얼마에, 언제까지 팔까요?</h2>
        <div className="op-ask">
          <label>
            <span className="ic won" aria-hidden="true">₩</span>
            <span className="t"><span>공구가{off ? <em> {off}% 할인</em> : null}</span><input type="number" inputMode="numeric" min={0} step={500} value={String(f.dealPrice)} onChange={set("dealPrice")} /></span>
            <s>{won(p.price)}</s>
          </label>
          <label>
            <span className="ic cal" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></span>
            <span className="t"><span>모집 마감{dlDays != null ? ` · ${dlDays}일 뒤` : ""}</span><input type="datetime-local" value={String(f.deadline)} onChange={set("deadline")} /></span>
          </label>
        </div>
        <button type="button" className="op-link" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "접기" : "원가 · 최소 생산 수량 · 1인 최대 수량 · 결제 기간 · 출고일 더 정하기"}</button>
        {more && <div className="form op-more-f">{fields.cost}{fields.moq}{fields.limit}{fields.pay}{fields.ship}{fields.below}</div>}
        {need > 0 && <p className="small">결제율 {payPct}%로 보면 신청 {need}개가 모여야 {target}개가 확정돼요.</p>}
        <div className="callout op-result">
          <b>미리보기</b>
          {pv ? <>
            <strong>{pv.audience.reachable}명에게 초대 문자가 가요</strong>
            <span>{pv.audience.consentChecked ? "문자 수신에 동의한 고객만이에요" : "수신 거부 고객은 발송 때 빠져요"} · {kst(pv.sendAt)} 발송{pv.marginPerUnit != null ? ` · 개당 마진 ${won(pv.marginPerUnit)}` : ""}</span>
          </> : <span>{problems.length ? "조건을 고쳐 주세요" : "초대 대상을 확인하는 중…"}</span>}
        </div>
        {problems.length > 0 && <div className="err" role="alert">{problems.map((e) => <div key={e}>{e}</div>)}</div>}
        {pv?.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
        <button className="op-mopen" disabled={busy || !ok} onClick={open}>{busy ? "여는 중…" : "공구 열기 ›"}</button>
        <button type="button" className="op-link center" aria-expanded={showMsg} onClick={() => setShowMsg(!showMsg)}>{showMsg ? "문자 미리보기 닫기" : "초대 문자 미리보기"}</button>
        {showMsg && pv && <p className="bubble">{pv.message}</p>}
      </div>
    </>
  );
}
