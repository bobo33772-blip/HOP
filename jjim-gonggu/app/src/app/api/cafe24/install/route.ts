// GET /api/cafe24/install?mall_id=… — 운영팀이 파일럿 몰에 직접 설치를 시작할 때 쓰는 주소 (스토어 심사 전, PoC P7).
// 판매자가 카페24 권한 동의 화면에서 동의하면 /api/cafe24/callback 으로 돌아온다.

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/db";
import { env, requireReal } from "@/lib/env";
import { authorizeUrl } from "@/lib/cafe24/oauth";
import { launchErrorUrl } from "@/lib/launch-errors";

export async function GET(req: NextRequest) {
  // 판매자가 여는 주소라 실패는 JSON 대신 첫 화면의 안내 한 줄로 보낸다 (#28)
  if (env().mock) return NextResponse.redirect(launchErrorUrl(env().APP_BASE_URL, "demo"));
  const e = requireReal();
  const mallId = req.nextUrl.searchParams.get("mall_id") ?? "";
  if (!/^[a-z0-9-]{3,40}$/.test(mallId)) return NextResponse.redirect(launchErrorUrl(e.APP_BASE_URL, "bad_mall"));
  const state = randomBytes(16).toString("hex");
  await (await getDb()).insert(schema.oauthStates).values({ state, mallId });
  return NextResponse.redirect(authorizeUrl({ mallId, clientId: e.CAFE24_CLIENT_ID, redirectUri: e.redirectUri, state }));
}
