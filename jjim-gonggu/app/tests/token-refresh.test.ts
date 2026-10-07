// 토큰 갱신 동시성: 카페24는 갱신 때 refresh token을 새로 주고 이전 것을 무효로 만든다.
// 동시에 여러 요청이 와도 갱신은 한 번만 일어나야 하고, 그 때문에 앱 삭제로 오판해 토큰을 지우면 안 된다.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const KEY = "a".repeat(64);
const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 19); // 카페24 응답 형식 (타임존 없는 KST)

describe("토큰 갱신 잠금", () => {
  let refreshCalls = 0;
  let validRefresh = "r1";

  beforeAll(() => {
    // 메모리 DB를 쓰되(CAFE24_MOCK=1), 실제 연동 코드(requireReal)가 필요로 하는 값만 채운다
    Object.assign(process.env, { CAFE24_MOCK: "1", CAFE24_CLIENT_ID: "cid", CAFE24_CLIENT_SECRET: "sec", TOKEN_ENC_KEY: KEY });
    delete process.env.DATABASE_URL;
    vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
      const url = String(u);
      if (url.includes("/oauth/token")) {
        refreshCalls++;
        const body = new URLSearchParams(String(init?.body));
        await new Promise((r) => setTimeout(r, 30)); // 갱신이 걸리는 동안 다른 요청이 끼어들게 한다
        if (body.get("refresh_token") !== validRefresh) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
        validRefresh = `r${refreshCalls + 1}`; // 이전 refresh token은 이제 무효
        return new Response(JSON.stringify({ access_token: `a${refreshCalls + 1}`, expires_at: kst(Date.now() + 2 * 3_600_000), refresh_token: validRefresh, refresh_token_expires_at: kst(Date.now() + 14 * 86_400_000), scopes: ["mall.read_product"] }));
      }
      return new Response(JSON.stringify({ count: 1 }));
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("만료된 토큰으로 동시에 5번 호출해도 갱신은 한 번, 모두 성공한다", async () => {
    const { getDb, schema } = await import("@/db");
    const { encrypt } = await import("@/lib/crypto");
    const { realShopApi } = await import("@/lib/malls");
    const db = await getDb();
    await db.insert(schema.malls).values({ mallId: "lockmall", accessTokenEnc: encrypt("a1", KEY), refreshTokenEnc: encrypt("r1", KEY), accessExpiresAt: new Date(Date.now() - 1000), refreshExpiresAt: new Date(Date.now() + 86_400_000) });
    const apis = await Promise.all(Array.from({ length: 5 }, () => realShopApi("lockmall")));
    const counts = await Promise.all(apis.map((a) => a.cartCount(102)));
    expect(counts).toEqual([1, 1, 1, 1, 1]);
    expect(refreshCalls).toBe(1);
  });

  it("앱 삭제 확인은 최신 refresh token으로 하므로, 설치된 몰을 삭제로 오판하지 않는다", async () => {
    const { getDb, schema } = await import("@/db");
    const { confirmUninstall } = await import("@/lib/malls");
    const db = await getDb();
    expect(await confirmUninstall("lockmall")).toBe(false);
    const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, "lockmall"));
    expect(m.uninstalledAt).toBeNull();
    expect(m.refreshTokenEnc).not.toBeNull();
  });

  it("카페24가 토큰을 진짜로 거절하면(앱 삭제) 그때만 토큰을 지운다", async () => {
    const { getDb, schema } = await import("@/db");
    const { confirmUninstall } = await import("@/lib/malls");
    validRefresh = "revoked"; // 판매자가 앱을 지워 모든 토큰이 무효
    expect(await confirmUninstall("lockmall")).toBe(true);
    const db = await getDb();
    const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, "lockmall"));
    expect(m.uninstalledAt).not.toBeNull();
    expect(m.refreshTokenEnc).toBeNull();
  });
});
