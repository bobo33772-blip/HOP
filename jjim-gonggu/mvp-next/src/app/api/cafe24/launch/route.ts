// 카페24 관리자 > 앱 실행 시 진입점 (개발자센터 'App URL'에 등록).
// HMAC 검증 → 설치돼 있으면 세션 발급 후 대시보드, 아니면 OAuth 권한 동의 화면으로.

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { verifyLaunch } from "@/lib/cafe24/hmac";
import { authorizeUrl } from "@/lib/cafe24/oauth";
import { DEMO_MALL, ensureDemoMall, hasValidInstall } from "@/lib/malls";
import { setSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const e = env();

  if (e.mock) {
    await ensureDemoMall();
    await setSession({ mallId: DEMO_MALL, userId: "demo-admin" });
    return NextResponse.redirect(new URL("/", e.APP_BASE_URL));
  }

  const v = verifyLaunch(req.nextUrl.search, e.CAFE24_CLIENT_SECRET);
  if (!v.ok) return NextResponse.json({ error: `launch_${v.reason}` }, { status: 401 });
  const { mallId, userId } = v.params;

  if (await hasValidInstall(mallId)) {
    await setSession({ mallId, userId });
    return NextResponse.redirect(new URL("/", e.APP_BASE_URL));
  }

  const state = randomBytes(16).toString("hex");
  const db = await getDb();
  await db.insert(schema.oauthStates).values({ state, mallId });
  return NextResponse.redirect(authorizeUrl({ mallId, clientId: e.CAFE24_CLIENT_ID, redirectUri: e.redirectUri, state }));
}
