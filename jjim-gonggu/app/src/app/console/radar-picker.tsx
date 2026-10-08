"use client";

// 새 공구 1단계: 찜 · 장바구니가 많은 상품 상위 20에서 고르기. 운영자 OP-1(찜 상위 20) / 판매자 S-04 · S-E2(첫 수집 중).

import { useCallback, useEffect, useState } from "react";
import { useConsole } from "./provider";
import type { RadarRow, Run } from "./types";
import { kst, won } from "./format";
import { CampaignForm } from "./campaign-form";

export function NewTab({ mall, say, onOpened }: { mall: string; say: (t: string) => void; onOpened: (id: string) => void }) {
  const a = useConsole();
  const [radar, setRadar] = useState<{ run: Run | null; current: Run | null; rows: RadarRow[]; privacy: boolean } | null>(null);
  const [pick, setPick] = useState<RadarRow | null>(null);
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
        <div className="row"><h2 className="step-title"><span className="n">1</span>상품 고르기 <span className="small">{radar.privacy ? "찜·장바구니" : "장바구니"} 많은 순 상위 20개</span></h2>
          <button className="ghost" onClick={collect} disabled={running}>{running ? `수집 중 ${radar.current!.done}/${radar.current!.total}` : radar.run ? "다시 수집" : "찜 데이터 모으기"}</button></div>
        <p className="muted">{a.role === "admin" ? "판매자와 통화하며 함께 고르세요. 이 목록은 숫자만 있어 판매자에게 그대로 보여 줘도 괜찮아요." : "찜·장바구니에 많이 담긴 상품부터 보여 드려요. 재생산을 고민 중인 상품을 골라 보세요."}{radar.run && ` · ${kst(radar.run.finishedAt ?? radar.run.startedAt)} 기준`}</p>
        {!radar.run ? <p className="muted">{running ? "상품마다 하나씩 확인하는 중이에요. 상품이 많으면 몇 분에서 몇 시간 걸려요." : "아직 모은 데이터가 없어요. 위 버튼으로 시작하세요."}</p> : (
          <div className="tw"><table>
            <thead><tr><th>#</th><th>상품</th><th>정가</th>{radar.privacy && <th>찜</th>}<th>장바구니</th><th /></tr></thead>
            <tbody>{radar.rows.map((p, i) => (
              <tr key={p.productNo}>
                <td className="mono">{i + 1}</td><td>{p.name}{p.soldOut && <> <span className="chip">품절</span></>}</td>
                <td className="mono">{won(p.price)}</td>{radar.privacy && <td className="mono">{p.wishlist}</td>}<td className="mono">{p.cart}</td>
                <td><button className={pick?.productNo === p.productNo ? "btn" : "ghost"} style={pick?.productNo === p.productNo ? { minHeight: 40 } : undefined} onClick={() => setPick(p)}>{pick?.productNo === p.productNo ? "선택됨" : "선택"}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {!radar.privacy && <p className="small">지금은 장바구니에 담은 고객에게 공구를 열어요. 찜한 고객은 카페24 개인정보 권한 승인 후 함께 초대돼요.</p>}
      </div>
      {pick && <CampaignForm key={pick.productNo} mall={mall} p={pick} say={say} onOpened={onOpened} />}
    </>
  );
}
