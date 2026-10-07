"use client";

import { useState } from "react";

/** 판매자 홈: 위젯 설치가 안 됐을 때 다시 설치 */
export default function WidgetInstallButton() {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");
  const run = async () => {
    setState("busy");
    const r = await fetch("/api/seller/widget", { method: "POST", headers: { "X-JJG": "1" } });
    if (r.ok) { location.reload(); return; }
    setMsg(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "설치하지 못했어요. 잠시 후 다시 시도해 주세요.");
    setState("error");
  };
  return (
    <>
      <button className="ghost" onClick={run} disabled={state === "busy"}>{state === "busy" ? "설치 중…" : "설치하기"}</button>
      {state === "error" && <p className="err">{msg}</p>}
    </>
  );
}
