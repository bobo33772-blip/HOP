"use client";

// 새 공구 1단계: 찜 · 장바구니가 많은 상품 상위 20에서 고르기. 운영자 OP-1(찜 상위 20) / 판매자 S-04 · S-E2(첫 수집 중).

import { useCallback, useEffect, useState } from "react";

/** 휴대폰 폭(560px 이하)인지. 표 대신 목록으로 그릴 때 쓴다 (#9) */
function useNarrow(max = 560) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${max}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [max]);
  return narrow;
}
import { useConsole } from "./provider";
import type { RadarRow, Run } from "./types";
import { kst, won } from "./format";
import { CampaignForm } from "./campaign-form";

export function NewTab({ mall, say, onOpened }: { mall: string; say: (t: string) => void; onOpened: (id: string) => void }) {
  const a = useConsole();
  const [radar, setRadar] = useState<{ run: Run | null; current: Run | null; rows: RadarRow[]; privacy: boolean } | null>(null);
  const [pick, setPick] = useState<RadarRow | null>(null);
  const narrow = useNarrow();
  const load = useCallback(() => a.call<{ run: Run | null; current: Run | null; rows: RadarRow[]; privacy: boolean }>("GET", `${a.mallBase}/radar`).then(setRadar).catch((e) => say(e.message)), [a, mall, say]);
  const collect = async () => { await a.call("POST", `${a.mallBase}/radar`).catch((e) => say((e as Error).message)); load(); };
  useEffect(() => { load(); }, [load]);
  const running = radar?.current?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running, load]);

  if (!radar) return <p className="muted">불러오는 중…</p>;
  return (
    <>
      <div className="card">
        {/* 휴대폰 폭에서는 제목·부제·버튼이 서로 눌리지 않게 줄을 바꾸고, 버튼 글자는 한 줄로 둔다 (#9) */}
        <div className="row" style={{ flexWrap: "wrap" }}><h2 className="step-title" style={{ flexWrap: "wrap", rowGap: 2 }}><span className="n">1</span>상품 고르기 <span className="small">{radar.privacy ? "알림 신청·찜·장바구니" : "알림 신청·장바구니"} 많은 순 상위 20개</span></h2>
          <button className="ghost" style={{ flex: "none", whiteSpace: "nowrap" }} onClick={collect} disabled={running}>{running ? `수집 중 ${radar.current!.done}/${radar.current!.total}` : radar.run ? "다시 수집" : "관심 데이터 모으기"}</button></div>
        <p className="muted">{a.role === "admin" ? "판매자와 통화하며 함께 고르세요. 이 목록은 숫자만 있어 판매자에게 그대로 보여 줘도 괜찮아요." : "공구 알림 신청과 장바구니가 많은 상품부터 보여 드려요. 재생산을 고민 중인 상품을 골라 보세요."}{radar.run && ` · ${kst(radar.run.finishedAt ?? radar.run.startedAt)} 기준`}</p>
        {!radar.run && radar.rows.length === 0 ? <p className="muted">{running ? "상품마다 하나씩 확인하는 중이에요. 상품이 많으면 몇 분에서 몇 시간 걸려요." : "아직 모은 데이터가 없어요. 위 버튼으로 시작하세요."}</p> : narrow ? (
          // 휴대폰: 열 7개짜리 표는 카드보다 넓어 '선택'이 잘린다 → 수요 레이더와 같은 목록. 줄 전체가 버튼이라 어디를 눌러도 고른다 (#9)
          <ol className="list" style={{ wordBreak: "keep-all" }}>{radar.rows.map((p, i) => {
            const on = pick?.productNo === p.productNo;
            return (
              <li key={p.productNo}><button type="button" className="item" aria-pressed={on} onClick={() => setPick(p)} style={on ? { background: "var(--brand-soft)" } : undefined}>
                <span className="rank">{i + 1}</span>
                <span className="meta">
                  <b style={{ whiteSpace: "normal" }}>{p.name}{p.soldOut && <> <span className="chip">품절</span></>}</b>{/* 이름은 말줄임 대신 줄바꿈 (단어 단위) */}
                  <small>{won(p.price)} · 알림 신청 {p.alert}{radar.privacy ? ` · 찜 ${p.wishlist}` : ""} · 장바구니 {p.cart}</small>
                </span>
                <span className={`chip ${on ? "open" : ""}`} style={{ flex: "none" }}>{on ? "선택됨" : "선택"}</span>
              </button></li>
            );
          })}</ol>
        ) : (
          <div className="tw"><table>
            <thead><tr><th>#</th><th>상품</th><th>정가</th><th>알림 신청</th>{radar.privacy && <th>찜</th>}<th>장바구니</th><th /></tr></thead>
            <tbody>{radar.rows.map((p, i) => (
              <tr key={p.productNo}>
                <td className="mono">{i + 1}</td><td>{p.name}{p.soldOut && <> <span className="chip">품절</span></>}</td>
                <td className="mono">{won(p.price)}</td><td className="mono">{p.alert}</td>{radar.privacy && <td className="mono">{p.wishlist}</td>}<td className="mono">{p.cart}</td>
                <td><button className={pick?.productNo === p.productNo ? "btn" : "ghost"} style={pick?.productNo === p.productNo ? { minHeight: 40 } : undefined} onClick={() => setPick(p)}>{pick?.productNo === p.productNo ? "선택됨" : "선택"}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {!radar.privacy && <p className="small">상품 페이지 위젯에서 &lsquo;공구 열리면 알림 받기&rsquo;를 신청한 고객과 장바구니에 담은 고객에게 공구를 열어요. 알림 신청은 공구를 열면 초대와 함께 비워져요.</p>}
      </div>
      {pick && <CampaignForm key={pick.productNo} mall={mall} p={pick} say={say} onOpened={onOpened} />}
    </>
  );
}
