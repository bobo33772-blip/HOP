"use client";

import { useCallback, useEffect, useState } from "react";
import { ConsoleProvider, ListTab, NewTab, ProfileCard, useToast, type Mall } from "../console/console";

const API = { role: "seller", mallBase: "/api/seller", campaignBase: "/api/seller/campaigns", now: "/api/seller/now", loginUrl: "/" } as const;

export default function SellerConsole({ mallId }: { mallId: string }) {
  const [mall, setMall] = useState<Mall | null>(null);
  const [tab, setTab] = useState<"list" | "new" | "profile">("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const { say, node } = useToast();

  const load = useCallback(async () => {
    const r = await fetch("/api/seller/profile", { cache: "no-store" });
    if (r.status === 401) { location.href = "/"; return; }
    setMall((await r.json()).mall);
  }, []);
  useEffect(() => { load().catch(() => say("쇼핑몰 정보를 불러오지 못했어요")); }, [load, say]);

  return (
    <>
      <header className="adm-head">
        <div className="in">
          <a className="logo" href="/" style={{ color: "inherit", textDecoration: "none" }}><i>찜</i>찜꽁</a>
          <span className="small">{mall?.brandName ?? mallId}</span>
          <nav className="tabs" role="tablist">
            {([["list", "내 공구"], ["new", "새 공구 열기"], ["profile", "쇼핑몰 정보"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>
        </div>
      </header>
      <main className="wide">
        {!mall ? <p className="muted">불러오는 중…</p> : (
          <ConsoleProvider api={API}>
            <ProfileCard mall={mall} always={tab === "profile"} onSaved={() => { say("저장했어요"); load(); }} say={say} />
            {tab === "list" && <ListTab mall={mallId} openId={openId} setOpenId={setOpenId} say={say} goNew={() => setTab("new")} />}
            {tab === "new" && <NewTab mall={mallId} say={say} onOpened={(id) => { setOpenId(id); setTab("list"); }} />}
            {tab === "profile" && <p className="small">광고 문자 맨 앞에 브랜드명이, 끝에 무료수신거부 번호가 자동으로 붙어요. 발신번호는 카페24 관리자에 등록된 번호여야 해요.</p>}
          </ConsoleProvider>
        )}
      </main>
      {node}
    </>
  );
}
