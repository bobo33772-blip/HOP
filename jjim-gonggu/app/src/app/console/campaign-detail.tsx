"use client";

// 공구 상세: 진행률 · 퍼널 · 문자 · 리포트 링크 · 미달 뒤 그래도 진행 · 생산 결정 기록 · 모집 중 공구 취소(#66). 운영자 OP-4(모집 → 판정 → 결제 대사) / 판매자 S-09 · S-10 · S-11.
// 운영자만: 수동 판정 · 대사 · 문자 재발송 · 확인할 일.

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Detail } from "./types";
import { chip, kst, msgKind, pct, smsError, won } from "./format";
import { DECISION_CONFIRM_RATIO, decisionNeedsConfirm } from "@/lib/core/campaign";
import { CancelSheet } from "./cancel-sheet";

const MSG_STATUS = { sent: ["발송", "ok"], failed: ["실패", "bad"], scheduled: ["예약", "warn"], sending: ["보내는 중", "open"] } as const;
const ISSUE_LABEL: Record<string, string> = {
  coupon_missing: "쿠폰 발급 누락", judge_incomplete: "판정 뒤 쿠폰·안내 멈춤 (자동 재시도 중)", reconcile_mismatch: "대사 불일치", reconcile_fixed: "대사로 고침", sms_failed: "문자 발송 실패",
  invite_not_sent: "초대 문자 못 보냄", ad_label_missing: "(광고) 표기 누락", orphan_coupon: "저장 안 된 쿠폰",
  over_pledge: "신청보다 많이 구매 (넘친 수량은 확정에서 뺌)",
};

export function CampaignDetail({ id, say, onChanged }: { id: string; say: (t: string) => void; onChanged: () => void }) {
  const a = useConsole();
  const isAdmin = a.role === "admin";
  const [d, setD] = useState<Detail | null>(null);
  const [now, setNow] = useState<number>(0);
  const [dq, setDq] = useState("");
  const [dn, setDn] = useState("");
  const [bigOk, setBigOk] = useState(false);
  const [priceMode, setPriceMode] = useState<"same" | "new">("same");
  const [newPrice, setNewPrice] = useState("");
  const [belowCost, setBelowCost] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const load = useCallback(async () => {
    const [detail, clock] = await Promise.all([a.call<Detail>("GET", `${a.campaignBase}/${id}`), a.call<{ now: string }>("GET", a.now)]);
    setD(detail);
    setNow(new Date(clock.now).getTime());
    setDq(String(detail.report.confirmed.qty));
  }, [a, id]);
  useEffect(() => { load().catch((e) => say(e.message)); }, [load, say]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const r = d.report, c = r.campaign;
  const [label, cls] = chip(c.state, !!c.proceededAt);
  const p = d.proceed;
  const big = decisionNeedsConfirm(Number(dq), r.confirmed.qty);
  // 취소는 모집 중이고 마감 전인 공구만 (#65). 달성 뒤에는 쿠폰 · 결제가 있을 수 있어 버튼을 두지 않는다
  const cancellable = c.state === "open" && now > 0 && now < new Date(c.deadlineAt).getTime();
  const act = async (path: string, msg: (j: Record<string, unknown>) => string, body?: unknown) => {
    try { const j = await a.call<Record<string, unknown>>("POST", path, body ?? {}); say(msg(j)); await load(); onChanged(); } catch (e) { say((e as Error).message); }
  };
  const copy = async () => {
    const u = `${location.origin}/r/${d.reportToken}`;
    try { await navigator.clipboard.writeText(u); say("리포트 링크를 복사했어요"); } catch { say(u); }
  };
  const todo = buildTodo(d, now);
  const judged = c.state === "reached" || c.state === "settled";
  const daysTo = (iso: string | null) => (iso && now ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000)) : null);
  const dd = (iso: string | null) => { const n = daysTo(iso); return n == null ? "" : n === 0 ? "D-DAY" : `D-${n}`; };
  const mBadge = c.state === "open" ? dd(c.deadlineAt) : c.state === "reached" ? `결제 ${dd(c.payUntil)}` : "";
  const mMeta = c.state === "reached" ? `결제 마감 ${kst(c.payUntil)} · 공구가 ${won(c.dealPrice)}` : `마감 ${kst(c.deadlineAt)} · 공구가 ${won(c.dealPrice)}`;
  const KPI: [string, string][] = [
    ["초대", `${r.funnel.invited}명`], ["신청 수량", `${r.funnel.pledgedQty}개`], ["쿠폰 발급", `${r.funnel.couponIssued}명`],
    ["확정 수량", judged ? `${r.confirmed.qty}개` : "–"], ["초대→신청", pct(r.rates.inviteToPledge)], ["신청→결제", pct(r.rates.pledgeToPaid)],
  ];
  return (
    <div className="card cd">
      <div className="cd-main">
        {/* 머리: 넓은 화면은 이름 + 상태 · 가격 줄 · 리포트 링크, 휴대폰은 상태 · D-day 위에 큰 이름 */}
        <div className="cd-head only-w">
          <div><div className="row"><h2>{c.productName}</h2><span className={`chip ${cls}`}>{label}</span></div>
            <p className="muted"><span className="mono">{c.listPrice.toLocaleString("ko-KR")} → {c.dealPrice.toLocaleString("ko-KR")}</span> · 목표 {c.targetQty}개 · 마감 {kst(c.deadlineAt)} · 출고 {c.shipEta}</p></div>
          <button className="ghost" onClick={copy}>{isAdmin ? "판매자 리포트 링크 복사" : "리포트 링크 복사"}</button>
        </div>
        {/* 휴대폰: 상태 · 이름 · 결제 · 표를 카드 하나로 (C 시안). 넓은 화면에서는 틀 없이 그대로 */}
        <div className="cd-sum">
        <div className="cd-mhead only-m">
          <span className="row"><span className={`chip ${cls}`}>{label}</span>{mBadge && <span className="dd">{mBadge}</span>}</span>
          <b>{c.productName}</b>
          <span className="muted">{mMeta}</span>
        </div>
        {c.proceededAt && <p className="small">목표에 못 미쳤지만 {kst(c.proceededAt)}에 그래도 진행했어요. 4주 판정표의 공구 성사율에서는 빠져요.</p>}
        {c.state === "cancelled" && <p className="small">모집 중에 취소한 공구예요. 신청한 고객에게는 취소 안내 문자가 가고, 결제된 금액은 없어요. 같은 상품으로 새 공구를 열 수 있어요.</p>}

        <div className="cd-kpis only-w">{KPI.map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>
        {judged && <PayBar r={r} />}
        {/* 휴대폰: 목표 · 신청 · 결제를 한 표로 (C 시안) */}
        <div className="only-m"><StatusTable r={r} /></div>
        </div>
        {r.confirmed.expected != null && <p className="small only-w">결제 기간 중 예상 확정 수량 {r.confirmed.expected}개 (결제분과 신청×60% 중 큰 값)</p>}
        <div className="only-m"><NextToDo d={d} now={now} /></div>

        <div className={isAdmin ? "cd-msgs" : "cd-msgs only-w"}>
          <h3>문자</h3>
          {/* 휴대폰 폭에서 "85명"·"결과 안내"가 글자 중간에서 끊기지 않게 단어 단위로만 줄을 바꾼다 (#8). 마지막 칸은 운영자 '다시 보내기' 자리라 운영자에게만 그린다 */}
          <div className="tw"><table style={{ wordBreak: "keep-all" }}>
            <thead><tr><th>종류</th><th className="n">대상</th><th>상태</th><th>발송 예정 · 완료</th>{isAdmin && <th />}</tr></thead>
            <tbody>{d.messages.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: "nowrap" }}>{msgKind(m.kind)}</td>
                <td className="n mono" style={{ whiteSpace: "nowrap" }}>{m.recipients}명</td>
                <td><span className={`ms ms-${MSG_STATUS[m.status][1]}`}>{MSG_STATUS[m.status][0]}</span>{m.error && <div className="small" title={isAdmin ? m.error : undefined}>{smsError(m.error, m.status)}</div>}</td>
                <td>{kst(m.sentAt ?? m.sendAfter)}</td>
                {isAdmin && <td>{(m.status === "failed" || m.status === "sending") && <button className="ghost" onClick={() => act(`/api/admin/messages/${m.id}/retry`, () => "다시 보내도록 예약했어요")}>다시 보내기</button>}</td>}
              </tr>
            ))}</tbody>
          </table></div>
          <details><summary>문자 내용 보기</summary>{d.messages.map((m) => <p key={m.id} className="msg" style={{ marginTop: 8 }}>{m.content}</p>)}</details>
        </div>
        {isAdmin && <h3 style={{ fontSize: 16, margin: 0 }}>확인할 일 {d.issues.length > 0 && <span className="chip bad">{d.issues.length}</span>}</h3>}
        {!isAdmin ? null : d.issues.length ? (
          <div className="tw"><table><tbody>{d.issues.map((i) => (
            <tr key={i.id}><td>{kst(i.at)}</td><td><b>{ISSUE_LABEL[i.kind] ?? i.kind}</b></td><td className="small">{JSON.stringify(i.detail)}</td></tr>
          ))}</tbody></table></div>
        ) : <p className="muted">없어요.</p>}
      </div>

      {/* 오른쪽: 이 공구에서 할 일 (웹 시안). 휴대폰에서는 NEXT TO DO 아래로 이어진다 */}
      <aside className="cd-side">
        <b className="only-w">이 공구에서 할 일</b>
        {todo.todo[0] && (
          <div className="callout cd-now only-w"><b>{todo.todo[0].dd ? `${todo.todo[0].t.includes("결제 마감") ? "결제 마감" : "마감"} ${todo.todo[0].dd}` : todo.todo[0].t}</b><span>{todo.todo[0].dd ? `${todo.todo[0].t} · ${todo.todo[0].sub}` : todo.todo[0].sub}</span></div>
        )}
        {p && (
          <div className="cd-box">
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
        {c.state === "settled" ? (
          <div className="cd-box">
            <b>{isAdmin ? "원씽 기록: 판매자가 이 확정 수량으로 생산·발주를 결정했나요?" : "확정 뒤 생산 · 발주 결정"}</b>
            {c.decision ? <p style={{ margin: 0 }}>기록됨: {c.decision.qty}개 · {c.decision.note} <span className="small">({kst(c.decision.at)})</span></p> : (
              <>
                <span className="muted">확정 수량 {r.confirmed.qty}개를 보고 만들 수량과 근거(발주서 번호 등)를 기록해요.</span>
                <div className="form">
                  {/* 확정 수량이 미리 채워져 있어 누르면 전체 선택: 이어 치면 29 → 2930이 되는 실수를 막는다 */}
                  <label>생산 · 발주 수량<input type="number" min={1} value={dq} onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setDq(e.target.value); setBigOk(false); }} /></label>
                  <label>확인 근거<input maxLength={300} placeholder="발주서 번호, 가마 일정 등" value={dn} onChange={(e) => setDn(e.target.value)} /></label>
                </div>
                {big && bigOk && <p className="small" role="alert">확정 수량({r.confirmed.qty}개)의 {DECISION_CONFIRM_RATIO}배가 넘어요. 최소 생산 단위 때문이라면 그대로 기록하고, 잘못 쳤다면 수량을 고쳐 주세요.</p>}
                <div>
                  <button className="btn" onClick={() => {
                    if (big && !bigOk) { setBigOk(true); return; }
                    act(`${a.campaignBase}/${id}/decision`, () => "생산 결정을 기록했어요", { qty: Number(dq), note: dn, confirmLarge: big });
                  }}>{big && bigOk ? `${Number(dq).toLocaleString("ko-KR")}개가 맞아요 · 기록` : "결정 기록"}</button>
                </div>
              </>
            )}
          </div>
        ) : (c.state === "open" || c.state === "reached") && (
          <div className="cd-box only-w">
            <b>확정 뒤 생산 · 발주 결정</b>
            <span className="muted">결제 기간이 끝나 확정되면 여기에서 생산 수량과 근거(발주서 번호 등)를 기록해요.</span>
            <span className="cd-ph"><span>생산 · 발주 수량</span><span>확인 근거</span></span>
          </div>
        )}
        {isAdmin && (
          <div className="actions">
            <button className="ghost" disabled={!(c.state === "open" && now >= new Date(c.deadlineAt).getTime())} onClick={() => act(`${a.campaignBase}/${id}/judge`, () => "판정했어요")}>마감 판정 실행</button>
            <button className="ghost" disabled={!["reached", "settled"].includes(c.state)} onClick={() => act(`${a.campaignBase}/${id}/reconcile`, (j) => `주문 ${j.checked}건을 대조했어요`)}>주문 대사 실행</button>
          </div>
        )}
        <div className="cd-foot">
          {cancellable ? <button className="ghost danger" onClick={() => setCancelOpen(true)}>공구 취소</button> : <span className="small only-w">공구 취소는 모집 중이고 마감 전인 공구에만 보여요.</span>}
        </div>
      </aside>

      {/* 휴대폰 맨 아래: 리포트 링크 · 매출 리포트 (C 시안) */}
      <div className="cd-mact only-m">
        <button type="button" onClick={copy}>리포트 링크 복사</button>
        {!isAdmin && <a href="/radar">매출 리포트</a>}
      </div>

      {cancelOpen && (
        <CancelSheet productName={c.productName} pledgers={r.funnel.pledgers} onClose={() => setCancelOpen(false)}
          onConfirm={async (reason) => {
            // 실패하면 창을 그대로 두고 이유를 보여 준다 (예: 그새 마감이 지났어요)
            try {
              const j = await a.call<{ notified: number }>("POST", `${a.campaignBase}/${id}/cancel`, { reason });
              setCancelOpen(false);
              say(`공구를 취소했어요${j.notified > 0 ? ` · 취소 안내 문자 ${j.notified}명` : ""}`);
              await load(); onChanged();
            } catch (e) { say((e as Error).message); }
          }} />
      )}
    </div>
  );
}

/** 결제 현황 막대: 쿠폰 받은 사람 중 결제한 사람(보라) · 기다리는 사람(옅은 주황) */
function PayBar({ r }: { r: Detail["report"] }) {
  const c = r.campaign, got = r.funnel.couponIssued, paid = r.funnel.paidMembers, wait = r.confirmed.unpaidMembers;
  const ratio = got ? paid / got : 0;
  return (
    <div className="cd-pay">
      <span className="row only-w"><b>결제 현황</b><span className="muted">쿠폰 받은 {got}명 중 <b>{paid}명 결제</b>{c.state === "reached" ? ` · 대기 ${wait}명 · ${kst(c.payUntil)} 마감` : ""}</span></span>
      <span className="row only-m"><b>{got}명 중 <em>{paid}명</em> 결제했어요</b><b className="mono">{Math.round(ratio * 100)}%</b></span>
      <span className="bar2" aria-hidden="true"><i style={{ width: `${ratio * 100}%` }} /><i className="w" style={{ width: `${got ? (wait / got) * 100 : 0}%` }} /></span>
      <span className="legend only-m"><span><i />결제 완료 {paid}명</span>{c.state === "reached" && <span><i className="w" />결제 대기 {wait}명</span>}</span>
    </div>
  );
}

/** 공구 숫자 표: 목표 · 신청 · (모집 중) 남은 수량 / (판정 뒤) 결제 완료 · 결제 대기. 금액은 공구가 기준 */
function StatusTable({ r }: { r: Detail["report"] }) {
  const c = r.campaign, f = r.funnel;
  const left = Math.max(0, c.targetQty - f.pledgedQty);
  const judged = c.state !== "open" && c.state !== "cancelled";
  const rows: [string, string, string, string, string?][] = [
    ["목표", "–", `${c.targetQty}개`, won(c.targetQty * c.dealPrice)],
    [judged ? "신청 · 쿠폰 받음" : "신청", `${f.pledgers}명`, `${f.pledgedQty}개`, won(f.pledgedQty * c.dealPrice), judged ? undefined : "hl"],
  ];
  if (c.state === "open") rows.push(["남은 수량", "–", `${left}개`, won(left * c.dealPrice)]);
  if (judged) {
    rows.push(["결제 완료", `${f.paidMembers}명`, `${r.confirmed.qty}개`, won(r.confirmed.revenue), "hl"]);
    if (c.state === "reached" && r.confirmed.unpaidMembers > 0) rows.push(["결제 대기", `${r.confirmed.unpaidMembers}명`, "–", "–", "wait"]);
  }
  return (
    <div className="stat-table">
      <table>
        <caption className="sr">공구 목표 · 신청 · 결제 현황</caption>
        <thead><tr><th scope="col">구분</th><th scope="col">인원</th><th scope="col">수량</th><th scope="col">금액</th></tr></thead>
        <tbody>
          {rows.map(([k, n, q, w, cls]) => <tr key={k} className={cls}><th scope="row">{k}</th><td>{n}</td><td>{q}</td><td>{w}</td></tr>)}
          {c.state === "open" && <tr className="dim"><th scope="row">결제</th><td colSpan={3}>목표를 채우면 결제가 시작돼요</td></tr>}
        </tbody>
      </table>
      <p className="small">한 사람이 여러 개를 신청할 수 있어서 인원과 수량이 다를 수 있어요. {judged ? "결제 기간이 끝나면 결제 완료 줄이 확정 수량이 돼요." : ""}</p>
    </div>
  );
}

/** 할 일 · 한 일 목록: NEXT TO DO(휴대폰)와 '이 공구에서 할 일'(넓은 화면)이 같이 쓴다. 상태와 문자 기록에서 만든다 */
function buildTodo(d: Detail, now: number) {
  const c = d.report.campaign;
  const todo: { t: string; sub: string; dd?: string }[] = [];
  const done: { t: string; at: string }[] = [];
  if (!now || c.state === "cancelled") return { todo, done };
  const dday = (iso: string | null) => {
    if (!iso) return "";
    const n = Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
    return n <= 0 ? "D-DAY" : `D-${n}`;
  };
  if (c.state === "open") {
    todo.push({ t: `${kst(c.deadlineAt)} 마감 판정`, sub: `목표 ${c.targetQty}개가 모이면 신청자에게 쿠폰이 자동으로 나가요`, dd: dday(c.deadlineAt) });
    todo.push({ t: "결제 기간", sub: "목표를 채우면 결제된 만큼이 확정 수량이 돼요" });
  }
  if (c.state === "reached") todo.push({ t: `${kst(c.payUntil)} 결제 마감`, sub: d.report.confirmed.unpaidMembers > 0 ? `아직 결제 안 한 고객 ${d.report.confirmed.unpaidMembers}명` : "쿠폰 받은 고객이 모두 결제했어요", dd: dday(c.payUntil) });
  for (const m of d.messages.filter((m) => m.status === "scheduled" || m.status === "sending")) todo.push({ t: `${msgKind(m.kind)} 문자 ${m.recipients}명`, sub: `${kst(m.sendAfter)} 자동 발송 예약` });
  if (d.proceed?.proceedOpen) todo.push({ t: "그래도 진행할지 정하기", sub: `${kst(d.proceed.proceedUntil)}까지 · '그래도 살래요' ${d.proceed.wanted.members}명` });
  if ((c.state === "open" || c.state === "reached" || c.state === "settled") && !c.decision) todo.push({ t: "생산 · 발주 결정 기록", sub: "확정 수량을 보고 만들 수량을 적어요" });
  done.push(
    ...d.messages.filter((m) => m.status === "sent" || m.status === "failed").map((m) => ({ t: `${msgKind(m.kind)} 문자 ${m.recipients}명${m.status === "failed" ? " (실패)" : ""}`, at: kst(m.sentAt ?? m.sendAfter) })),
    ...(c.state !== "open" ? [{ t: c.state === "failed" ? "마감 판정 · 목표 미달" : "마감 판정 · 목표 달성", at: kst(c.deadlineAt) }] : []),
    ...(c.decision ? [{ t: `생산 · 발주 결정 ${c.decision.qty}개`, at: kst(c.decision.at) }] : []),
  );
  return { todo, done };
}

/** NEXT TO DO: 지금 할 일(NOW) 하나를 크게, 그다음 할 일, 한 일(DONE)을 나눠 보여 준다 */
function NextToDo({ d, now }: { d: Detail; now: number }) {
  const c = d.report.campaign;
  if (!now || c.state === "cancelled") return null;
  const { todo, done } = buildTodo(d, now);
  const [first, ...rest] = todo;
  return (
    <section className="todo" aria-labelledby={`todo-${c.id}`}>
      <div className="row"><h3 id={`todo-${c.id}`}>NEXT TO DO</h3><span className="small">할 일 {todo.length} · 한 일 {done.length}</span></div>
      {first ? (
        <div className="todo-now"><span className="row"><span className="tag">NOW</span>{first.dd && <b>{first.dd}</b>}</span><b className="t">{first.t}</b><span>{first.sub}</span></div>
      ) : <p className="muted">남은 할 일이 없어요.</p>}
      {rest.length > 0 && <ol className="todo-next">{rest.map((x, i) => <li key={x.t}><span className="n" aria-hidden="true">{i + 2}</span><span><b>{x.t}</b><small>{x.sub}</small></span></li>)}</ol>}
      {done.length > 0 && (
        <div className="todo-done"><span className="tag">DONE</span>
          {done.map((x) => <span key={x.t + x.at} className="row"><s>{x.t}</s><small>{x.at}</small></span>)}
        </div>
      )}
    </section>
  );
}
