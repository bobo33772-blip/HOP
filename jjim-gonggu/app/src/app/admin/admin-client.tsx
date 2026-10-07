"use client";

// 운영자 화면: 공구 목록·상세 / 새 공구(찜 많은 상품 → 조건 → 미리보기 → 열기) / 4주 판정표.

import { useCallback, useEffect, useState } from "react";
import { ConsoleProvider, ListTab, NewTab, ProfileCard, ScoreTab, useToast, type Mall } from "../console/console";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  if (r.status === 401) { location.href = "/admin"; throw new Error("로그인이 필요해요"); }
  if (!r.ok) throw new Error("불러오지 못했어요");
  return r.json();
}

export default function AdminClient({ mock }: { mock: boolean }) {
  const [malls, setMalls] = useState<Mall[] | null>(null);
  const [mall, setMall] = useState<string>("");
  const [tab, setTab] = useState<"list" | "new" | "score">("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const { say, node } = useToast();

  const loadMalls = useCallback(async () => {
    const { malls } = await get<{ malls: Mall[] }>("/api/admin/malls");
    setMalls(malls);
    setMall((m) => m || malls[0]?.mallId || "");
  }, []);
  useEffect(() => { loadMalls().catch((e) => say(e.message)); }, [loadMalls, say]);

  const current = malls?.find((m) => m.mallId === mall);
  return (
    <>
      <header className="adm-head">
        <div className="in">
          <div className="logo"><i>찜</i>찜꽁 운영자</div>
          {mock && <span className="chip warn">데모 모드</span>}
          <label className="small" htmlFor="mall">쇼핑몰</label>
          <select id="mall" className="field" style={{ width: "auto", padding: "6px 8px" }} value={mall} onChange={(e) => { setMall(e.target.value); setOpenId(null); setTab("list"); }}>
            {malls?.map((m) => <option key={m.mallId} value={m.mallId}>{m.brandName ?? m.mallId} ({m.mallId})</option>)}
          </select>
          <nav className="tabs" role="tablist">
            {([["list", "공구 목록"], ["new", "새 공구"], ["score", "4주 판정표"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>
          <form method="post" action="/api/admin/logout"><button className="ghost" type="submit">로그아웃</button></form>
        </div>
      </header>
      <main className="wide">
        {!malls ? <p className="muted">불러오는 중…</p>
          : !current ? <div className="card"><b>연결된 쇼핑몰이 없어요.</b><p className="muted">카페24 설치 주소(/api/cafe24/install?mall_id=쇼핑몰ID)로 파일럿 몰을 먼저 연결해 주세요.</p></div>
          : (
            <ConsoleProvider key={mall} api={{ role: "admin", mallBase: `/api/admin/malls/${mall}`, campaignBase: "/api/admin/campaigns", now: "/api/admin/now", loginUrl: "/admin" }}>
              <ProfileCard mall={current} onSaved={() => { say("저장했어요"); loadMalls(); }} say={say} />
              {tab === "list" && <ListTab mall={mall} openId={openId} setOpenId={setOpenId} say={say} goNew={() => setTab("new")} />}
              {tab === "new" && <NewTab mall={mall} say={say} onOpened={(id) => { setOpenId(id); setTab("list"); }} />}
              {tab === "score" && <ScoreTab />}
            </ConsoleProvider>
          )}
      </main>
      {node}
    </>
  );
}
