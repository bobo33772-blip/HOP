// POST /api/admin/login — 운영자 토큰 확인 후 서명된 쿠키 발급 (HttpOnly · SameSite=Strict)

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual, setAdminCookie } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { audit } from "@/lib/engine/context";

export async function POST(req: Request) {
  const e = env();
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const ctx = await getCtx();
  const back = new URL("/admin", e.APP_BASE_URL);
  if (!e.adminToken || !token || !safeEqual(token, e.adminToken)) {
    await audit(ctx, "unknown", "admin.login_failed");
    back.searchParams.set("e", "1");
    return NextResponse.redirect(back, 303);
  }
  await audit(ctx, "operator", "admin.login");
  const res = NextResponse.redirect(back, 303);
  setAdminCookie(res, e.APP_BASE_URL.startsWith("https:"));
  return res;
}
