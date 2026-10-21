"use client";

// 새 공구 1단계: 알림 신청 · 장바구니가 많은 상품 상위 20에서 고르기. 운영자 OP-1(상위 20) / 판매자 S-04 · S-E2(첫 수집 중).

import { useCallback, useEffect, useState } from "react";

/** 휴대폰 폭(560px 이하)인지. 표 대신 목록으로 그릴 때 쓴다 (#9) */
export function useNarrow(max = 560) {
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
  const [radar, setRadar] = useState<{ run: Run | null; current: Run | null; rows: RadarRow[] } | null>(null);
  const [pick, setPick] = useState<RadarRow | null>(null);
  const [sort, setSort] = useState<"cart" | "alert">("cart");
  const load = useCallback(() => a.call<{ run: Run | null; current: Run | null; rows: RadarRow[] }>("GET", `${a.mallBase}/radar`).then(setRadar).catch((e) => say(e.message)), [a, mall, say]);
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
        <div className="row" style={{ flexWrap: "wrap" }}><h2 className="step-title" style={{ flexWrap: "wrap", rowGap: 2 }}><span className="n">1</span>상품 고르기 <span className="small">알림 신청·장바구니 많은 순 상위 20개</span></h2>
          <button className="ghost" style={{ flex: "none", whiteSpace: "nowrap" }} onClick={collect} disabled={running}>{running ? `수집 중 ${radar.current!.done}/${radar.current!.total}` : radar.run ? "다시 수집" : "관심 데이터 모으기"}</button></div>
        <p className="muted">{a.role === "admin" ? "판매자와 통화하며 함께 고르세요. 이 목록은 숫자만 있어 판매자에게 그대로 보여 줘도 괜찮아요." : "공구 알림 신청과 장바구니가 많은 상품부터 보여 드려요. 재생산을 고민 중인 상품을 골라 보세요."}{radar.run && ` · ${kst(radar.run.finishedAt ?? radar.run.startedAt)} 기준`}</p>
        {!radar.run && radar.rows.length === 0 ? <p className="muted">{running ? "상품마다 하나씩 확인하는 중이에요. 상품이 많으면 몇 분에서 몇 시간 걸려요." : "아직 모은 데이터가 없어요. 위 버튼으로 시작하세요."}</p> : radar.run && radar.rows.length === 0 ? <p className="muted">{"아직 공구 알림 신청이나 장바구니에 담긴 상품이 없어요. 고객이 쇼핑몰에 로그인한 뒤 상품을 장바구니에 담거나, 품절 상품의 '재입고 · 공구 알림 받기'를 누르면 여기에 나와요. 처음 설치했다면 테스트 회원으로 직접 담아 보고 '다시 수집'을 누르세요."}</p> : (
          // 시안 3: 넓은 화면 · 휴대폰 모두 같은 표. 장바구니 · 알림 신청 열을 누르면 그 순서로, 줄을 누르면 고른다
          <div className="pick-table"><table>
            <caption className="sr">상품별 장바구니 · 알림 신청 수</caption>
            <thead><tr>
              <th scope="col"><span className="sr">선택</span></th><th scope="col">상품</th>
              {([["cart", "장바구니"], ["alert", "알림 신청"]] as const).map(([k, l]) => (
                <th key={k} scope="col" aria-sort={sort === k ? "descending" : "none"}>
                  <button type="button" className={sort === k ? "on" : undefined} onClick={() => setSort(k)}>{l}{sort === k ? " ↓" : ""}</button>
                </th>
              ))}
            </tr></thead>
            <tbody>{[...radar.rows].sort((x, y) => y[sort] - x[sort] || y.cart + y.alert - (x.cart + x.alert)).map((p) => {
              const on = pick?.productNo === p.productNo;
              return (
                <tr key={p.productNo} className={on ? "on" : undefined} onClick={() => setPick(p)}>
                  <td><input type="radio" name="pick-product" checked={on} onChange={() => setPick(p)} aria-label={`${p.name} 고르기`} /></td>
                  <td><b>{p.name}</b>{p.soldOut && <> <span className="chip">품절</span></>}<small>정가 {won(p.price)}</small></td>
                  <td className="num">{p.cart}</td><td className="num">{p.alert}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <p className="small">상품 페이지 위젯에서 &lsquo;공구 열리면 알림 받기&rsquo;를 신청한 고객과 장바구니에 담은 고객에게 공구를 열어요. 알림 신청은 공구를 열면 초대와 함께 비워져요.</p>
      </div>
      {pick && <CampaignForm key={pick.productNo} mall={mall} p={pick} say={say} onOpened={onOpened} />}
    </>
  );
}
