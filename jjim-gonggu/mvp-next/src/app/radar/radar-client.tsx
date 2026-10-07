"use client";

// S-03 수요 레이더 + S-E2 첫 수집 중. 숫자(count)만 보여 주고, 도달 가능 인원은 상품을 눌렀을 때만 계산한다.

import { useCallback, useEffect, useState } from "react";

type Sort = "total" | "wishlist" | "cart";
interface Row { productNo: number; name: string; price: number; wishlist: number; cart: number }
interface Run { id: number; status: "running" | "done" | "failed"; total: number; done: number; startedAt: string; finishedAt: string | null }
interface Radar { run: Run | null; current: Run | null; rows: Row[] }
interface Reach { productNo: number; interested: number; reachable: number; wishlistCapped: boolean }

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const when = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const SORTS: [Sort, string][] = [["total", "전체"], ["wishlist", "찜"], ["cart", "장바구니"]];

export default function RadarClient() {
  const [sort, setSort] = useState<Sort>("total");
  const [data, setData] = useState<Radar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Row | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/demand?sort=${sort}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setError(null);
    } catch {
      setError("수요 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }, [sort]);

  const collect = useCallback(async () => {
    await fetch("/api/v1/demand/collect", { method: "POST" });
    await load();
  }, [load]);

  useEffect(() => { load(); }, [load]);

  const running = data?.current?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running, load]);

  if (!data) return <main><h1>수요 레이더</h1><p className="muted">{error ?? "불러오는 중…"}</p></main>;

  // 아직 완료된 수집이 없음: 첫 수집 화면(S-E2) 또는 시작 버튼
  if (!data.run) {
    const cur = data.current;
    return (
      <main>
        <a className="back" href="/">‹ 홈</a>
        <h1>수요 레이더</h1>
        {cur?.status === "running" ? (
          <div className="card" aria-live="polite">
            <strong>찜 데이터를 처음으로 모으고 있어요</strong>
            <p className="muted">상품마다 하나씩 확인해서 상품이 많으면 몇 분에서 몇 시간 걸릴 수 있어요. 이 화면을 닫아도 수집은 계속돼요.</p>
            <Progress done={cur.done} total={cur.total} />
          </div>
        ) : (
          <div className="card">
            <strong>{cur?.status === "failed" ? "수집이 중간에 멈췄어요" : "어떤 상품에 찜이 몰렸는지 확인해 볼까요?"}</strong>
            <p className="muted">상품별 찜·장바구니 수를 모아 공구를 열 만한 상품을 찾아 드려요. 고객 개인정보는 이 단계에서 보지 않아요.</p>
            <button className="btn" onClick={collect}>{cur?.status === "failed" ? "다시 수집하기" : "수집 시작"}</button>
          </div>
        )}
        {error && <p className="err">{error}</p>}
      </main>
    );
  }

  const max = Math.max(1, ...data.rows.map((r) => r.wishlist + r.cart));
  return (
    <main>
      <a className="back" href="/">‹ 홈</a>
      <h1>수요 레이더</h1>
      <p className="muted">
        {when(data.run.finishedAt ?? data.run.startedAt)} 기준 · 상품 {data.run.total}개 확인
        {running ? ` · 새로 수집 중 ${data.current!.done}/${data.current!.total}` : ""}
      </p>
      <div className="toolbar">
        <div className="seg" role="radiogroup" aria-label="정렬">
          {SORTS.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={sort === k} onClick={() => setSort(k)}>{label}</button>
          ))}
        </div>
        <button className="ghost" onClick={collect} disabled={running}>{running ? "수집 중…" : "다시 수집"}</button>
      </div>

      {data.rows.length === 0 ? (
        <div className="card"><p className="muted">아직 찜이나 장바구니에 담긴 상품이 없어요.</p></div>
      ) : (
        <ol className="list">
          {data.rows.map((r, i) => (
            <li key={r.productNo}>
              <button className="item" onClick={() => setPicked(r)}>
                <span className="rank">{i + 1}</span>
                <span className="meta">
                  <b>{r.name}</b>
                  <small>{won(r.price)} · 찜 {r.wishlist} · 장바구니 {r.cart}</small>
                  <span className="bars" aria-hidden="true">
                    <i style={{ width: `${(r.wishlist / max) * 100}%` }} />
                    <i className="c" style={{ width: `${(r.cart / max) * 100}%` }} />
                  </span>
                </span>
                <span className="chev" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="legend"><i /> 찜 <i className="c" /> 장바구니 · 장바구니는 쇼핑몰 보관 기간이 지나면 사라져 최근 관심만 반영돼요.</p>
      {error && <p className="err">{error}</p>}
      {picked && <ReachSheet row={picked} onClose={() => setPicked(null)} />}
    </main>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="prog">
      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      <small>{total ? `${done} / ${total}개 상품 확인 (${pct}%)` : "상품 목록을 불러오는 중…"}</small>
    </div>
  );
}

function ReachSheet({ row, onClose }: { row: Row; onClose: () => void }) {
  const [reach, setReach] = useState<Reach | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/v1/demand/reach?product_no=${row.productNo}`).then(async (r) => (r.ok ? setReach(await r.json()) : setFailed(true))).catch(() => setFailed(true));
  }, [row.productNo]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={`${row.name} 공구 대상`} onClick={onClose}>
      <div className="in" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>{row.name}</h2>
        <p className="muted">찜 {row.wishlist} · 장바구니 {row.cart}</p>
        {failed ? (
          <p className="err">대상 고객 수를 확인하지 못했어요.</p>
        ) : !reach ? (
          <p className="muted">문자 수신동의 고객을 확인하는 중…</p>
        ) : (
          <>
            <div className="kpi">
              <div><small>관심 고객 (중복 제외)</small><strong>{reach.interested}명</strong></div>
              <div className="hl"><small>공구 초대를 받을 수 있는 고객</small><strong>{reach.reachable}명</strong></div>
            </div>
            <p className="muted">광고 문자는 수신동의한 고객에게만 보내요. 동의하지 않은 고객도 상품 페이지 위젯으로 공구를 볼 수 있어요.</p>
            {reach.wishlistCapped && <p className="warn">찜한 회원이 많아 일부만 확인됐어요. 실제 대상은 이보다 많을 수 있어요.</p>}
          </>
        )}
        <button className="btn" disabled title="3단계에서 연결돼요">이 상품으로 공구 열기</button>
        <button className="ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
