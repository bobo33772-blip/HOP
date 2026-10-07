import { describe, expect, it } from "vitest";
import { signLaunchQuery, verifyLaunch } from "@/lib/cafe24/hmac";
import { authorizeUrl, exchangeCode } from "@/lib/cafe24/oauth";
import { Cafe24Client } from "@/lib/cafe24/client";
import { Cafe24Api } from "@/lib/cafe24/api";
import { signMemberToken, verifyEncryptedMemberId } from "@/lib/cafe24/member";
import { decrypt, encrypt } from "@/lib/crypto";
import { createTestDb, schema } from "@/db";

const SECRET = "test-secret";
const nowSec = 1_791_000_000;

describe("앱 실행 HMAC", () => {
  const q = signLaunchQuery({ is_multi_shop: "F", lang: "ko_KR", mall_id: "doyunbag", shop_no: "1", timestamp: String(nowSec), user_id: "admin", user_type: "A" }, SECRET);
  it("정상 서명 통과", () => {
    const r = verifyLaunch(`?${q}`, SECRET, nowSec);
    expect(r).toMatchObject({ ok: true, params: { mallId: "doyunbag", userId: "admin", shopNo: 1 } });
  });
  it("mall_id 위조 거부", () => expect(verifyLaunch(q.replace("doyunbag", "other"), SECRET, nowSec)).toEqual({ ok: false, reason: "bad_signature" }));
  it("2시간 넘은 요청 거부 (심사 기준)", () => {
    expect(verifyLaunch(q, SECRET, nowSec + 7000).ok).toBe(true);
    expect(verifyLaunch(q, SECRET, nowSec + 7201)).toEqual({ ok: false, reason: "expired" });
  });
  it("카페24 공식 가이드의 테스트 데이터로 검증 통과", () => {
    // 개발가이드 > 앱 권한 관리 > 앱 실행 권한 샘플 코드의 TEST Data
    const official = "is_multi_shop=T&lang=ko_KR&mall_id=jhbaek02&nation=KR&shop_no=1&timestamp=1622513360&user_id=jhbaek02&user_name=jhbaek02&user_type=P&hmac=8%2BhYywQW5fBMpfbTlA1puAMpM91N0FYtrpzHYrdodDM%3D";
    expect(verifyLaunch(official, "zoQxSUptApmiFLRl2ChaxB", 1622513360)).toMatchObject({ ok: true, params: { mallId: "jhbaek02", userType: "P" } });
  });
  it("hmac 없음", () => expect(verifyLaunch("mall_id=a&timestamp=1", SECRET)).toEqual({ ok: false, reason: "missing" }));
});

describe("OAuth", () => {
  it("authorize URL", () => {
    const u = new URL(authorizeUrl({ mallId: "doyunbag", clientId: "cid", redirectUri: "https://app.example/cb", state: "s1" }));
    expect(u.origin).toBe("https://doyunbag.cafe24api.com");
    expect(u.pathname).toBe("/api/v2/oauth/authorize");
    expect(u.searchParams.get("scope")).toContain("mall.read_personal");
    expect(u.searchParams.get("scope")).not.toContain("mall.read_privacy"); // 개인정보 권한은 카페24 승인 전이라 요청하지 않는다
    process.env.CAFE24_PRIVACY_SCOPE = "1";
    expect(new URL(authorizeUrl({ mallId: "doyunbag", clientId: "cid", redirectUri: "https://app.example/cb", state: "s1" })).searchParams.get("scope")).toContain("mall.read_privacy");
    delete process.env.CAFE24_PRIVACY_SCOPE;
  });
  it("토큰 교환: Basic 인증 + KST 만료시각 해석", async () => {
    let seen: RequestInit | undefined;
    const fake = (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ access_token: "A", expires_at: "2026-10-06T14:00:00.000", refresh_token: "R", refresh_token_expires_at: "2026-10-20T12:00:00.000", scopes: ["mall.read_product"] }));
    }) as unknown as typeof fetch;
    const t = await exchangeCode("doyunbag", "cid", "sec", "CODE", "https://app.example/cb", fake);
    expect((seen?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    expect(String(seen?.body)).toContain("grant_type=authorization_code");
    expect(t.accessExpiresAt.toISOString()).toBe("2026-10-06T05:00:00.000Z");
  });
});

describe("API 호출기", () => {
  it("401이면 토큰 갱신 후 재시도, 429면 대기 후 재시도", async () => {
    const calls: string[] = [];
    const responses = [new Response("", { status: 401 }), new Response("", { status: 429, headers: { "Retry-After": "1" } }), new Response(JSON.stringify({ count: 7 }))];
    const fake = (async (_u: URL, init: RequestInit) => {
      calls.push((init.headers as Record<string, string>).Authorization);
      return responses.shift()!;
    }) as unknown as typeof fetch;
    let token = "old";
    const slept: number[] = [];
    const c = new Cafe24Client("m", { get: async (force) => (force ? (token = "new") : token) }, fake, async (ms) => void slept.push(ms));
    const r = await c.request<{ count: number }>("GET", "/products/1/wishlist/customers/count");
    expect(r.count).toBe(7);
    expect(calls).toEqual(["Bearer old", "Bearer new", "Bearer new"]);
    expect(slept).toEqual([1000]);
  });
});

describe("토큰 암호화", () => {
  it("왕복", () => {
    const key = "11".repeat(32);
    const enc = encrypt("secret-token", key);
    expect(enc).not.toContain("secret-token");
    expect(decrypt(enc, key)).toBe("secret-token");
  });
});

describe("DB 스키마", () => {
  it("마이그레이션 후 몰·공구·신청 저장, 같은 회원의 두 번째 신청 행은 거부", async () => {
    const db = await createTestDb();
    await db.insert(schema.malls).values({ mallId: "linenco" });
    const now = new Date();
    const [c] = await db.insert(schema.campaigns).values({
      mallId: "linenco", productNo: 101, productName: "이불 커버", targetQty: 100, dealPrice: 40000, listPrice: 50000, perMemberLimit: 2,
      deadlineAt: now, payWindowHours: 72, shipEta: "2026-11-01", reportToken: "t1", openedAt: now,
    }).returning();
    await db.insert(schema.pledges).values({ campaignId: c.id, memberId: "u1", qty: 1, idemKey: "k1", createdAt: now, updatedAt: now });
    await expect(db.insert(schema.pledges).values({ campaignId: c.id, memberId: "u1", qty: 1, idemKey: "k2", createdAt: now, updatedAt: now })).rejects.toThrow();
  });
});

describe("위젯 암호화 회원 ID (P2)", () => {
  const KEY = "service-key-for-test";
  const now = 1_791_400_000;
  it("Service Key로 서명된 토큰만 통과하고 회원 ID를 꺼낸다", () => {
    const t = signMemberToken({ iat: now - 10, member_id: "tester", mall_id: "linenco" }, KEY);
    expect(verifyEncryptedMemberId(t, KEY, "linenco", now)).toMatchObject({ ok: true, memberId: "tester", mallBound: true });
    expect(verifyEncryptedMemberId(t, "other-key", "linenco", now)).toEqual({ ok: false, reason: "signature" });
  });
  it("다른 몰 토큰·오래된 토큰·alg none은 거부", () => {
    expect(verifyEncryptedMemberId(signMemberToken({ iat: now, member_id: "a", mall_id: "othermall" }, KEY), KEY, "linenco", now)).toEqual({ ok: false, reason: "mall" });
    expect(verifyEncryptedMemberId(signMemberToken({ iat: now - 7200, member_id: "a" }, KEY), KEY, "linenco", now)).toEqual({ ok: false, reason: "expired" });
    const [, body, sig] = signMemberToken({ iat: now, member_id: "a" }, KEY).split(".");
    const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    expect(verifyEncryptedMemberId(`${none}.${body}.${sig}`, KEY, "linenco", now)).toEqual({ ok: false, reason: "alg" });
  });
  it("몰 ID 클레임이 없으면 통과하되 mallBound=false로 알린다 (PoC에서 확인할 항목)", () => {
    expect(verifyEncryptedMemberId(signMemberToken({ iat: now, member_id: "a" }, KEY), KEY, "linenco", now)).toMatchObject({ ok: true, mallBound: false });
  });
  it("Service Key가 없으면 실제 연동은 모든 신청을 거절한다", async () => {
    const api = new Cafe24Api(new Cafe24Client("linenco", { get: async () => "t" }), 1, "");
    expect(await api.verifyMember(signMemberToken({ iat: Math.floor(Date.now() / 1000), member_id: "a" }, KEY))).toBeNull();
  });
});

describe("카페24 쿠폰 기간 (정시만 허용)", () => {
  it("시작은 정시로 내림, 끝은 정시로 올림 (KST)", async () => {
    const { kstHourIso } = await import("@/lib/cafe24/api");
    expect(kstHourIso(new Date("2026-10-10T05:00:00Z"), "floor")).toBe("2026-10-10T14:00:00+09:00");
    expect(kstHourIso(new Date("2026-10-10T05:12:34Z"), "floor")).toBe("2026-10-10T14:00:00+09:00");
    expect(kstHourIso(new Date("2026-10-10T05:12:34Z"), "ceil")).toBe("2026-10-10T15:00:00+09:00");
  });
});
