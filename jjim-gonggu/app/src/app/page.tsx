// 판매자 대시보드(예전 홈, 시안 3 웹 시안 그대로): 가장 급한 일 한 줄 → 숫자 4칸(이번 달 확정 매출 · 결제 대기 · 모집 중 신청 금액 · 공구 성사율)
// → 주별 확정 매출(최근 8주) · 다음 공구 후보(알림 신청 · 장바구니) → 공구 관리 표(상품 · 상태 · 신청 · 목표 · 달성률 · 공구가 · 마감).
// 숫자는 매출 리포트(lib/engine/sales.ts), 후보는 공구 열기와 같은 관심 데이터(radar)에서 읽는다.

import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { fmtKst } from "@/lib/time";
import WidgetInstallButton from "./components/widget-install-button";
import AppBar from "./components/app-bar";
import SellerOnboarding from "./components/seller-onboarding";
import { env } from "@/lib/env";
import { DemoRoleBadge } from "./components/demo-role";
import { launchErrorMessage } from "@/lib/launch-errors";
import { getSession } from "@/lib/session";
import { getCtx } from "@/lib/server";
import { listCampaigns } from "@/lib/engine/campaigns";
import { bucketOf, salesOverview } from "@/lib/engine/sales";
import { radarState } from "@/lib/console-actions";
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
  const camps = await listCampaigns(ctx, session.mallId);
  // 매출 숫자와 후보는 화면 보조라, 못 읽어도 대시보드는 그린다
  const sales = await salesOverview(ctx, session.mallId, "week").catch(() => null);
  const radar = await radarState(ctx, session.mallId).catch(() => null);
  const profileDone = !!(mall?.brandName && mall?.smsSender && mall?.optOutNumber);
  const widgetDone = !!mall?.scriptTagNo || mock;
  // '첫 공구 열기'는 온보딩(#89)에서 안내해서 시작하기에서는 뺐다
  const steps = [
    { done: profileDone, title: "쇼핑몰 정보 등록", hint: "브랜드명·문자 발신번호·080 무료수신거부 번호", href: "/campaigns?tab=profile" },
    { done: widgetDone, title: "상품 페이지 위젯 설치", hint: "공구 중인 상품에 진행률과 참여 버튼이 보여요", href: null },
  ];
  const allDone = steps.every((s) => s.done);

  const nowD = ctx.clock.now(), now = nowD.getTime();
  const md = (d: Date | null) => (d ? fmtKst(d).split("(")[0] : "–");
  const daysLeft = (d: Date) => Math.max(0, Math.ceil((d.getTime() - now) / 86_400_000));
  const dday = (d: Date) => (daysLeft(d) === 0 ? "D-DAY" : `D-${daysLeft(d)}`);
  const num = (n: number) => Math.round(n).toLocaleString("ko-KR");

  // 가장 급한 일 한 줄: 결제 기간 중 결제 마감이 가장 가까운 공구, 없으면 모집 마감이 가장 가까운 공구
  const waitingOf = (id: string) => sales?.campaigns.find((r) => r.id === id)?.waitingMembers ?? 0;
  const paying = camps.filter((c) => c.state === "reached" && c.payUntil && c.payUntil.getTime() > now).sort((x, y) => x.payUntil!.getTime() - y.payUntil!.getTime())[0];
  const openCamps = camps.filter((c) => c.state === "open");
  const closing = [...openCamps].sort((x, y) => x.deadlineAt.getTime() - y.deadlineAt.getTime())[0];
  const urgent = paying
    ? { href: `/campaigns?open=${paying.id}`, title: `결제 마감 ${dday(paying.payUntil!)}`, text: <>{paying.productName} · 쿠폰을 받고 아직 결제하지 않은 고객 <b>{waitingOf(paying.id)}명</b> · {fmtKst(paying.payUntil!)} 마감</>, go: "결제 현황 보기" }
    : closing
      ? { href: `/campaigns?open=${closing.id}`, title: `모집 마감 ${dday(closing.deadlineAt)}`, text: <>{closing.productName} · {closing.pledgedQty} / {closing.targetQty}개 신청 · {fmtKst(closing.deadlineAt)} 마감</>, go: "공구 보기" }
      : null;

  // 숫자 4칸. 공구 성사율: 판정된 공구 중 목표를 채운 비율. 그래도 진행한 공구는 빼고, 모집 중 취소는 미달처럼 넣는다 (#24 · #72)
  const t = sales?.totals, w = sales?.waiting, rc = sales?.recruiting;
  const vs = !t ? "" : !t.lastMonth ? (t.thisMonth ? "지난달은 매출이 없었어요" : "아직 이번 달 매출이 없어요") : `${t.thisMonth >= t.lastMonth ? "▲" : "▼"} ${Math.abs(Math.round(((t.thisMonth - t.lastMonth) / t.lastMonth) * 100))}% 지난달 대비`;
  const judged = camps.filter((c) => !c.proceeded && ["reached", "settled", "failed", "cancelled"].includes(c.state));
  const succeeded = judged.filter((c) => c.state === "reached" || c.state === "settled").length;

  // 주별 확정 매출: 이번 주를 포함한 최근 8주 (매출이 없는 주도 0으로)
  const thisWeek = bucketOf(nowD, "week");
  const weekKey = (back: number) => new Date(Date.parse(`${thisWeek}T00:00:00Z`) - back * 7 * 86_400_000).toISOString().slice(0, 10);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const key = weekKey(7 - i);
    return { key, name: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`, value: sales?.trend.points.find((p) => p.key === key)?.revenue ?? 0 };
  });
  const top = Math.max(...weeks.map((x) => x.value));
  const step = top <= 0 ? 1 : (() => { const raw = top / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw)!; })();
  const axisMax = step * 4;
  const axis = (v: number) => (v >= 10_000 ? `${num(v / 10_000)}만` : num(v));

  // 다음 공구 후보: 공구 열기와 같은 관심 데이터에서 많은 순 4개
  const cands = (radar?.rows ?? []).slice(0, 4);
  const candMax = Math.max(1, ...cands.map((r) => r.alert + r.cart));

  // 공구 관리 표
  const DOT: Record<State, string> = { open: "var(--brand)", reached: "var(--warning)", settled: "var(--lav)", failed: "var(--muted)", cancelled: "var(--muted)" };
  const due = (c: (typeof camps)[number]) => {
    if (c.state === "open") return `${dday(c.deadlineAt)} · ${md(c.deadlineAt)}`;
    if (c.state === "reached") return c.payUntil ? `결제 ${dday(c.payUntil)} · ${md(c.payUntil)}` : md(c.deadlineAt);
    if (c.state === "settled") return `${md(c.payUntil ?? c.deadlineAt)} 확정`;
    return `${md(c.deadlineAt)} 종료`;
  };
  const count = (st: State) => camps.filter((c) => c.state === st).length;
  const summary = [`전체 ${camps.length}`, ...([["open", "모집 중"], ["reached", "결제 기간"], ["settled", "확정"], ["failed", "진행 안 됨"], ["cancelled", "취소"]] as const)
    .filter(([st]) => count(st) > 0).map(([st, l]) => `${l} ${count(st)}`)].join(" · ");

  return (
    <>
      <AppBar current="home" shop={mall?.brandName ?? session.mallId} />
      <main className="wide dash">
        {notice && <p className="err" role="alert">{notice}</p>}
        <div className="dash-head">
          <div className="hello">
            <h1>대시보드</h1>
            <p className="muted">{mall?.brandName ?? session.mallId} · {fmtKst(nowD).split(" ")[0].replace(/^(\d+)\/(\d+)\((.)\)$/, (_, m, d, wd) => `${m}월 ${d}일 ${wd}요일`)}{mock ? " · 데모 모드" : ""}</p>
          </div>
          <a className="btn dark compact" href="/campaigns?tab=new">＋ 공구 열기</a>
        </div>

        {urgent && (
          <a className="callout dash-alert" href={urgent.href}>
            <b>{urgent.title}</b><span>{urgent.text}</span><em>{urgent.go} →</em>
          </a>
        )}

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

        <section className="dash-kpis" aria-label="공구 매출 요약">
          <div><small>이번 달 확정 매출</small><strong>{num(t?.thisMonth ?? 0)}</strong><span className={t && t.lastMonth && t.thisMonth >= t.lastMonth ? "up" : undefined}>{vs || "–"}</span></div>
          <div><small>결제 대기</small><strong>{num(w?.amount ?? 0)}</strong><span>{w?.members ? `${w.members}명 · ${md(w.payUntil)} 마감` : "결제 기다리는 고객이 없어요"}</span></div>
          <div><small>모집 중 신청 금액</small><strong>{num(rc?.amount ?? 0)}</strong><span>공구 {rc?.campaigns ?? 0}건 · {rc?.qty ?? 0}개</span></div>
          <div><small>공구 성사율</small><strong>{judged.length ? `${Math.round((succeeded / judged.length) * 100)}%` : "–"}</strong><span>{judged.length ? `판정된 ${judged.length}건 중 ${succeeded}건 달성` : "아직 판정된 공구가 없어요"}</span></div>
        </section>

        <div className="dash-row">
          <section className="dash-chart" aria-labelledby="dash-chart-t">
            <div className="row"><h2 id="dash-chart-t">주별 확정 매출 <span>· 최근 8주</span></h2><span className="small">이번 주 <b>{num(weeks[7].value)}원</b></span></div>
            <div className="plot" role="img" aria-label={`최근 8주 확정 매출: ${weeks.map((x) => `${x.name} ${num(x.value)}원`).join(", ")}`}>
              <div className="ys" aria-hidden="true">{[4, 3, 2, 1, 0].map((i) => <span key={i}>{axis(step * i)}</span>)}</div>
              <div className="bars" aria-hidden="true">
                {weeks.map((x, i) => <span key={x.key} className={i === 7 ? "on" : undefined} style={{ height: `${Math.max(x.value ? 2 : 0.6, (x.value / axisMax) * 100)}%` }} />)}
              </div>
            </div>
            <div className="xs" aria-hidden="true">{weeks.map((x) => <span key={x.key}>{x.name}</span>)}</div>
          </section>

          <section className="dash-cands" aria-labelledby="dash-cands-t">
            <h2 id="dash-cands-t">다음 공구 후보</h2>
            <p className="legend"><i className="a" />알림 신청 <i className="c" />장바구니</p>
            {cands.length ? cands.map((r) => (
              <div key={r.productNo} className="cand">
                <span className="row"><b>{r.name}</b><b>{r.alert + r.cart}명</b></span>
                <span className="stack"><i className="a" style={{ width: `${(r.alert / candMax) * 100}%` }} /><i className="c" style={{ width: `${(r.cart / candMax) * 100}%` }} /></span>
              </div>
            )) : <p className="muted">아직 모은 관심 데이터가 없어요. 공구 열기에서 &lsquo;관심 데이터 모으기&rsquo;를 눌러 보세요.</p>}
            <a className="go" href="/campaigns?tab=new">후보에서 공구 열기 →</a>
          </section>
        </div>

        <section className="dash-table" aria-labelledby="dash-table-t">
          <div className="row"><h2 id="dash-table-t">공구 관리</h2><a href="/campaigns">{summary} →</a></div>
          {camps.length === 0 ? (
            <div className="empty"><img src="/logo.svg" alt="" /><b>아직 연 공구가 없어요</b><p className="muted">고객이 많이 담아 둔 상품으로 첫 공구를 열어 보세요.</p></div>
          ) : (
            <table>
              <thead><tr><th>상품</th><th>상태</th><th className="n">신청</th><th className="n hide-sm">목표</th><th className="hide-sm">달성률</th><th className="n hide-sm">공구가</th><th className="n">마감</th></tr></thead>
              <tbody>{camps.map((c) => {
                const [label] = CHIP[c.state as State] ?? [c.state];
                const ratio = c.pledgedQty / c.targetQty;
                return (
                  <tr key={c.id}>
                    <td><a href={`/campaigns?open=${c.id}`}>{c.productName}</a></td>
                    <td><span className="st"><i style={{ background: DOT[c.state as State] }} />{label}</span></td>
                    <td className="n"><b>{c.pledgedQty}</b><span className="of"> / {c.targetQty}</span></td>
                    <td className="n hide-sm">{c.targetQty}</td>
                    <td className="hide-sm"><span className="rate"><span className="track"><i style={{ width: `${Math.min(100, ratio * 100)}%`, background: DOT[c.state as State] }} /></span><span>{Math.round(ratio * 100)}%</span></span></td>
                    <td className="n hide-sm"><b>{num(c.dealPrice)}</b></td>
                    <td className="n due">{due(c)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </section>

        <details className="card">
          <summary>셀러 가이드라인 자세히 보기</summary>
          <SellerGuide />
        </details>
        {/* 처음 들어오면 로고 인트로 + 사용법 장면이 저절로 열린다. 이 버튼으로 다시 본다 */}
        <div className="dash-foot"><SellerOnboarding /></div>
        <nav className="legal"><a href="/privacy">개인정보 처리방침</a><a href="/terms">이용약관</a></nav>
      </main>
      {mock && <DemoRoleBadge role="seller" />}
    </>
  );
}
