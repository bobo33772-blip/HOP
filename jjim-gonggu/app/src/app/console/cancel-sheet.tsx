"use client";

// 공구 취소 확인 창 (#66). 화면 가운데에 뜬다. 되돌릴 수 없다는 것과 결과(신청자 안내 문자 · 안 나간 초대 문자 · 새 공구)를 보여 주고, 이유를 꼭 받는다.
// 처리는 서버(#65)가 한다: 모집 중이고 마감 전일 때만, 이유가 없으면 400. 운영자 화면도 같은 부품을 쓴다.

import { useEffect, useState } from "react";
import s from "./center-dialog.module.css";

/** 취소 이유 최대 길이. 서버(lib/engine/cancel.ts CANCEL_REASON_MAX)와 같다 */
const REASON_MAX = 300;

export function CancelSheet({ productName, pledgers, onClose, onConfirm }: {
  productName: string; pledgers: number; onClose: () => void; onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);
  const ok = reason.trim().length > 0 && !busy;
  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    try { await onConfirm(reason.trim()); } finally { setBusy(false); }
  };
  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="cancel-title" onClick={() => !busy && onClose()}>
      <div className={s.box} onClick={(e) => e.stopPropagation()}>
        <h2 id="cancel-title">공구를 취소할까요?</h2>
        <p style={{ margin: 0, wordBreak: "keep-all" }}><b>{productName}</b> 공구를 취소하면 되돌릴 수 없어요.</p>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, wordBreak: "keep-all" }}>
          <li>{pledgers > 0 ? <>신청한 <b>{pledgers}명</b>에게 취소 안내 문자가 가요. 결제된 금액은 없어요.</> : "아직 신청한 고객이 없어요."}</li>
          <li>아직 안 나간 초대 문자는 보내지 않아요.</li>
          <li>취소하면 같은 상품으로 새 공구를 바로 열 수 있어요.</li>
        </ul>
        <div className="form">
          <label>취소 이유 (꼭 적어 주세요)
            <input autoFocus maxLength={REASON_MAX} value={reason} placeholder="예: 공구가를 잘못 넣었어요"
              onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            <span className="hint">운영 기록에 남아요. 고객에게는 보이지 않아요.</span>
          </label>
        </div>
        <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="ghost" onClick={onClose} disabled={busy}>닫기</button>
          <button className="btn danger" onClick={submit} disabled={!ok}>{busy ? "취소하는 중…" : "공구 취소하기"}</button>
        </div>
      </div>
    </div>
  );
}
