// 데모 안내 (#104): 판매자 · 소비자 · 관리자 중 누구의 화면을 볼지 고르고, 공구 한 번을 처음부터 끝까지 따라 해 본다.
// 모의 쇼핑몰(LINEN & CO.)이라 실제 문자 · 결제는 일어나지 않는다.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getDemo } from "@/lib/server";
import { DEMO_BRAND } from "@/lib/cafe24/mock";
import { DEMO_ROLES, type DemoRole } from "@/lib/demo-roles";
import { fmtKst } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "데모 · 찜꽁", robots: { index: false } };

// 역할마다 하는 일과 들어가는 곳. 순서는 실제 흐름(판매자가 열고 → 소비자가 신청 · 결제 → 관리자가 지켜봄)
const CARDS: { role: DemoRole; does: string[]; href: string; go: string }[] = [
  { role: "seller", does: ["고객이 기다리는 상품 보기 (장바구니 · 알림 신청)", "조건을 정해 공구 열기 · 초대 문자 예약", "모니터링에서 공구 매출 보기 · 엑셀"], href: "/api/cafe24/launch", go: "판매자로 들어가기" },
  { role: "shopper", does: ["상품 페이지에서 결제 없이 참여 신청", "목표를 채우면 문자로 쿠폰 받기", "쿠폰 쓰고 결제하기"], href: "/demo/shop/102?member=m62", go: "상품 페이지 열기" },
  { role: "admin", does: ["모든 쇼핑몰의 공구 · 매출 보기", "판매자와 통화하며 공구 대신 열기", "생산 결정 기록 · 4주 판정표"], href: "/admin", go: "관리자 화면 열기" },
];

// 한 번에 따라 하기. 데모 막대는 상품 페이지 위쪽의 시간 넘기기 막대
const FLOW: { role: DemoRole | "bar"; text: string }[] = [
  { role: "seller", text: "새 공구 → 상품 고르기 → 조건 정하기 → 미리보기 → 공구 열기" },
  { role: "shopper", text: "상품 페이지 위젯에서 참여 신청 (위쪽 '지금 고객'으로 회원을 바꿔 가며, '다른 고객 10명 신청'도 눌러 보기)" },
  { role: "bar", text: "마감 시각으로 → 목표를 채우면 쿠폰이 발급되고 문자함에 쿠폰 문자가 와요" },
  { role: "shopper", text: "위젯의 '쿠폰 쓰고 결제하러 가기' → 주문서로 결제 (보유 쿠폰 자동 적용)" },
  { role: "bar", text: "쿠폰 받은 고객 60% 결제 → 결제 기간 끝으로 → 공구가 확정돼요" },
  { role: "seller", text: "모니터링 › 리포트 · 기간별에서 확정 매출과 지난달 대비 보기" },
  { role: "admin", text: "공구 상세에서 생산 결정 기록 → 4주 판정표" },
];

function RoleTag({ role }: { role: DemoRole | "bar" }) {
  if (role === "bar") return <span className="chip">데모 막대</span>;
  const r = DEMO_ROLES[role];
  return <span className="chip" style={{ background: `color-mix(in srgb, ${r.color} 14%, var(--surface))`, color: r.ink }}>{r.name}</span>;
}

export default async function DemoPage() {
  const demo = await getDemo();
  if (!demo) notFound();
  return (
    <main style={{ maxWidth: 1040 }}>
      <div className="hello">
        <span className="eyebrow">데모 모드</span>
        <h1>찜꽁 데모</h1>
        <p className="muted">모의 카페24 쇼핑몰({DEMO_BRAND})에서 공구 한 번을 끝까지 눌러 볼 수 있어요. 실제 문자 · 결제는 일어나지 않고, 서버를 다시 켜면 처음부터 시작해요. 데모 시각 {fmtKst(demo.clock.now())}</p>
      </div>

      <section aria-labelledby="roles-title" style={{ display: "grid", gap: 14 }}>
        <h2 id="roles-title" style={{ fontSize: 18, margin: 0 }}>누구의 화면을 볼까요?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {CARDS.map(({ role, does, href, go }) => {
            const r = DEMO_ROLES[role];
            return (
              <div key={role} className="card" style={{ borderTop: `4px solid ${r.color}`, alignContent: "start" }}>
                <div style={{ display: "grid", gap: 2 }}>
                  <b style={{ fontSize: 20, color: r.ink }}>{r.name}</b>
                  <span className="small">{r.who} · {r.where}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>{does.map((d) => <li key={d}>{d}</li>)}</ul>
                {role === "admin" && <span className="small">관리자 토큰: <code style={{ wordBreak: "break-all" }}>{env().adminToken}</code></span>}
                <a className="btn" href={href} style={{ width: "max-content", marginTop: "auto", background: r.color, borderColor: r.color, color: "#fff" }}>{go} ›</a>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="flow-title">
        <h2 id="flow-title" style={{ fontSize: 18, margin: 0 }}>한 번에 따라 하기</h2>
        <p className="muted" style={{ margin: 0 }}>화면 오른쪽 아래에 지금 누구의 화면인지 보여요. &lsquo;역할 바꾸기&rsquo;를 누르면 여기로 돌아와요.</p>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {FLOW.map((s, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "28px 82px minmax(0, 1fr)", gap: 10, alignItems: "baseline" }}>
              <b className="small" style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1}</b>
              <RoleTag role={s.role} />
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
