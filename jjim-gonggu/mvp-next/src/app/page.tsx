// 판매자 홈 (1단계: 설치 상태 확인용). 수요 레이더·공구 개설 화면은 2~3단계에서 붙인다.

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
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
        <h1>찜 공구</h1>
        <p className="muted">카페24 관리자 &gt; 앱에서 '찜 공구'를 실행하면 이 화면이 열려요.</p>
        {mock && <a className="btn" href="/api/cafe24/launch">데모 쇼핑몰로 시작하기</a>}
      </main>
    );
  }

  const db = await getDb();
  const [mall] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, session.mallId));

  return (
    <main>
      <span className="pill">{mock ? "로컬 데모 모드" : "카페24 연동 모드"}</span>
      <h1>{session.mallId} 쇼핑몰</h1>
      <div className="card">
        <div className="row"><span>앱 연결</span><span className="ok">연결됨 ✓</span></div>
        <div className="row"><span>요금제</span><span>{mall?.plan ?? "trial"}</span></div>
        <div className="row"><span>상품 페이지 위젯</span><span>{mall?.scriptTagNo || mock ? "설치됨" : "설치 필요"}</span></div>
      </div>
      <a className="btn" href="/radar">수요 레이더 보기</a>
      <div className="card">
        <strong>찜 공구가 쓰는 권한 {SCOPES.length}개</strong>
        {SCOPES.map((s) => (
          <p key={s.scope} className="muted"><code>{s.scope}</code> · {s.why}</p>
        ))}
      </div>
    </main>
  );
}
