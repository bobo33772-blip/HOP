"use client";

// 공구 열기 확인 창(화면 가운데). 열면 쿠폰이 만들어지고 초대 문자가 예약돼서, 누르기 전에 조건을 한 번 더 보여 준다.

import { useEffect } from "react";
import s from "./open-confirm-sheet.module.css";

export function OpenConfirmSheet({ productName, facts, busy, onClose, onConfirm }: {
  productName: string; facts: string[]; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);
  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="open-title" onClick={() => !busy && onClose()}>
      <div className={s.box} onClick={(e) => e.stopPropagation()}>
        <h2 id="open-title">공구를 여시겠습니까?</h2>
        <p style={{ margin: 0, wordBreak: "keep-all" }}><b>{productName}</b> 공구를 이 조건으로 열어요.</p>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, wordBreak: "keep-all" }}>
          {facts.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="ghost" onClick={onClose} disabled={busy}>닫기</button>
          <button className="btn brand" autoFocus onClick={onConfirm} disabled={busy}>{busy ? "여는 중…" : "공구 열기"}</button>
        </div>
      </div>
    </div>
  );
}
