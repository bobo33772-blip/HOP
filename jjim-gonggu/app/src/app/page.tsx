// 판매자 홈: 연결 상태 · 내 공구(리포트 링크) · 공구 관리 · 수요 레이더.

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fmtKst } from "@/lib/time";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";
import { SCOPES } from "@/lib/cafe24/scopes";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  const { mock } = env();

  if (!session) {
    return (
      <main>
        <span className="pill">{mock ? "로컬 데모 모드" : "카페24 연동 모드"}</span>
        <h1>찜꽁</h1>
        <p className="muted">카페24 관리자 &gt; 앱에서 '찜꽁'을 실행하면 이 화면이 열려요.</p>
        {mock && <a className="btn" href="/api/cafe24/launch">데모 쇼핑몰로 시작하기</a>}
        {mock && <a className="ghost" href="/demo" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>데모 안내 (운영자·고객 화면)</a>}
      </main>
    );
  }

  const db = await getDb();
  const [mall] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, session.mallId));
  const camps = await db.select({ id: schema.campaigns.id, productName: schema.campaigns.productName, state: schema.campaigns.state, deadlineAt: schema.campaigns.deadlineAt, reportToken: schema.campaigns.reportToken })
    .from(schema.campaigns).where(eq(schema.campaigns.mallId, session.mallId)).orderBy(desc(schema.campaigns.openedAt)).limit(10);
  const STATE: Record<string, string> = { open: "모집 중", reached: "목표 달성 · 결제 기간", failed: "진행 안 됨", settled: "확정 완료" };

  return (
    <main>
      <span className="pill">{mock ? "로컬 데모 모드" : "카페24 연동 모드"}</span>
      <h1>{session.mallId} 쇼핑몰</h1>
      <div className="card">
        <div className="row"><span>앱 연결</span><span className="ok">연결됨 ✓</span></div>
        <div className="row"><span>요금제</span><span>{mall?.plan ?? "trial"}</span></div>
        <div className="row"><span>상품 페이지 위젯</span><span>{mall?.scriptTagNo || mock ? "설치됨" : "설치 필요"}</span></div>
      </div>
      <div className="card">
        <strong>내 공구</strong>
        {camps.length === 0 ? <p className="muted">아직 연 공구가 없어요. 찜이 많은 상품으로 첫 공구를 열어 보세요.</p> : camps.map((c) => (
          <a key={c.id} className="row" href={`/r/${c.reportToken}`} style={{ color: "inherit", textDecoration: "none" }}>
            <span>{c.productName}<br /><span className="small">마감 {fmtKst(c.deadlineAt)}</span></span><span className="pill">{STATE[c.state] ?? c.state} ›</span>
          </a>
        ))}
      </div>
      <a className="btn" href="/campaigns">공구 관리 · 새 공구 열기</a>
      <a className="ghost" href="/radar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>수요 레이더 보기</a>
      <div className="card">
        <strong>찜꽁이 쓰는 권한 {SCOPES.length}개</strong>
        {SCOPES.map((s) => (
          <p key={s.scope} className="muted"><code>{s.scope}</code> · {s.why}</p>
        ))}
      </div>
    </main>
  );
}
