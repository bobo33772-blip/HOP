// 판매자에게 링크로 주는 읽기 전용 확정 리포트. 추측하기 어려운 토큰으로만 열리고, 회원 ID 등 개인정보는 넣지 않는다.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { getCtx } from "@/lib/server";
import { buildReport } from "@/lib/engine/report";
import { fmtKst, won } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "공구 리포트 · 찜꽁", robots: { index: false, follow: false }, referrer: "no-referrer" };

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toFixed(1)}%`);
const LABEL = { open: ["모집 중", "open"], reached: ["목표 달성 · 결제 기간", "ok"], failed: ["진행 안 됨", "bad"], settled: ["확정 완료", "ok"] } as const;

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const ctx = await getCtx();
  const [c] = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns).where(eq(schema.campaigns.reportToken, token));
  if (!c) notFound();
  const r = await buildReport(ctx, c.id);
  const k = r.campaign;
  const [label, cls] = LABEL[k.state];

  return (
    <main style={{ maxWidth: 720 }}>
      <div className="row" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
        <h1>{k.productName} 공구 리포트</h1>
        <span className={`chip ${cls}`}>{label}</span>
      </div>
      <p className="muted">정가 {won(k.listPrice)} → 공구가 {won(k.dealPrice)} · 목표 {k.targetQty}개 · 마감 {fmtKst(k.deadlineAt)} · 예상 출고 {k.shipEta}</p>

      {k.state === "settled" ? (
        <div className="card" style={{ borderColor: "var(--success)" }}>
          <span className="small">확정 수량 (결제 완료 기준)</span>
          <div className="hero-num">{r.confirmed.qty}<small> 개</small></div>
          <p className="muted">이 숫자만큼 생산·발주하면 재고가 남지 않아요.</p>
        </div>
      ) : k.state === "reached" ? (
        <div className="card">
          <span className="small">결제 기간 {fmtKst(k.payUntil)}까지 · 지금까지 결제</span>
          <div className="hero-num">{r.confirmed.qty}<small> 개</small></div>
          <p className="muted">예상 확정 수량은 약 {r.confirmed.expected}개예요. 결제 기간이 끝나면 확정 수량이 정해지니 아직 발주하지 마세요.</p>
        </div>
      ) : k.state === "failed" ? (
        <div className="card">
          <b>목표에 못 미쳐 진행되지 않았어요.</b>
          <p className="muted">결제된 금액이 없고, 만든 재고도 없어요. 목표 수량을 낮춰 다시 열 수 있어요.</p>
        </div>
      ) : (
        <div className="card">
          <b>모집 중이에요.</b>
          <div className="bar"><i style={{ width: `${Math.min(100, (r.funnel.pledgedQty / k.targetQty) * 100)}%` }} /></div>
          <span className="muted">{r.funnel.pledgedQty} / {k.targetQty}개 · {fmtKst(k.deadlineAt)} 마감</span>
        </div>
      )}

      <div className="kpi many">
        <div><small>초대 문자</small><strong>{r.funnel.invitedSent}</strong></div>
        <div><small>신청 (명)</small><strong>{r.funnel.pledgers}</strong></div>
        <div><small>쿠폰 발급</small><strong>{r.funnel.couponIssued}</strong></div>
        <div><small>결제 (명)</small><strong>{r.funnel.paidMembers}</strong></div>
      </div>
      <div className="tw"><table><tbody>
        <tr><td>초대 → 신청</td><td className="mono">{pct(r.rates.inviteToPledge)}</td></tr>
        <tr><td>신청 → 결제</td><td className="mono">{pct(r.rates.pledgeToPaid)}</td></tr>
        <tr><td>확정 매출</td><td className="mono">{won(r.confirmed.revenue)}</td></tr>
        <tr><td>미결제 · 취소 · 기한 뒤 결제</td><td className="mono">{r.confirmed.unpaidMembers}명 · {r.confirmed.cancelledOrders}건 · {r.confirmed.lateOrders}건</td></tr>
        <tr><td>성공 수수료 (스타터 1.5%)</td><td className="mono">{won(r.confirmed.successFee)} <span className="small">· 파일럿 기간은 받지 않아요</span></td></tr>
        {k.decision && <tr><td>생산·발주 결정</td><td>{k.decision.qty}개 · {k.decision.note} <span className="small">({fmtKst(k.decision.at)})</span></td></tr>}
      </tbody></table></div>
      <p className="small">결제 완료 수량은 쇼핑몰 주문 기록과 매일 밤 다시 대조해요. 이 페이지는 읽기 전용이고, 고객 개인정보는 담지 않아요.</p>
    </main>
  );
}
