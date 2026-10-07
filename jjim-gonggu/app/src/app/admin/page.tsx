// 운영자 화면. 파일럿 기간에는 판매자 앱 대신 운영팀이 판매자와 통화하며 공구를 연다.

import type { Metadata } from "next";
import { env } from "@/lib/env";
import { isAdmin } from "@/lib/http";
import AdminClient from "./admin-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "운영자 · 찜 공구", robots: { index: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await isAdmin()) return <AdminClient mock={env().mock} />;
  const { e } = await searchParams;
  return (
    <main style={{ maxWidth: 420, paddingTop: 80 }}>
      <form className="card" method="post" action="/api/admin/login">
        <h1>찜 공구 운영자</h1>
        <label className="muted" htmlFor="token">운영자 토큰</label>
        <input id="token" name="token" type="password" className="field" autoComplete="current-password" required />
        {e && <p className="err" role="alert">토큰이 맞지 않아요.</p>}
        {env().mock && <p className="small">데모 모드: 토큰은 <a href="/demo">데모 안내</a>에 있어요.</p>}
        <button className="btn" type="submit">로그인</button>
      </form>
    </main>
  );
}
