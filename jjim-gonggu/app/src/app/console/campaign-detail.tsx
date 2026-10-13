"use client";

// 공구 상세: 진행률 · 퍼널 · 문자 · 리포트 링크 · 미달 뒤 그래도 진행 · 생산 결정 기록. 운영자 OP-4(모집 → 판정 → 결제 대사) / 판매자 S-09 · S-10 · S-11.
// 운영자만: 수동 판정 · 대사 · 문자 재발송 · 확인할 일.

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Detail } from "./types";
import { CHIP, kst, pct, won } from "./format";

const MSG_STATUS = { sent: ["발송", "ok"], failed: ["실패", "bad"], scheduled: ["예약", "warn"], sending: ["보내는 중", "open"] } as const;
const ISSUE_LABEL: Record<string, string> = {
  coupon_missing: "쿠폰 발급 누락", reconcile_mismatch: "대사 불일치", reconcile_fixed: "대사로 고침", sms_failed: "문자 발송 실패",
  invite_not_sent: "초대 문자 못 보냄", ad_label_missing: "(광고) 표기 누락", orphan_coupon: "저장 안 된 쿠폰",
};

export function CampaignDetail({ id, say, onChanged }: { id: string; say: (t: string) => void; onChanged: () => void }) {
  const a = useConsole();
  const isAdmin = a.role === "admin";
  const [d, setD] = useState<Detail | null>(null);
  const [now, setNow] = useState<number>(0);
  const [dq, setDq] = useState("");
  const [dn, setDn] = useState("");
  const [priceMode, setPriceMode] = useState<"same" | "new">("same");
  const [newPrice, setNewPrice] = useState("");
  const [belowCost, setBelowCost] = useState(false);
  const load = useCallback(async () => {
    const [detail, clock] = await Promise.all([a.call<Detail>("GET", `${a.campaignBase}/${id}`), a.call<{ now: string }>("GET", a.now)]);
    setD(detail);
    setNow(new Date(clock.now).getTime());
    setDq(String(detail.report.confirmed.qty));
  }, [a, id]);
  useEffect(() => { load().catch((e) => say(e.message)); }, [load, say]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const r = d.report, c = r.campaign;
  const [label, cls] = c.proceededAt && c.state === "reached" ? ["그래도 진행 · 결제 기간", "ok"] : CHIP[c.state];
  const p = d.proceed;
  const act = async (path: string, msg: (j: Record<string, unknown>) => string, body?: unknown) => {
    try { const j = await a.call<Record<string, unknown>>("POST", path, body ?? {}); say(msg(j)); await load(); onChanged(); } catch (e) { say((e as Error).message); }
  };
  const copy = async () => {
    const u = `${location.origin}/r/${d.reportToken}`;
    try { await navigator.clipboard.writeText(u); say("리포트 링크를 복사했어요"); } catch { say(u); }
  };
  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div className="row"><h2 style={{ fontSize: 19, margin: 0 }}>{c.productName}</h2><span className={`chip ${cls}`}>{label}</span></div>
      <p className="muted">{won(c.listPrice)} → {won(c.dealPrice)} · 목표 {c.targetQty}개 · 마감 {kst(c.deadlineAt)} · 출고 {c.shipEta}</p>
      {c.proceededAt && <p className="small">목표에 못 미쳤지만 {kst(c.proceededAt)}에 그래도 진행했어요. 4주 판정표의 공구 성사율에서는 빠져요.</p>}
      <div className="kpi many">
        <div><small>초대</small><strong>{r.funnel.invited}</strong></div>
        <div><small>신청 수량</small><strong>{r.funnel.pledgedQty}</strong></div>
        <div><small>쿠폰 발급</small><strong>{r.funnel.couponIssued}</strong></div>
        <div className="hl"><small>확정 수량</small><strong>{r.confirmed.qty}</strong></div>
        <div><small>초대→신청</small><strong>{pct(r.rates.inviteToPledge)}</strong></div>
        <div><small>신청→결제</small><strong>{pct(r.rates.pledgeToPaid)}</strong></div>
      </div>
      {r.confirmed.expected != null && <p className="small">결제 기간 중 예상 확정 수량 {r.confirmed.expected}개 (결제분과 신청×60% 중 큰 값)</p>}
      <div className="actions">
        <button className="ghost" onClick={copy}>{isAdmin ? "판매자 리포트 링크 복사" : "리포트 링크 복사 (공방·공장 공유용)"}</button>
        {isAdmin && <>
          <button className="ghost" disabled={!(c.state === "open" && now >= new Date(c.deadlineAt).getTime())} onClick={() => act(`${a.campaignBase}/${id}/judge`, () => "판정했어요")}>마감 판정 실행</button>
          <button className="ghost" disabled={!["reached", "settled"].includes(c.state)} onClick={() => act(`${a.campaignBase}/${id}/reconcile`, (j) => `주문 ${j.checked}건을 대조했어요`)}>주문 대사 실행</button>
        </>}
      </div>
      {p && (
        <div className="card" style={{ background: "var(--soft)" }}>
          <b>그래도 진행할까요?</b>
          <p style={{ margin: 0 }}>&lsquo;그래도 살래요&rsquo;를 누른 고객 <b>{p.wanted.members}명 · {p.wanted.qty}개</b>
            <span className="small"> · {p.proceedOpen ? `${kst(p.proceedUntil)}까지 정할 수 있어요` : "정할 수 있는 기간이 지났어요"}</span></p>
          {p.proceedOpen && (
            <>
              <div className="form">
                <label>진행 가격<select value={priceMode} onChange={(e) => setPriceMode(e.target.value as "same" | "new")}><option value="same">원래 공구가 {won(c.dealPrice)}</option><option value="new">새 가격 입력</option></select></label>
                {priceMode === "new" && <label>새 가격 (원)<input type="number" min={0} step={500} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} /><span className="hint">정가 {won(c.listPrice)}보다 낮게</span></label>}
                {priceMode === "new" && p.costPrice != null && Number(newPrice) > 0 && Number(newPrice) < p.costPrice && (
                  <label style={{ alignContent: "end" }}><span><input type="checkbox" checked={belowCost} onChange={(e) => setBelowCost(e.target.checked)} /> 원가 미만이어도 진행</span></label>
                )}
              </div>
              <p className="small">진행하면 새 쿠폰을 만들어 &lsquo;그래도 살래요&rsquo; 고객에게만 주고 안내 문자를 보내요. 결제 기간은 지금부터 {p.payWindowHours}시간이에요.</p>
              <div><button className="btn" disabled={p.wanted.members === 0 || (priceMode === "new" && !newPrice)}
                onClick={() => act(`${a.campaignBase}/${id}/proceed`, () => "그래도 진행했어요. 쿠폰과 안내 문자를 보내요", { price: priceMode === "new" ? Number(newPrice) : null, confirmBelowCost: belowCost })}>
                그래도 진행하기 · 쿠폰 {p.wanted.members}명</button></div>
            </>
          )}
        </div>
      )}
      {c.state === "settled" && (
        <div className="card" style={{ background: "var(--soft)" }}>
          <b>{isAdmin ? "원씽 기록: 판매자가 이 확정 수량으로 생산·발주를 결정했나요?" : "이 확정 수량으로 생산·발주를 결정했나요?"}</b>
          {c.decision ? <p style={{ margin: 0 }}>기록됨: {c.decision.qty}개 · {c.decision.note} <span className="small">({kst(c.decision.at)})</span></p> : (
            <>
              <div className="form">
                <label>생산·발주 수량<input type="number" min={1} value={dq} onChange={(e) => setDq(e.target.value)} /></label>
                <label>확인 근거 (발주서 번호, 가마 일정 등)<input maxLength={300} value={dn} onChange={(e) => setDn(e.target.value)} /></label>
              </div>
              <div><button className="btn" onClick={() => act(`${a.campaignBase}/${id}/decision`, () => "생산 결정을 기록했어요", { qty: Number(dq), note: dn })}>결정 기록</button></div>
            </>
          )}
        </div>
      )}
      <h3 style={{ fontSize: 16, margin: 0 }}>문자</h3>
      <div className="tw"><table>
        <thead><tr><th>종류</th><th>대상</th><th>상태</th><th>발송 예정·완료</th><th /></tr></thead>
        <tbody>{d.messages.map((m) => (
          <tr key={m.id}>
            <td>{m.kind === "invite_ad" ? "초대 (광고)" : m.kind === "pay_reminder" ? "결제 안내" : m.kind === "proceed" ? "진행 안내" : "결과 안내"}</td>
            <td className="mono">{m.recipients}명</td>
            <td><span className={`chip ${MSG_STATUS[m.status][1]}`}>{MSG_STATUS[m.status][0]}</span>{m.error && <div className="small">{m.error}</div>}</td>
            <td>{kst(m.sentAt ?? m.sendAfter)}</td>
            <td>{isAdmin && (m.status === "failed" || m.status === "sending") && <button className="ghost" onClick={() => act(`/api/admin/messages/${m.id}/retry`, () => "다시 보내도록 예약했어요")}>다시 보내기</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <details><summary>문자 내용 보기</summary>{d.messages.map((m) => <p key={m.id} className="msg" style={{ marginTop: 8 }}>{m.content}</p>)}</details>
      {isAdmin && <h3 style={{ fontSize: 16, margin: 0 }}>확인할 일 {d.issues.length > 0 && <span className="chip bad">{d.issues.length}</span>}</h3>}
      {!isAdmin ? null : d.issues.length ? (
        <div className="tw"><table><tbody>{d.issues.map((i) => (
          <tr key={i.id}><td>{kst(i.at)}</td><td><b>{ISSUE_LABEL[i.kind] ?? i.kind}</b></td><td className="small">{JSON.stringify(i.detail)}</td></tr>
        ))}</tbody></table></div>
      ) : <p className="muted">없어요.</p>}
    </div>
  );
}
