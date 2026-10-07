// 위젯이 보낸 '암호화 회원 ID' 검증 (PoC P2).
// 공식 문서(Front JavaScript SDK, 2026-10-08 확인): CAFE24API.getEncryptedMemberId(client_id, cb)는
// JWT(헤더 {"typ":"JWT","alg":"HS512"})를 돌려주고, 서버는 앱의 Service Key로 HMAC-SHA512 서명을 비교해 검증한다.
// ⚠ VERIFY: 페이로드 클레임 이름(member_id 등)과 mall_id 포함 여부는 문서에 없다 → 테스트몰에서 실제 토큰으로 확인.
//   mall_id가 없으면 A몰 회원 토큰을 B몰 공구에 재사용하는 것을 서명만으로는 막을 수 없다.

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SEC = 60 * 60; // iat가 1시간보다 오래된 토큰은 거부 (VERIFY: 카페24 토큰 수명)
const MAX_SKEW_SEC = 5 * 60;

export type MemberCheck =
  | { ok: true; memberId: string; mallBound: boolean; claims: string[] }
  | { ok: false; reason: "format" | "alg" | "signature" | "expired" | "mall" | "no_member" };

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function verifyEncryptedMemberId(token: string, serviceKey: string, mallId: string, nowSec = Math.floor(Date.now() / 1000)): MemberCheck {
  const parts = String(token).split(".");
  if (parts.length !== 3 || !serviceKey) return { ok: false, reason: "format" };
  const [head, body, sig] = parts;
  let header: { alg?: string }, payload: Record<string, unknown>;
  try {
    header = JSON.parse(b64url(head).toString("utf8"));
    payload = JSON.parse(b64url(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "format" };
  }
  if (header.alg !== "HS512") return { ok: false, reason: "alg" }; // none 등 다른 알고리즘은 거부

  const want = createHmac("sha512", serviceKey).update(`${head}.${body}`).digest();
  const got = b64url(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "signature" };

  const iat = Number(payload.iat);
  const exp = Number(payload.exp);
  if (Number.isFinite(exp) && exp < nowSec) return { ok: false, reason: "expired" };
  if (Number.isFinite(iat) && (nowSec - iat > MAX_AGE_SEC || iat - nowSec > MAX_SKEW_SEC)) return { ok: false, reason: "expired" };

  const mall = payload.mall_id ?? payload.mallId ?? payload.mall;
  if (mall != null && String(mall) !== mallId) return { ok: false, reason: "mall" };

  const member = payload.member_id ?? payload.memberId ?? payload.user_id ?? payload.id ?? payload.sub;
  if (typeof member !== "string" || !member) return { ok: false, reason: "no_member" };
  return { ok: true, memberId: member, mallBound: mall != null, claims: Object.keys(payload) };
}

/** 테스트용: 카페24와 같은 형식의 토큰을 만든다 */
export function signMemberToken(payload: Record<string, unknown>, serviceKey: string): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ typ: "JWT", alg: "HS512" }), body = enc(payload);
  return `${head}.${body}.${createHmac("sha512", serviceKey).update(`${head}.${body}`).digest("base64url")}`;
}
