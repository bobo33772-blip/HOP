// OAuth Redirect URI. code → 토큰 교환 → 암호화 저장 → 위젯 스크립트 설치 → 첫 수요 레이더 수집 → 대시보드.

import { after, NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireReal } from "@/lib/env";
import { exchangeCode } from "@/lib/cafe24/oauth";
import { saveInstall } from "@/lib/malls";
import { installWidget } from "@/lib/console-actions";
import { runCollection, startFirstCollection } from "@/lib/radar";
import { getCtx } from "@/lib/server";
import { setSession } from "@/lib/session";
import { launchErrorUrl } from "@/lib/launch-errors";

const STATE_TTL_MS = 10 * 60_000;

export async function GET(req: NextRequest) {
  const e = requireReal();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  // 실패하면 JSON 대신 첫 화면의 안내 한 줄로 보낸다 (#28). 판매자가 동의를 거절하면 카페24가 code 없이 error를 붙여 돌려보낸다
  if (!code || !state) return NextResponse.redirect(launchErrorUrl(e.APP_BASE_URL, req.nextUrl.searchParams.get("error") ? "denied" : "install_retry"));

  const db = await getDb();
  const [s] = await db.delete(schema.oauthStates).where(eq(schema.oauthStates.state, state)).returning();
  if (!s || Date.now() - s.createdAt.getTime() > STATE_TTL_MS) return NextResponse.redirect(launchErrorUrl(e.APP_BASE_URL, "install_retry"));

  let tokens: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    tokens = await exchangeCode(s.mallId, e.CAFE24_CLIENT_ID, e.CAFE24_CLIENT_SECRET, code, e.redirectUri);
    await saveInstall(s.mallId, tokens);
  } catch (err) {
    console.error("cafe24 token exchange failed", err);
    return NextResponse.redirect(launchErrorUrl(e.APP_BASE_URL, "install_failed"));
  }

  try {
    await installWidget(await getCtx(), s.mallId);
  } catch (err) {
    // 위젯 설치 실패는 설치 자체를 막지 않는다 — 판매자 홈의 '위젯 설치하기'로 다시 시도
    console.error("scripttag install failed", err);
  }

  // 설치 직후 1회 자동 수집 (기획서 정할 것 7). 응답을 보낸 뒤에 돌리고, 시간 제한으로 멈추면 1분 정기 작업이 이어 받는다
  try {
    const run = await startFirstCollection(db, s.mallId);
    if (run) {
      const api = await (await getCtx()).shop(s.mallId);
      after(() => runCollection(db, api, s.mallId, run.id));
    }
  } catch (err) {
    // 첫 수집을 못 시작해도 설치는 끝낸다 — 수요 레이더 화면의 '수집 시작'으로 다시 할 수 있다
    console.error("first radar collection failed", err);
  }

  await db.insert(schema.auditLogs).values({ mallId: s.mallId, actor: "system", action: "app.installed", detail: { scopes: tokens.scopes } });
  await setSession({ mallId: s.mallId, userId: null });
  return NextResponse.redirect(new URL("/", e.APP_BASE_URL));
}
