// 판매자 홈: 시작하기 체크리스트 · 숫자 요약 · 내 공구(진행률) · 권한 안내.

import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { fmtKst } from "@/lib/time";
import WidgetInstallButton from "./components/widget-install-button";
import AppBar from "./components/app-bar";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";
import { getCtx } from "@/lib/server";
import { listCampaigns } from "@/lib/engine/campaigns";
import { requestedScopes } from "@/lib/cafe24/scopes";

export const dynamic = "force-dynamic";

const STATE: Record<string, [string, string]> = { open: ["모집 중", "open"], reached: ["달성 · 결제 기간", "ok"], failed: ["진행 안 됨", "bad"], settled: ["확정 완료", "ok"] };

export default async function Home() {
  const session = await getSession();
  const { mock } = env();

  if (!session) {
    return (
      <main style={{ minHeight: "100dvh", alignContent: "center", justifyItems: "center", textAlign: "center" }}>
        <img src="/logo.svg" alt="" width={72} height={72} style={{ borderRadius: 18 }} />
        <h1>찜꽁</h1>
        <p className="muted">찜·장바구니 고객과 함께 여는 결제 없는 예약 공동구매<br />카페24 관리자 › 앱 › 마이앱에서 &lsquo;찜꽁&rsquo;을 실행하면 이 화면이 열려요.</p>
        {mock && <a className="btn brand" href="/api/cafe24/launch">데모 쇼핑몰로 시작하기</a>}
        {mock && <a className="ghost" href="/demo">데모 안내 (운영자·고객 화면)</a>}
        <nav className="legal"><a href="/privacy">개인정보 처리방침</a><a href="/terms">이용약관</a></nav>
      </main>
    );
  }

  const ctx = await getCtx();
  const [mall] = await ctx.db.select().from(schema.malls).where(eq(schema.malls.mallId, session.mallId));
  const camps = (await listCampaigns(ctx, session.mallId)).slice(0, 12);
  const profileDone = !!(mall?.brandName && mall?.smsSender && mall?.optOutNumber);
  const widgetDone = !!mall?.scriptTagNo || mock;
  const steps = [
    { done: profileDone, title: "쇼핑몰 정보 등록", hint: "브랜드명·문자 발신번호·무료수신거부 번호", href: "/campaigns?tab=profile" },
    { done: widgetDone, title: "상품 페이지 위젯 설치", hint: "공구 중인 상품에 진행률과 참여 버튼이 보여요", href: null },
    { done: camps.length > 0, title: "첫 공구 열기", hint: "공구 알림 신청·장바구니가 많은 상품부터 추천해 드려요", href: "/campaigns?tab=new" },
  ];
  const allDone = steps.every((s) => s.done);
  const open = camps.filter((c) => c.state === "open");
  const stats = [
    ["모집 중인 공구", open.length],
    ["모집된 수량", open.reduce((n, c) => n + c.pledgedQty, 0)],
    ["달성한 공구", camps.filter((c) => c.state === "reached" || c.state === "settled").length],
  ] as const;

  return (
    <>
      <AppBar current="home" shop={mall?.brandName ?? session.mallId} />
      <main>
        <div className="hello">
          <span className="eyebrow">{mock ? "데모 모드" : "카페24 연결됨"}</span>
          <h1>{mall?.brandName ?? session.mallId}님, 안녕하세요</h1>
          <p className="muted">찜·장바구니에 담아 둔 고객이 모이면, 그때 만들고 파세요.</p>
        </div>

        {!allDone && (
          <div className="card">
            <div className="section-head"><h2>시작하기</h2><span className="small">{steps.filter((s) => s.done).length} / {steps.length}</span></div>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.title} className={s.done ? "done" : undefined}>
                  <span className="dot" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                  <span className="t">{s.title}<small>{s.hint}</small></span>
                  {!s.done && (s.href ? <a className="ghost" href={s.href}>하기</a> : i === 1 ? <WidgetInstallButton /> : null)}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="stats">
          {stats.map(([label, n]) => <div key={label} className="stat"><small>{label}</small><strong>{n}</strong></div>)}
        </div>

        <div className="section-head"><h2>내 공구</h2>{camps.length > 0 && <a href="/campaigns">전체 보기 ›</a>}</div>
        {camps.length === 0 ? (
          <div className="card empty">
            <img src="/logo.svg" alt="" />
            <b>아직 연 공구가 없어요</b>
            <p className="muted">고객이 많이 담아 둔 상품으로 첫 공구를 열어 보세요.</p>
          </div>
        ) : (
          <div className="camps">
            {camps.map((c) => {
              const [label, cls] = STATE[c.state] ?? [c.state, ""];
              const ratio = Math.min(1, c.pledgedQty / c.targetQty);
              return (
                <a key={c.id} className="card camp" href={`/campaigns?open=${c.id}`}>
                  <div className="row"><span className="name">{c.productName}</span><span className={`chip ${cls}`}>{label}</span></div>
                  <div className="count">{c.pledgedQty}<small> / {c.targetQty}개</small></div>
                  <div className={`bar${ratio >= 1 ? " ok" : ""}`}><i style={{ width: `${ratio * 100}%` }} /></div>
                  <span className="small">마감 {fmtKst(c.deadlineAt)}</span>
                </a>
              );
            })}
          </div>
        )}

        <a className="btn brand" href="/campaigns?tab=new">＋ 새 공구 열기</a>
        <a className="ghost" href="/radar">수요 레이더 · 어떤 상품에 관심이 몰렸는지 보기</a>

        <details className="card">
          <summary>찜꽁이 쓰는 카페24 권한 {requestedScopes().length}개</summary>
          {requestedScopes().map((s) => <p key={s.scope} className="small"><code>{s.scope}</code> · {s.why}</p>)}
        </details>
        <nav className="legal"><a href="/privacy">개인정보 처리방침</a><a href="/terms">이용약관</a></nav>
      </main>
    </>
  );
}
