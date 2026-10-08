"use client";

// 새 공구 2단계: 조건 입력 → 미리보기(초대 대상 · 문자) → 공구 열기. 운영자 OP-2 · OP-3 / 판매자 S-06 · S-07 · S-08.

import { useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Preview, RadarRow } from "./types";
import { kst, won } from "./format";

const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

export function CampaignForm({ mall, p, say, onOpened }: { mall: string; p: RadarRow; say: (t: string) => void; onOpened: (id: string) => void }) {
  const a = useConsole();
  const [f, setF] = useState<Record<string, string | boolean> | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    a.call<{ now: string }>("GET", a.now).then(({ now }) => {
      const dl = new Date(now).getTime() + 5 * 86_400_000;
      setF({ targetQty: "30", dealPrice: String(Math.round((p.price * 0.75) / 500) * 500), costPrice: "", perMemberLimit: "2", deadline: `${kstDay(dl)}T14:00`, payWindowHours: "72", shipEta: kstDay(dl + 14 * 86_400_000), confirmBelowCost: false });
    }).catch((e) => say(e.message));
  }, [a, p.price, say]);
  if (!f) return null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }); setPv(null); };
  const input = () => ({
    productNo: p.productNo, targetQty: f.targetQty, dealPrice: f.dealPrice, costPrice: f.costPrice, perMemberLimit: f.perMemberLimit,
    deadlineAt: f.deadline ? new Date(`${f.deadline}:00+09:00`).toISOString() : "", payWindowHours: f.payWindowHours, shipEta: f.shipEta, confirmBelowCost: f.confirmBelowCost,
  });
  const preview = async () => { setErr(null); try { setPv(await a.call<Preview>("POST", `${a.mallBase}/campaigns/preview`, input())); } catch (e) { setErr((e as Error).message); } };
  const open = async () => {
    setBusy(true);
    try { const r = await a.call<{ campaign: { id: string }; invited: number }>("POST", `${a.mallBase}/campaigns`, input()); say(`공구를 열었어요 · 초대 ${r.invited}명`); onOpened(r.campaign.id); }
    catch (e) { setBusy(false); say((e as Error).message); }
  };
  return (
    <div className="card">
      <h2 className="step-title"><span className="n">2</span>조건 정하기 <span className="small">{p.name} · 정가 {won(p.price)}</span></h2>
      <div className="form">
        <label>목표 수량<input type="number" min={1} value={String(f.targetQty)} onChange={set("targetQty")} /><span className="hint">가마 1회분·원단 1롤처럼 생산이 가능한 최소 수량</span></label>
        <label>공구가 (원)<input type="number" min={0} step={500} value={String(f.dealPrice)} onChange={set("dealPrice")} /><span className="hint">정가보다 낮아야 해요{Number(f.dealPrice) > 0 && Number(f.dealPrice) < p.price ? ` · ${Math.round((1 - Number(f.dealPrice) / p.price) * 100)}% 할인` : ""}</span></label>
        <label>원가 (원)<input type="number" min={0} step={500} value={String(f.costPrice)} onChange={set("costPrice")} /><span className="hint">고객에게 보이지 않아요. 마진 계산에만 써요</span></label>
        <label>1인 최대 수량<input type="number" min={1} max={5} value={String(f.perMemberLimit)} onChange={set("perMemberLimit")} /></label>
        <label>마감 일시<input type="datetime-local" value={String(f.deadline)} onChange={set("deadline")} /><span className="hint">한국 시간 · 이 시각에 목표 달성 여부를 판정해요</span></label>
        <label>결제 기간<select value={String(f.payWindowHours)} onChange={set("payWindowHours")}><option value="72">달성 후 72시간</option><option value="48">달성 후 48시간</option></select></label>
        <label>예상 출고일<input type="date" value={String(f.shipEta)} onChange={set("shipEta")} /><span className="hint">고객에게 그대로 보여요</span></label>
        <label style={{ alignContent: "end" }}><span><input type="checkbox" checked={!!f.confirmBelowCost} onChange={set("confirmBelowCost")} /> 원가 미만이어도 열기</span></label>
      </div>
      <div><button className="btn" onClick={preview}>미리보기 · 초대 대상 확인</button></div>
      {err && <p className="err" role="alert">{err}</p>}
      {pv && (
        <>
          <div className="kpi many">
            {pv.audience.consentChecked && <div><small>찜</small><strong>{pv.audience.wishlist}</strong></div>}
            <div><small>장바구니</small><strong>{pv.audience.cart}</strong></div>
            <div><small>중복 제외</small><strong>{pv.audience.unique}</strong></div>
            <div className="hl"><small>{pv.audience.consentChecked ? "문자 발송 대상 (수신 동의)" : "초대 대상 (최대)"}</small><strong>{pv.audience.reachable}</strong></div>
          </div>
          {!pv.audience.consentChecked && <p className="small">문자 수신을 거부한 고객은 카페24가 발송할 때 자동으로 빼요. 실제 받는 사람은 이보다 적을 수 있어요.</p>}
          {pv.marginPerUnit != null && <p className="muted">개당 마진 {won(pv.marginPerUnit)}</p>}
          <p className="muted">초대 문자 발송: {kst(pv.sendAt)} (밤 9시~오전 8시는 자동으로 미뤄요)</p>
          <p className="msg">{pv.message}</p>
          {pv.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
          {pv.errors.length ? <div className="err" role="alert">{pv.errors.map((e) => <div key={e}>{e}</div>)}</div> : (
            <div className="actions"><b>{a.role === "admin" ? "판매자에게 조건을 다시 읽어 주고 동의를 받았나요?" : "조건을 확인했나요? 열면 쿠폰이 만들어지고, 수신 동의 고객에게 초대 문자가 예약돼요."}</b>
              <button className="btn brand" disabled={busy} onClick={open}>{busy ? "여는 중…" : `공구 열기 · 초대 ${pv.audience.reachable}명 예약`}</button></div>
          )}
        </>
      )}
    </div>
  );
}
