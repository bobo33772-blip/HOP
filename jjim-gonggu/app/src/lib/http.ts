// 라우트 공통: JSON 응답, 오류 변환, 공개 API CORS, IP별 요청 제한, 운영자 인증.

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { UserError } from "./engine/context";
import { env } from "./env";
import { getSession, type Session } from "./session";

const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" };

// 공개 API는 쿠키를 쓰지 않으므로 출처를 열어 둔다. 회원 확인은 암호화 회원 ID로만 한다.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...SEC_HEADERS, ...extra } });
}

/** 핸들러를 감싸 UserError는 사람이 읽을 메시지로, 나머지는 500으로 바꾼다 */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>, extra: Record<string, string> = {}) {
  return async (...a: A): Promise<Response> => {
    try {
      return await fn(...a);
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.code, message: e.message }, e.status, extra);
      console.error(e);
      return json({ error: "server_error", message: "잠시 후 다시 시도해 주세요." }, 500, extra);
    }
  };
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 64 * 1024) throw new UserError("too_large", "요청이 너무 커요.", 413);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    throw new UserError("bad_json", "JSON 형식이 아니에요.");
  }
}

/** 아주 단순한 IP별 요청 제한 (신청 API 남용 방지). 서버 한 대 기준 */
export function rateLimiter(perMinute: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request) => {
    const ip = String(req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const h = hits.get(ip);
    if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60_000 }); return; }
    if (++h.n > perMinute) throw new UserError("rate_limited", "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", 429);
  };
}

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---- 운영자 인증: 서명된 쿠키 { exp }. 키는 ADMIN_TOKEN에서 만든다 → 토큰을 바꾸면 기존 로그인은 모두 풀린다 ----

const ADMIN_COOKIE = "jg_admin";
export const ADMIN_TTL_SEC = 12 * 3600;

const adminKey = () => createHmac("sha256", "jjim-admin-cookie").update(env().adminToken).digest();

export function encodeAdminCookie(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + ADMIN_TTL_SEC })).toString("base64url");
  return `${payload}.${createHmac("sha256", adminKey()).update(payload).digest("base64url")}`;
}

export function verifyAdminCookie(v: string | undefined, now = Date.now()) {
  if (!v || !env().adminToken) return false;
  const [payload, sig] = v.split(".");
  if (!payload || !sig || !safeEqual(sig, createHmac("sha256", adminKey()).update(payload).digest("base64url"))) return false;
  try {
    return (JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number }).exp * 1000 > now;
  } catch {
    return false;
  }
}

export async function isAdmin() {
  return verifyAdminCookie((await cookies()).get(ADMIN_COOKIE)?.value);
}

export function setAdminCookie(res: NextResponse, secure: boolean) {
  res.cookies.set(ADMIN_COOKIE, encodeAdminCookie(), { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: ADMIN_TTL_SEC });
}

/** 판매자 API 감싸기: 카페24 앱 실행으로 받은 세션 확인 + 쓰기 요청은 X-JJG 헤더 필수.
 *  판매자 세션 쿠키는 카페24 관리자 안(iframe)에서도 쓰려고 운영에서 SameSite=None이라, 이 헤더로 다른 사이트의 요청을 막는다 */
export function seller<C>(fn: (req: NextRequest, ctx: C, s: Session) => Promise<Response>) {
  return handle(async (req: NextRequest, ctx: C) => {
    const s = await getSession();
    if (!s) throw new UserError("unauthorized", "카페24 관리자에서 찜꽁을 다시 실행해 주세요.", 401);
    if (req.method !== "GET" && req.headers.get("x-jjg") !== "1") throw new UserError("csrf", "허용되지 않은 요청이에요.", 403);
    return fn(req, ctx, s);
  });
}

/** 운영자 API 감싸기: 로그인 확인 + 쓰기 요청은 X-JJG 헤더 필수 (다른 사이트에서 보내는 요청 차단) */
export function admin<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return handle(async (req: NextRequest, ctx: C) => {
    if (!(await isAdmin())) throw new UserError("unauthorized", "로그인이 필요해요.", 401);
    if (req.method !== "GET" && req.headers.get("x-jjg") !== "1") throw new UserError("csrf", "허용되지 않은 요청이에요.", 403);
    return fn(req, ctx);
  });
}

/** 신청 API 남용 방지: IP당 분당 30회 */
export const limitPledge = rateLimiter(Number(process.env.PLEDGE_PER_MINUTE ?? 30));
