"use client";

import { useCallback, useEffect, useState } from "react";
import { ConsoleProvider, useToast } from "../console/provider";
import { ListTab } from "../console/campaign-list";
import { NewTab } from "../console/radar-picker";
import { ProfileCard } from "../console/profile-card";
import type { Mall } from "../console/types";
import type { ScopeInfo } from "@/lib/cafe24/scopes";
import AppBar, { type Section } from "../components/app-bar";
import { ThemeSetting } from "../components/theme-toggle";
import WidgetInstallButton from "../components/widget-install-button";

const API = { role: "seller", mallBase: "/api/seller", campaignBase: "/api/seller/campaigns", now: "/api/seller/now", loginUrl: "/" } as const;
type Tab = "list" | "new" | "profile";
const isTab = (s: string | null): s is Tab => s === "list" || s === "new" || s === "profile";

export default function SellerConsole({ mallId, initialTab, initialOpen, scopes, widget = false }: { mallId: string; initialTab?: string; initialOpen?: string; scopes: ScopeInfo[]; widget?: boolean }) {
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
    list: ["공구 관리", "진행 상황을 보고, 고객이 기다리는 상품으로 다음 공구를 정하세요."],
    new: ["공구 열기", "고객이 많이 담아 둔 상품을 고르고 조건을 정하면 끝이에요."],
    profile: ["쇼핑몰 설정", "광고 문자에 들어가는 정보와 앱 연결 상태예요."],
  };

  return (
    <>
      <AppBar current={tab} shop={mall?.brandName ?? mallId} onNavigate={nav} />
      <main className="wide">
        {/* 머리 (시안 3): 대시보드 › 화면 이름, 제목, 설명. 공구 관리는 오른쪽 위에 '공구 열기' (휴대폰은 제목 옆 작은 버튼) */}
        <div className={`page-head${tab === "list" ? " ph-list" : ""}`}>
          <div className="hello">
            <span className="crumb only-w"><a href="/">대시보드</a> › {TITLE[tab][0]}</span>
            <h1>{TITLE[tab][0]}</h1>
            <p className={tab === "list" || tab === "new" ? "muted only-w" : "muted"}>{TITLE[tab][1]}</p>
            {tab === "new" && <p className="muted only-m">고객이 기다리는 상품을 고르고, 질문 3개에 답하면 끝이에요.</p>}
          </div>
          {tab === "list" && <button type="button" className="btn dark compact ph-new" onClick={() => setTab("new")}>＋ 공구 열기</button>}
        </div>
        {!mall ? <p className="muted">불러오는 중…</p> : (
          <ConsoleProvider api={API}>
            {tab !== "profile" && <ProfileCard mall={mall} onSaved={() => { say("저장했어요"); load(); }} say={say} />}
            {tab === "list" && <ListTab mall={mallId} openId={openId} setOpenId={setOpenId} say={say} goNew={() => setTab("new")} />}
            {tab === "new" && <NewTab mall={mallId} say={say} onOpened={(id) => { setOpenId(id); setTab("list"); }} />}
            {/* 쇼핑몰 설정 (시안 3): 왼쪽 쇼핑몰 정보 · 카페24 권한, 오른쪽 화면 밝기 */}
            {tab === "profile" && (
              <div className="st-grid">
                <div className="st-main">
                  <ProfileCard mall={mall} always foot="광고 문자 맨 앞에 브랜드명이, 끝에 무료수신거부 번호가 자동으로 붙어요." onSaved={() => { say("저장했어요"); load(); }} say={say} />
                  {/* 앱이 쓰는 카페24 권한 안내(예전 홈 토글). 목록은 서버 설정(CAFE24_PRIVACY_SCOPE)에 따라 달라서 서버 페이지에서 받는다 */}
                  <details className="card st-scopes" open>
                    <summary><b>찜꽁이 쓰는 카페24 권한 {scopes.length}개</b><span className="fold" aria-hidden="true" /></summary>
                    <table><tbody>{scopes.map((s) => <tr key={s.scope}><td><code>{s.scope}</code></td><td>{s.why}</td></tr>)}</tbody></table>
                  </details>
                </div>
                <aside className="st-side">
                  <section className="card st-conn" aria-labelledby="st-conn-t">
                    <h2 id="st-conn-t">연결 상태</h2>
                    <ul>
                      <li><span>카페24 앱</span><b className="ok">● 연결됨</b></li>
                      <li><span>상품 페이지 위젯</span>{widget ? <b className="ok">● 설치됨</b> : <WidgetInstallButton />}</li>
                      <li><span>무료수신거부 번호</span>{/^080/.test(mall.optOutNumber ?? "") ? <b className="ok">● 등록됨</b> : <b className="need">● 등록 필요</b>}</li>
                    </ul>
                    {!/^080/.test(mall.optOutNumber ?? "") && <p className="callout">080 번호를 등록해야 초대 문자를 보낼 수 있어요.</p>}
                  </section>
                  {/* 화면 밝기 (#85): 휴대폰에서는 상단바 버튼이 없어서 여기서 바꾼다 */}
                  <div className="st-theme"><ThemeSetting /></div>
                </aside>
              </div>
            )}
          </ConsoleProvider>
        )}
      </main>
      {node}
    </>
  );
}
