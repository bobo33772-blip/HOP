"use client";

// 4주 판정표 (운영자만). 28일 차 Go 판정 기준.

import { useEffect, useState } from "react";
import { useConsole } from "./provider";
import { pct } from "./format";

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
