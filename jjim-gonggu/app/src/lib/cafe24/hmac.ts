// 카페24 관리자에서 앱을 실행할 때 붙어 오는 쿼리(mall_id, user_id, timestamp, hmac …)의 위조 여부 검증.
// 공식 가이드(개발가이드 > 앱 권한 관리 > 앱 실행 권한, 2026-10-07 확인):
//   hmac을 뺀 파라미터를 파라미터명 알파벳순으로 정렬해 URL 인코딩된 쿼리 문자열로 만들고,
//   client_secret을 키로 HMAC-SHA256 → Base64. timestamp는 초 단위, ±2시간 이내만 허용(심사 기준).
// 인코딩 방식(공백 '+' vs '%20', 한글 운영자 이름) 차이에 대비해 '받은 순서 그대로'와 '정렬 후 재인코딩' 두 후보를 모두 검사한다.
// ⚠ PoC 체크: 테스트몰 실제 요청으로 어느 후보가 맞는지 확인 후 하나로 줄일 것.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface LaunchParams {
  mallId: string;
  userId: string | null;
  userType: string | null; // P 대표 운영자 · A 부운영자 · S 공급사 운영자
  shopNo: number;
  timestamp: number;
}

export type LaunchResult = { ok: true; params: LaunchParams } | { ok: false; reason: "missing" | "bad_signature" | "expired" };

const MAX_SKEW_SEC = 2 * 60 * 60;

const digest = (s: string, secret: string) => createHmac("sha256", secret).update(s).digest();

export function verifyLaunch(rawQuery: string, clientSecret: string, nowSec = Math.floor(Date.now() / 1000)): LaunchResult {
  const query = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  const parts = query.split("&").filter(Boolean);
  const hmacPart = parts.find((p) => p.startsWith("hmac="));
  const sp = new URLSearchParams(query);
  const mallId = sp.get("mall_id");
  const ts = Number(sp.get("timestamp"));
  if (!hmacPart || !mallId || !Number.isFinite(ts)) return { ok: false, reason: "missing" };

  let given: Buffer;
  try {
    given = Buffer.from(decodeURIComponent(hmacPart.slice(5).replace(/\+/g, "%2B")), "base64");
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  const asReceived = parts.filter((p) => !p.startsWith("hmac=")).join("&");
  const sorted = new URLSearchParams([...sp.entries()].filter(([k]) => k !== "hmac").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))).toString();
  const matches = [...new Set([asReceived, sorted])].some((s) => {
    const expected = digest(s, clientSecret);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) return { ok: false, reason: "bad_signature" };

  if (Math.abs(nowSec - ts) > MAX_SKEW_SEC) return { ok: false, reason: "expired" };

  return { ok: true, params: { mallId, userId: sp.get("user_id"), userType: sp.get("user_type"), shopNo: Number(sp.get("shop_no") ?? 1), timestamp: ts } };
}

/** 테스트용: 카페24와 같은 방식(알파벳순 정렬)으로 서명된 쿼리를 만든다. */
export function signLaunchQuery(params: Record<string, string>, clientSecret: string): string {
  const q = new URLSearchParams(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1))).toString();
  const h = digest(q, clientSecret).toString("base64");
  return `${q}&hmac=${encodeURIComponent(h)}`;
}
