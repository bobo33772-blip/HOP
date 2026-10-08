"use client";

// 쇼핑몰 정보(브랜드명 · 문자 발신번호 · 무료수신거부 번호). 운영자 OP-1 몰 정보 / 판매자 S-13 설정.

import { useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { Mall } from "./types";

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
        {mall.senders?.length ? (
          <label>문자 발신번호
            <select value={v.smsSender} onChange={(e) => setV({ ...v, smsSender: e.target.value })}>
              <option value="">카페24에 등록된 번호에서 고르기</option>
              {mall.senders.map((s) => <option key={s.senderNo} value={s.number}>{s.number}</option>)}
            </select>
            <span className="hint">카페24 관리자 › SMS 발신번호 관리에 등록된 번호예요</span>
          </label>
        ) : (
          <label>문자 발신번호<input value={v.smsSender} placeholder="02-000-0000" onChange={(e) => setV({ ...v, smsSender: e.target.value })} />
            <span className="hint">{mall.senders ? "카페24에 등록된 발신번호가 없어요. 카페24 관리자 › SMS 발신번호 관리에서 먼저 등록해 주세요" : "카페24에 등록된 번호여야 해요"}</span>
          </label>
        )}
        <label>무료수신거부 번호<input value={v.optOutNumber} placeholder="080-000-0000" onChange={(e) => setV({ ...v, optOutNumber: e.target.value })} /></label>
      </div>
      <div><button className="btn" onClick={save}>저장</button></div>
    </div>
  );
}
