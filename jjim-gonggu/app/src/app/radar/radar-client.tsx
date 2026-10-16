"use client";

// 모니터링 (#92): 판매 통계. 리포트(공구 매출 전체: 숫자 칸 · 그래프 · 공구별 · 엑셀)와 기간별(월별 막대 · 지난달 같은 기간 비교 · 상품별 · 유입별).
// 고객이 기다리는 상품(예전 모니터링 · 수요 레이더)은 내 공구 화면으로 옮겼다 (console/demand-panel.tsx).

import { useCallback, useEffect, useState } from "react";
import AppBar from "../components/app-bar";
import { SELLER_API } from "../components/home-sales";
import { ConsoleProvider, useToast } from "../console/provider";
import { SalesPanel } from "../console/sales";
import { PeriodPanel } from "../console/period-panel";

type Tab = "report" | "period";
const TABS: [Tab, string][] = [["report", "리포트"], ["period", "기간별"]];

export default function RadarClient() {
  const [tab, setTabState] = useState<Tab>("report");
  const { say, node } = useToast();
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
      <AppBar current="radar" />
      <main>
        <div className="hello"><h1>모니터링</h1><p className="muted">공구로 번 돈을 한눈에 보고, 달마다 얼마나 팔렸는지 비교해요.</p></div>
        {/* 밑줄 탭 두 칸 */}
        <div role="tablist" aria-label="모니터링" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--line)" }}>
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              style={{ border: 0, background: "none", padding: "12px 0", fontSize: 16, fontWeight: tab === k ? 800 : 600, color: tab === k ? "var(--fg)" : "var(--muted)", boxShadow: tab === k ? "inset 0 -2.5px 0 var(--fg)" : undefined }}>
              {l}
            </button>
          ))}
        </div>
        <ConsoleProvider api={SELLER_API}>
          <div role="tabpanel" style={{ display: "grid", gap: 14 }}>
            {tab === "report" ? <SalesPanel say={say} /> : <PeriodPanel say={say} />}
          </div>
        </ConsoleProvider>
      </main>
      {node}
    </>
  );
}
