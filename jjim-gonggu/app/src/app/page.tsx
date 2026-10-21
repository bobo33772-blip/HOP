// 판매자 대시보드(예전 홈): 가장 급한 일 한 줄 · 시작하기 · 숫자 요약 · 공구 매출 그래프(#92) · 최근 공구 · 셀러 가이드라인.
// 메뉴 이름(공구 관리 · 공구 열기 · 매출 리포트)과 구역 이름을 맞춰, 구역을 누르면 같은 이름의 화면으로 간다.

import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { fmtKst } from "@/lib/time";
import WidgetInstallButton from "./components/widget-install-button";
import AppBar from "./components/app-bar";
import HomeSales from "./components/home-sales";
import SellerOnboarding from "./components/seller-onboarding";
import { env } from "@/lib/env";
import { DemoRoleBadge } from "./components/demo-role";
import { launchErrorMessage } from "@/lib/launch-errors";
import { getSession } from "@/lib/session";
import { getCtx } from "@/lib/server";
import { listCampaigns } from "@/lib/engine/campaigns";
import SellerGuide from "./components/seller-guide";
import { CHIP } from "./console/format";
import type { State } from "./console/types";

export const dynamic = "force-dynamic";


export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const session = await getSession();
  const { mock } = env();
  // 카페24 실행 · 설치가 실패해 돌아온 경우의 안내 한 줄 (#28). 정해 둔 코드만 문구로 바꾼다
  const notice = launchErrorMessage((await searchParams).error);

  if (!session) {
    return (
      <main style={{ minHeight: "100dvh", alignContent: "center", justifyItems: "center", textAlign: "center" }}>
        <img src="/logo.svg" alt="" width={72} height={72} style={{ borderRadius: 18 }} />
        <h1>찜꽁</h1>
        {notice && <p className="err" role="alert">{notice}</p>}
        <p className="muted">알림 신청·장바구니 고객과 함께 여는 결제 없는 예약 공동구매<br />카페24 관리자 › 앱 › 마이앱에서 &lsquo;찜꽁&rsquo;을 실행하면 이 화면이 열려요.</p>
        {mock && <a className="btn brand" href="/api/cafe24/launch">데모 쇼핑몰로 시작하기</a>}
        {mock && <a className="ghost" href="/demo">데모 안내 (판매자 · 소비자 · 관리자)</a>}
        <nav className="legal"><a href="/privacy">개인정보 처리방침</a><a href="/terms">이용약관</a></nav>
      </main>
    );
  }

  const ctx = await getCtx();
  const [mall] = await ctx.db.select().from(schema.malls).where(eq(schema.malls.mallId, session.mallId));
  const camps = (await listCampaigns(ctx, session.mallId)).slice(0, 12);
  const profileDone = !!(mall?.brandName && mall?.smsSender && mall?.optOutNumber);
  const widgetDone = !!mall?.scriptTagNo || mock;
  // '첫 공구 열기'는 온보딩(#89)에서 안내해서 시작하기에서는 뺐다
  const steps = [
    { done: profileDone, title: "쇼핑몰 정보 등록", hint: "브랜드명·문자 발신번호·080 무료수신거부 번호", href: "/campaigns?tab=profile" },
    { done: widgetDone, title: "상품 페이지 위젯 설치", hint: "공구 중인 상품에 진행률과 참여 버튼이 보여요", href: null },
  ];
  const allDone = steps.every((s) => s.done);
  const open = camps.filter((c) => c.state === "open");
  const stats = [
    ["모집 중인 공구", open.length],
    ["모집된 수량", open.reduce((n, c) => n + c.pledgedQty, 0)],
    ["달성한 공구", camps.filter((c) => c.state === "reached" || c.state === "settled").length],
  ] as const;
  // 가장 급한 일 한 줄: 결제 기간 중 결제 마감이 가장 가까운 공구, 없으면 모집 마감이 가장 가까운 공구
  const now = ctx.clock.now().getTime();
  const daysLeft = (d: Date) => Math.max(0, Math.ceil((d.getTime() - now) / 86_400_000));
  const dday = (d: Date) => (daysLeft(d) === 0 ? "D-DAY" : `D-${daysLeft(d)}`);
  const paying = camps.filter((c) => c.state === "reached" && c.payUntil).sort((x, y) => x.payUntil!.getTime() - y.payUntil!.getTime())[0];
  const closing = [...open].sort((x, y) => x.deadlineAt.getTime() - y.deadlineAt.getTime())[0];
  const urgent = paying
    ? { href: `/campaigns?open=${paying.id}`, title: `결제 마감 ${dday(paying.payUntil!)}`, text: `${paying.productName} · 결제 마감 ${fmtKst(paying.payUntil!)}` }
    : closing
      ? { href: `/campaigns?open=${closing.id}`, title: `모집 마감 ${dday(closing.deadlineAt)}`, text: `${closing.productName} · ${closing.pledgedQty} / ${closing.targetQty}개 · 마감 ${fmtKst(closing.deadlineAt)}` }
      : null;
  const today = fmtKst(new Date(now)).split(" ")[0];

  return (
    <>
      <AppBar current="home" shop={mall?.brandName ?? session.mallId} />
      <main>
        {notice && <p className="err" role="alert">{notice}</p>}
        <div className="dash-head">
          <div className="hello">
            <span className="eyebrow">{mock ? "데모 모드" : "카페24 연결됨"}</span>
            <h1>대시보드</h1>
            <p className="muted">{mall?.brandName ?? session.mallId} · {today} · 지금 공구 현황이에요.</p>
            {/* 처음 들어오면 로고 인트로 + 사용법 장면이 저절로 열린다. 이 버튼으로 다시 본다 */}
            <SellerOnboarding />
          </div>
          <a className="btn dark compact" href="/campaigns?tab=new">＋ 공구 열기</a>
        </div>

        {urgent && <a className="callout" href={urgent.href}><b>{urgent.title}</b><span>{urgent.text}</span></a>}

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

        <div className="section-head"><h2>공구 현황</h2><a href="/radar">매출 리포트 ›</a></div>
        <div className="stats">
          {stats.map(([label, n]) => <div key={label} className="stat"><small>{label}</small><strong>{n}</strong></div>)}
        </div>

        {/* 공구 매출 그래프 (#92). 공구별 표 · 엑셀은 매출 리포트에 */}
        <HomeSales />

        <div className="section-head"><h2>최근 공구</h2>{camps.length > 0 && <a href="/campaigns">공구 관리 ›</a>}</div>
        {camps.length === 0 ? (
          <div className="card empty">
            <img src="/logo.svg" alt="" />
            <b>아직 연 공구가 없어요</b>
            <p className="muted">고객이 많이 담아 둔 상품으로 첫 공구를 열어 보세요.</p>
          </div>
        ) : (
          <ul className="list camp-rows">
            {camps.map((c) => {
              const [label, cls] = CHIP[c.state as State] ?? [c.state, ""];
              const ratio = Math.min(1, c.pledgedQty / c.targetQty);
              const due = c.state === "reached" && c.payUntil ? `결제 마감 ${fmtKst(c.payUntil)}` : `마감 ${fmtKst(c.deadlineAt)}`;
              return (
                <li key={c.id}>
                  <a className="item" href={`/campaigns?open=${c.id}`}>
                    <span className="meta">
                      <b>{c.productName}</b>
                      <span className={`bar${ratio >= 1 ? " ok" : ""}`}><i style={{ width: `${ratio * 100}%` }} /></span>
                      <small>{c.pledgedQty} / {c.targetQty}개 · {Math.round((c.pledgedQty / c.targetQty) * 100)}% · {due}</small>
                    </span>
                    <span className={`chip ${cls}`}>{label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        <details className="card">
          <summary>셀러 가이드라인 자세히 보기</summary>
          <SellerGuide />
        </details>
        <nav className="legal"><a href="/privacy">개인정보 처리방침</a><a href="/terms">이용약관</a></nav>
      </main>
      {mock && <DemoRoleBadge role="seller" />}
    </>
  );
}
