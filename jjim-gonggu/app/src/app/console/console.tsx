"use client";

// 공구 관리 화면 부품. 운영자 화면(/admin)과 판매자 화면(/campaigns)이 같이 쓰고, 부르는 주소만 다르다.
// 운영자만: 수동 판정·대사·문자 재발송·확인할 일·4주 판정표.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type State = "open" | "reached" | "failed" | "settled";
export interface Mall { mallId: string; brandName: string | null; optOutNumber: string | null; smsSender: string | null }
export interface Camp { id: string; state: State; productName: string; targetQty: number; pledgedQty: number; deadlineAt: string; payUntil: string | null }
export interface Report {
  campaign: { id: string; productName: string; state: State; listPrice: number; dealPrice: number; targetQty: number; deadlineAt: string; payUntil: string | null; shipEta: string; decision: { qty: number; note: string; at: string } | null };
  funnel: { invited: number; invitedSent: number; pledgers: number; invitedPledgers: number; pledgedQty: number; couponIssued: number; paidMembers: number };
  confirmed: { qty: number; revenue: number; unpaidMembers: number; cancelledOrders: number; lateOrders: number; successFee: number; expected: number | null };
  rates: { inviteToPledge: number | null; pledgeToPaid: number | null };
}
export interface Detail {
  report: Report; reportToken: string;
  messages: { id: string; kind: string; recipients: number; content: string; status: "scheduled" | "sending" | "sent" | "failed"; sendAfter: string; sentAt: string | null; error: string | null }[];
  issues: { id: number; at: string; kind: string; detail: unknown }[];
}
export interface RadarRow { productNo: number; name: string; price: number; soldOut: boolean; wishlist: number; cart: number }
export interface Run { status: "running" | "done" | "failed"; total: number; done: number; finishedAt: string | null; startedAt: string }
export interface Preview {
  errors: string[]; warnings: string[]; message: string; sendAt: string; marginPerUnit: number | null;
  audience: { wishlist: number; cart: number; unique: number; reachable: number };
}

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toFixed(1)}%`);
export const kst = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "–";
const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const CHIP: Record<State, [string, string]> = { open: ["진행 중", "open"], reached: ["달성 · 결제 기간", "ok"], failed: ["진행 안 됨", "bad"], settled: ["확정 완료", "ok"] };
const MSG_STATUS = { sent: ["발송", "ok"], failed: ["실패", "bad"], scheduled: ["예약", "warn"], sending: ["보내는 중", "open"] } as const;
const ISSUE_LABEL: Record<string, string> = {
  coupon_missing: "쿠폰 발급 누락", reconcile_mismatch: "대사 불일치", reconcile_fixed: "대사로 고침", sms_failed: "문자 발송 실패",
  invite_not_sent: "초대 문자 못 보냄", ad_label_missing: "(광고) 표기 누락", orphan_coupon: "저장 안 된 쿠폰",
};

export interface ConsoleApi {
  role: "admin" | "seller";
  mallBase: string; // 몰 단위 주소: 운영자 /api/admin/malls/<몰>, 판매자 /api/seller
  campaignBase: string; // 공구 단위 주소: 운영자 /api/admin/campaigns, 판매자 /api/seller/campaigns
  now: string; // 엔진 시계
  loginUrl: string; // 세션이 끊기면 보낼 곳
}

type Console = ConsoleApi & { call<T>(method: string, path: string, body?: unknown): Promise<T> };
const Ctx = createContext<Console | null>(null);

export function ConsoleProvider({ api, children }: { api: ConsoleApi; children: React.ReactNode }) {
  const [value] = useState<Console>(() => ({
    ...api,
    async call<T>(method: string, path: string, body?: unknown): Promise<T> {
      const r = await fetch(path, { method, cache: "no-store", headers: { "Content-Type": "application/json", "X-JJG": "1" }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (r.status === 401) { location.href = api.loginUrl; throw new Error("로그인이 필요해요"); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string }).message ?? "요청에 실패했어요");
      return j as T;
    },
  }));
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useConsole(): Console {
  const c = useContext(Ctx);
  if (!c) throw new Error("ConsoleProvider가 필요해요");
  return c;
}

/** 화면 아래 잠깐 뜨는 안내 */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 2600); }, []);
  return { say, node: toast ? <div className="toast" role="status">{toast}</div> : null };
}

export function ProfileCard({ mall, onSaved, say, always = false }: { mall: Mall; onSaved: () => void; say: (t: string) => void; always?: boolean }) {
  const a = useConsole();
  const [v, setV] = useState({ brandName: mall.brandName ?? "", smsSender: mall.smsSender ?? "", optOutNumber: mall.optOutNumber ?? "" });
  useEffect(() => setV({ brandName: mall.brandName ?? "", smsSender: mall.smsSender ?? "", optOutNumber: mall.optOutNumber ?? "" }), [mall]);
  const complete = !!(mall.brandName && mall.smsSender && /^[0-9-]{8,20}$/.test(mall.optOutNumber ?? ""));
  if (complete && !always) return null;
  const save = async () => { try { await a.call("POST", `${a.mallBase}/profile`, v); onSaved(); } catch (e) { say((e as Error).message); } };
  return (
    <div className="card" style={complete ? undefined : { borderColor: "var(--warning)" }}>
      <b>{complete ? "쇼핑몰 정보" : "먼저 쇼핑몰 정보를 등록해 주세요"}</b>
      <p className="muted">광고 문자에는 브랜드명과 무료수신거부 번호가 반드시 들어가요. 발신번호는 카페24에 등록된 번호여야 해요.</p>
      <div className="form">
        <label>브랜드명<input value={v.brandName} onChange={(e) => setV({ ...v, brandName: e.target.value })} /></label>
        <label>문자 발신번호<input value={v.smsSender} placeholder="02-000-0000" onChange={(e) => setV({ ...v, smsSender: e.target.value })} /></label>
        <label>무료수신거부 번호<input value={v.optOutNumber} placeholder="080-000-0000" onChange={(e) => setV({ ...v, optOutNumber: e.target.value })} /></label>
      </div>
      <div><button className="btn" onClick={save}>저장</button></div>
    </div>
  );
}

export function ListTab({ mall, openId, setOpenId, say, goNew }: { mall: string; openId: string | null; setOpenId: (id: string | null) => void; say: (t: string) => void; goNew: () => void }) {
  const a = useConsole();
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const load = useCallback(() => a.call<{ campaigns: Camp[] }>("GET", `${a.mallBase}/campaigns`).then((j) => setCamps(j.campaigns)).catch((e) => say(e.message)), [a, mall, say]);
  useEffect(() => { load(); }, [load]);
  if (!camps) return <p className="muted">불러오는 중…</p>;
  if (!camps.length) return (
    <div className="card"><b>아직 연 공구가 없어요.</b><p className="muted">새 공구 탭에서 찜이 많은 상품을 골라 시작해 보세요.</p><div><button className="btn" onClick={goNew}>새 공구 열기</button></div></div>
  );
  return (
    <>
      <div className="camps">
        {camps.map((c) => {
          const [label, cls] = CHIP[c.state];
          return (
            <button key={c.id} className="card camp" aria-pressed={openId === c.id} onClick={() => setOpenId(c.id)}>
              <div className="row"><b>{c.productName}</b><span className={`chip ${cls}`}>{label}</span></div>
              <div className="mono" style={{ fontSize: 20 }}>{c.pledgedQty} / {c.targetQty}개</div>
              <div className={`bar${c.pledgedQty >= c.targetQty ? " ok" : ""}`}><i style={{ width: `${Math.min(100, (c.pledgedQty / c.targetQty) * 100)}%` }} /></div>
              <span className="small">마감 {kst(c.deadlineAt)}{c.payUntil ? ` · 결제 기한 ${kst(c.payUntil)}` : ""}</span>
            </button>
          );
        })}
      </div>
      {openId && <CampaignDetail id={openId} say={say} onChanged={load} />}
    </>
  );
}

export function CampaignDetail({ id, say, onChanged }: { id: string; say: (t: string) => void; onChanged: () => void }) {
  const a = useConsole();
  const isAdmin = a.role === "admin";
  const [d, setD] = useState<Detail | null>(null);
  const [now, setNow] = useState<number>(0);
  const [dq, setDq] = useState("");
  const [dn, setDn] = useState("");
  const load = useCallback(async () => {
    const [detail, clock] = await Promise.all([a.call<Detail>("GET", `${a.campaignBase}/${id}`), a.call<{ now: string }>("GET", a.now)]);
    setD(detail);
    setNow(new Date(clock.now).getTime());
    setDq(String(detail.report.confirmed.qty));
  }, [a, id]);
  useEffect(() => { load().catch((e) => say(e.message)); }, [load, say]);
  if (!d) return <p className="muted">불러오는 중…</p>;
  const r = d.report, c = r.campaign;
  const [label, cls] = CHIP[c.state];
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
            <td>{m.kind === "invite_ad" ? "초대 (광고)" : "결과 안내"}</td>
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

export function NewTab({ mall, say, onOpened }: { mall: string; say: (t: string) => void; onOpened: (id: string) => void }) {
  const a = useConsole();
  const [radar, setRadar] = useState<{ run: Run | null; current: Run | null; rows: RadarRow[] } | null>(null);
  const [pick, setPick] = useState<RadarRow | null>(null);
  const load = useCallback(() => a.call<{ run: Run | null; current: Run | null; rows: RadarRow[] }>("GET", `${a.mallBase}/radar`).then(setRadar).catch((e) => say(e.message)), [a, mall, say]);
  const collect = async () => { await a.call("POST", `${a.mallBase}/radar`).catch((e) => say((e as Error).message)); load(); };
  useEffect(() => { load(); }, [load]);
  const running = radar?.current?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running, load]);

  if (!radar) return <p className="muted">불러오는 중…</p>;
  return (
    <>
      <div className="card">
        <div className="row"><h2 style={{ fontSize: 18, margin: 0 }}>1. 상품 고르기 · 찜 많은 상위 20개</h2>
          <button className="ghost" onClick={collect} disabled={running}>{running ? `수집 중 ${radar.current!.done}/${radar.current!.total}` : radar.run ? "다시 수집" : "찜 데이터 모으기"}</button></div>
        <p className="muted">{a.role === "admin" ? "판매자와 통화하며 함께 고르세요. 이 목록은 숫자만 있어 판매자에게 그대로 보여 줘도 괜찮아요." : "찜·장바구니에 많이 담긴 상품부터 보여 드려요. 재생산을 고민 중인 상품을 골라 보세요."}{radar.run && ` · ${kst(radar.run.finishedAt ?? radar.run.startedAt)} 기준`}</p>
        {!radar.run ? <p className="muted">{running ? "상품마다 하나씩 확인하는 중이에요. 상품이 많으면 몇 분에서 몇 시간 걸려요." : "아직 모은 데이터가 없어요. 위 버튼으로 시작하세요."}</p> : (
          <div className="tw"><table>
            <thead><tr><th>#</th><th>상품</th><th>정가</th><th>찜</th><th>장바구니</th><th /></tr></thead>
            <tbody>{radar.rows.map((p, i) => (
              <tr key={p.productNo}>
                <td className="mono">{i + 1}</td><td>{p.name}{p.soldOut && <> <span className="chip">품절</span></>}</td>
                <td className="mono">{won(p.price)}</td><td className="mono">{p.wishlist}</td><td className="mono">{p.cart}</td>
                <td><button className="ghost" onClick={() => setPick(p)}>선택</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {pick && <CampaignForm key={pick.productNo} mall={mall} p={pick} say={say} onOpened={onOpened} />}
    </>
  );
}

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
      <h2 style={{ fontSize: 18, margin: 0 }}>2. 조건 정하기 · {p.name} (정가 {won(p.price)})</h2>
      <div className="form">
        <label>목표 수량 (가마 1회분·원단 1롤 같은 최소 생산 수량)<input type="number" min={1} value={String(f.targetQty)} onChange={set("targetQty")} /></label>
        <label>공구가 (원)<input type="number" min={0} step={500} value={String(f.dealPrice)} onChange={set("dealPrice")} /></label>
        <label>원가 (고객에게 안 보여요)<input type="number" min={0} step={500} value={String(f.costPrice)} onChange={set("costPrice")} /></label>
        <label>1인 최대 수량<input type="number" min={1} max={5} value={String(f.perMemberLimit)} onChange={set("perMemberLimit")} /></label>
        <label>마감 (한국 시간, 실제 마감)<input type="datetime-local" value={String(f.deadline)} onChange={set("deadline")} /></label>
        <label>결제 기간<select value={String(f.payWindowHours)} onChange={set("payWindowHours")}><option value="72">달성 후 72시간</option><option value="48">달성 후 48시간</option></select></label>
        <label>예상 출고일 (필수 · 고객에게 보여요)<input type="date" value={String(f.shipEta)} onChange={set("shipEta")} /></label>
        <label style={{ alignContent: "end" }}><span><input type="checkbox" checked={!!f.confirmBelowCost} onChange={set("confirmBelowCost")} /> 원가 미만이어도 열기</span></label>
      </div>
      <div><button className="ghost" onClick={preview}>미리보기</button></div>
      {err && <p className="err" role="alert">{err}</p>}
      {pv && (
        <>
          <div className="kpi many">
            <div><small>찜</small><strong>{pv.audience.wishlist}</strong></div>
            <div><small>장바구니</small><strong>{pv.audience.cart}</strong></div>
            <div><small>중복 제외</small><strong>{pv.audience.unique}</strong></div>
            <div className="hl"><small>문자 발송 대상 (수신 동의)</small><strong>{pv.audience.reachable}</strong></div>
          </div>
          {pv.marginPerUnit != null && <p className="muted">개당 마진 {won(pv.marginPerUnit)}</p>}
          <p className="muted">초대 문자 발송: {kst(pv.sendAt)} (밤 9시~오전 8시는 자동으로 미뤄요)</p>
          <p className="msg">{pv.message}</p>
          {pv.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
          {pv.errors.length ? <div className="err" role="alert">{pv.errors.map((e) => <div key={e}>{e}</div>)}</div> : (
            <div className="actions"><b>{a.role === "admin" ? "판매자에게 조건을 다시 읽어 주고 동의를 받았나요?" : "조건을 확인했나요? 열면 쿠폰이 만들어지고, 수신 동의 고객에게 초대 문자가 예약돼요."}</b>
              <button className="btn" disabled={busy} onClick={open}>공구 열기 · 쿠폰 생성 · 초대 {pv.audience.reachable}명 예약</button></div>
          )}
        </>
      )}
    </div>
  );
}

export function ScoreTab() {
  const a = useConsole();
  const [s, setS] = useState<{ verdict: string; rows: { key: string; label: string; value: number | string | null; kind: string; goal: string; pass: boolean }[] } | null>(null);
  useEffect(() => { a.call<typeof s>("GET", "/api/admin/scorecard").then(setS).catch(() => setS(null)); }, [a]);
  if (!s) return <p className="muted">불러오는 중…</p>;
  const V: Record<string, [string, string]> = { go: ["Go · 다음 단계로", "ok"], iterate: ["보완 · 결제 조건 실험 2주", "warn"], rethink: ["재검토 · 가정 다시 보기", "bad"], in_progress: ["진행 중", "open"] };
  const [label, cls] = V[s.verdict];
  return (
    <div className="card">
      <div className="row"><h2 style={{ fontSize: 18, margin: 0 }}>4주 성공 기준</h2><span className={`chip ${cls}`}>{label}</span></div>
      <p className="muted">28일 차에 이 표로만 판정해요. 기준은 결과를 보기 전에 정해 두었어요.</p>
      <div className="tw"><table>
        <thead><tr><th>지표</th><th>현재</th><th>기준</th><th /></tr></thead>
        <tbody>{s.rows.map((r) => (
          <tr key={r.key}><td>{r.label}</td><td className="mono">{r.kind === "rate" ? pct(r.value as number | null) : String(r.value ?? "–")}</td><td>{r.goal}</td>
            <td><span className={`chip ${r.pass ? "ok" : "warn"}`}>{r.pass ? "충족" : "미충족"}</span></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
