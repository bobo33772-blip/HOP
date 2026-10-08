// OAuth Redirect URI. code → 토큰 교환 → 암호화 저장 → 위젯 스크립트 설치 → 대시보드.

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireReal } from "@/lib/env";
import { exchangeCode } from "@/lib/cafe24/oauth";
import { saveInstall } from "@/lib/malls";
import { installWidget } from "@/lib/console-actions";
import { getCtx } from "@/lib/server";
import { setSession } from "@/lib/session";

const STATE_TTL_MS = 10 * 60_000;

export async function GET(req: NextRequest) {
  const e = requireReal();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const db = await getDb();
  const [s] = await db.delete(schema.oauthStates).where(eq(schema.oauthStates.state, state)).returning();
  if (!s || Date.now() - s.createdAt.getTime() > STATE_TTL_MS) return NextResponse.json({ error: "invalid_state" }, { status: 400 });

  const tokens = await exchangeCode(s.mallId, e.CAFE24_CLIENT_ID, e.CAFE24_CLIENT_SECRET, code, e.redirectUri);
  await saveInstall(s.mallId, tokens);

  try {
    await installWidget(await getCtx(), s.mallId);
  } catch (err) {
    // 위젯 설치 실패는 설치 자체를 막지 않는다 — 판매자 홈의 '위젯 설치하기'로 다시 시도
    console.error("scripttag install failed", err);
  }

  await db.insert(schema.auditLogs).values({ mallId: s.mallId, actor: "system", action: "app.installed", detail: { scopes: tokens.scopes } });
  await setSession({ mallId: s.mallId, userId: null });
  return NextResponse.redirect(new URL("/", e.APP_BASE_URL));
}
