"use client";

// 공구 목록. 누르면 아래에 상세(campaign-detail)가 펼쳐진다. 운영자 OP-4로 들어가는 목록 / 판매자 S-12 · S-E1(빈 상태).

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Camp } from "./types";
import { CHIP, kst } from "./format";
import { CampaignDetail } from "./campaign-detail";

export function ListTab({ mall, openId, setOpenId, say, goNew }: { mall: string; openId: string | null; setOpenId: (id: string | null) => void; say: (t: string) => void; goNew: () => void }) {
  const a = useConsole();
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const load = useCallback(() => a.call<{ campaigns: Camp[] }>("GET", `${a.mallBase}/campaigns`).then((j) => setCamps(j.campaigns)).catch((e) => say(e.message)), [a, mall, say]);
  useEffect(() => { load(); }, [load]);
  if (!camps) return <p className="muted">불러오는 중…</p>;
  if (!camps.length) return (
    <div className="card empty">
      <img src="/logo.svg" alt="" />
      <b>아직 연 공구가 없어요</b>
      <p className="muted">고객이 장바구니·찜에 많이 담아 둔 상품으로 첫 공구를 열어 보세요.<br />목표 수량이 모이면 그때 결제를 받아요.</p>
      <button className="btn brand" onClick={goNew}>첫 공구 열기</button>
    </div>
  );
  return (
    <>
      <div className="camps">
        {camps.map((c) => {
          const [label, cls] = CHIP[c.state];
          const ratio = Math.min(1, c.pledgedQty / c.targetQty);
          return (
            <button key={c.id} className="card camp" aria-pressed={openId === c.id} onClick={() => setOpenId(openId === c.id ? null : c.id)}>
              <div className="row"><span className="name">{c.productName}</span><span className={`chip ${cls}`}>{label}</span></div>
              <div className="count">{c.pledgedQty}<small> / {c.targetQty}개 · {Math.round(ratio * 100)}%</small></div>
              <div className={`bar${ratio >= 1 ? " ok" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={c.targetQty} aria-valuenow={c.pledgedQty}><i style={{ width: `${ratio * 100}%` }} /></div>
              <span className="small">마감 {kst(c.deadlineAt)}{c.payUntil ? ` · 결제 기한 ${kst(c.payUntil)}` : ""}</span>
            </button>
          );
        })}
      </div>
      {openId && <CampaignDetail id={openId} say={say} onChanged={load} />}
    </>
  );
}
