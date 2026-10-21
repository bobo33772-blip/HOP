"use client";

// 모니터링 (#92): 판매 통계. 리포트(공구 매출 전체: 숫자 칸 · 그래프 · 공구별 · 엑셀)와 기간별(월별 막대 · 지난달 같은 기간 비교 · 상품별 · 유입별).
// 고객이 기다리는 상품(예전 모니터링 · 수요 레이더)은 내 공구 화면으로 옮겼다 (console/demand-panel.tsx).

import { useCallback, useEffect, useState } from "react";
import AppBar from "../components/app-bar";
import { SELLER_API } from "../components/home-sales";
import { ConsoleProvider, useToast } from "../console/provider";
import { ExcelMenu, SalesPanel, type CsvKind } from "../console/sales";
import { PeriodPanel } from "../console/period-panel";

type Tab = "report" | "period";
const TABS: [Tab, string][] = [["report", "리포트"], ["period", "기간별"]];

export default function RadarClient() {
  const [tab, setTabState] = useState<Tab>("report");
  const { say, node } = useToast();
  const [shop, setShop] = useState<string | null>(null);
  // 사이드바 쇼핑몰 칸 (다른 판매자 화면과 같게)
  useEffect(() => { fetch("/api/seller/profile", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => setShop(j?.mall?.brandName ?? j?.mall?.mallId ?? null)).catch(() => {}); }, []);
  // 탭을 주소에도 남겨 새로고침 · 뒤로 가기에도 같은 탭 (?tab=period)
  useEffect(() => { if (new URL(location.href).searchParams.get("tab") === "period") setTabState("period"); }, []);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const u = new URL(location.href);
    if (t === "report") u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
    history.replaceState(null, "", u);
  }, []);

  return (
    <>
      <AppBar current="radar" shop={shop} />
      <main className="wide">
        {/* 머리 (시안 3): 대시보드 › 매출 리포트 · 제목 · 설명, 오른쪽 위 엑셀 내려받기 */}
        <div className="page-head">
          <div className="hello">
            <span className="crumb only-w"><a href="/">대시보드</a> › 매출 리포트</span>
            <h1>매출 리포트</h1>
            <p className="muted">공구로 번 돈을 한눈에 보고, 달마다 얼마나 팔렸는지 비교해요.</p>
          </div>
          <ExcelMenu file={(kind: CsvKind) => `${SELLER_API.mallBase}/sales?format=csv&kind=${kind}`} />
        </div>
        {/* 밑줄 탭: 왼쪽에 붙여 글자 폭만큼 */}
        <div role="tablist" aria-label="매출 리포트" className="rp-tabs">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <ConsoleProvider api={SELLER_API}>
          <div role="tabpanel" className="rp">
            {tab === "report" ? <SalesPanel say={say} excel={false} report /> : <PeriodPanel say={say} />}
          </div>
        </ConsoleProvider>
      </main>
      {node}
    </>
  );
}
