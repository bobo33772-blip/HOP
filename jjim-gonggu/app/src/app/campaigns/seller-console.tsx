"use client";

import { useCallback, useEffect, useState } from "react";
import { ConsoleProvider, useToast } from "../console/provider";
import { ListTab } from "../console/campaign-list";
import { NewTab } from "../console/radar-picker";
import { ProfileCard } from "../console/profile-card";
import type { Mall } from "../console/types";
import AppBar, { type Section } from "../components/app-bar";

const API = { role: "seller", mallBase: "/api/seller", campaignBase: "/api/seller/campaigns", now: "/api/seller/now", loginUrl: "/" } as const;
type Tab = "list" | "new" | "profile";
const isTab = (s: string | null): s is Tab => s === "list" || s === "new" || s === "profile";

export default function SellerConsole({ mallId, initialTab, initialOpen }: { mallId: string; initialTab?: string; initialOpen?: string }) {
  const [mall, setMall] = useState<Mall | null>(null);
  const [tab, setTabState] = useState<Tab>(isTab(initialTab ?? null) ? (initialTab as Tab) : "list");
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const { say, node } = useToast();

  // 탭을 주소에도 남겨 새로고침·뒤로가기에도 같은 화면이 나오게 한다
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const u = new URL(location.href);
    if (t === "list") u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
    history.replaceState(null, "", u);
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/seller/profile", { cache: "no-store" });
    if (r.status === 401) { location.href = "/"; return; }
    setMall((await r.json()).mall);
  }, []);
  useEffect(() => { load().catch(() => say("쇼핑몰 정보를 불러오지 못했어요")); }, [load, say]);

  const nav = (s: Section) => (isTab(s) ? (setTab(s), true) : false);
  const TITLE: Record<Tab, [string, string]> = {
    list: ["내 공구", "진행 상황을 한눈에 보고, 공구를 눌러 자세히 확인하세요."],
    new: ["새 공구 열기", "고객이 많이 담아 둔 상품을 고르고 조건을 정하면 끝이에요."],
    profile: ["쇼핑몰 설정", "광고 문자에 들어가는 정보예요."],
  };

  return (
    <>
      <AppBar current={tab} shop={mall?.brandName ?? mallId} onNavigate={nav} />
      <main className="wide">
        <div className="hello"><h1>{TITLE[tab][0]}</h1><p className="muted">{TITLE[tab][1]}</p></div>
        {!mall ? <p className="muted">불러오는 중…</p> : (
          <ConsoleProvider api={API}>
            <ProfileCard mall={mall} always={tab === "profile"} onSaved={() => { say("저장했어요"); load(); }} say={say} />
            {tab === "list" && <ListTab mall={mallId} openId={openId} setOpenId={setOpenId} say={say} goNew={() => setTab("new")} />}
            {tab === "new" && <NewTab mall={mallId} say={say} onOpened={(id) => { setOpenId(id); setTab("list"); }} />}
            {tab === "profile" && <p className="note">광고 문자 맨 앞에 브랜드명이, 끝에 무료수신거부 번호가 자동으로 붙어요. 발신번호는 카페24 관리자 › SMS 발신번호 관리에 등록된 번호여야 해요.</p>}
          </ConsoleProvider>
        )}
      </main>
      {node}
    </>
  );
}
