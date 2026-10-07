// 데모 안내: 모의 쇼핑몰(LINEN & CO.)에서 공구 한 번을 처음부터 끝까지 눌러 본다.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getDemo } from "@/lib/server";
import { DEMO_BRAND } from "@/lib/cafe24/mock";
import { fmtKst } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "데모 · 찜꽁", robots: { index: false } };

export default async function DemoPage() {
  const demo = await getDemo();
  if (!demo) notFound();
  return (
    <main style={{ maxWidth: 720 }}>
      <h1>찜꽁 데모</h1>
      <p className="muted">모의 카페24 쇼핑몰({DEMO_BRAND})에서 공구 한 번을 끝까지 눌러 볼 수 있어요. 실제 문자·결제는 일어나지 않고, 서버를 다시 켜면 처음부터 시작해요. 데모 시각 {fmtKst(demo.clock.now())}</p>
      <div className="card">
        <b>1. 운영자 화면에서 공구 열기</b>
        <span className="muted">운영자 토큰: <code>{env().adminToken}</code></span>
        <span className="muted">새 공구 → 찜 데이터 모으기 → 상품 선택 → 미리보기 → 공구 열기</span>
        <a className="btn" href="/admin" style={{ width: "max-content" }}>운영자 화면 열기</a>
      </div>
      <div className="card">
        <b>2. 고객이 되어 상품 페이지에서 신청하기</b>
        <span className="muted">회원을 바꿔 가며 위젯으로 신청해 보세요. 문자 수신 동의자만 초대 문자를 받아요.</span>
        <a className="ghost" href="/demo/shop/102?member=m62" style={{ width: "max-content", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>스톤웨어 디너 접시 상품 페이지</a>
      </div>
      <div className="card">
        <b>3. 상품 페이지 위쪽 데모 막대로 시간 넘기기</b>
        <span className="muted">마감 시각으로 → 판정·쿠폰 발급 → 고객이 쿠폰으로 결제 → 결제 기간 끝으로 → 확정 리포트 → 운영자 화면에서 생산 결정 기록 → 4주 판정표</span>
      </div>
      <div className="card">
        <b>판매자 화면 (카페24 앱 실행 화면)</b>
        <span className="muted">카페24 관리자에서 앱을 실행한 것처럼 판매자 홈과 수요 레이더를 볼 수 있어요.</span>
        <a className="ghost" href="/api/cafe24/launch" style={{ width: "max-content", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>판매자로 들어가기</a>
      </div>
    </main>
  );
}
