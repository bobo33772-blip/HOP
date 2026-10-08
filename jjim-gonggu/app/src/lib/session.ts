// 판매자 세션: 서명된 쿠키 { mallId, userId, exp }. 카페24 관리자에서 앱 실행(HMAC 검증) 또는 OAuth 완료 시 발급.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "jg_session";
const TTL_SEC = 12 * 3600;

export interface Session { mallId: string; userId: string | null; exp: number }

const secret = () => process.env.TOKEN_ENC_KEY || process.env.CAFE24_CLIENT_SECRET || "dev-only-secret";
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(s: Omit<Session, "exp">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Math.floor(now / 1000) + TTL_SEC })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  return s.exp * 1000 > now ? s : null;
}

export async function setSession(s: Omit<Session, "exp">) {
  (await cookies()).set(COOKIE, encodeSession(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // 카페24 관리자 안(iframe)에서 열릴 수 있어 운영에서는 None
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: TTL_SEC,
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  return decodeSession((await cookies()).get(COOKIE)?.value);
}
