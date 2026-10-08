// 몰 설치·토큰 관리와 실제 카페24 ShopApi 생성.

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env, requireReal } from "./env";
import { decrypt, encrypt } from "./crypto";
import { Cafe24Client, type TokenProvider } from "./cafe24/client";
import { Cafe24Api, type ShopApi } from "./cafe24/api";
import { refreshTokens, TokenError, type TokenSet } from "./cafe24/oauth";

export async function saveInstall(mallId: string, t: TokenSet, shopNo = 1) {
  const { TOKEN_ENC_KEY } = requireReal();
  const db = await getDb();
  const row = {
    mallId,
    shopNo,
    accessTokenEnc: encrypt(t.accessToken, TOKEN_ENC_KEY),
    refreshTokenEnc: encrypt(t.refreshToken, TOKEN_ENC_KEY),
    accessExpiresAt: t.accessExpiresAt,
    refreshExpiresAt: t.refreshExpiresAt,
    scopes: t.scopes,
    uninstalledAt: null,
  };
  await db.insert(schema.malls).values(row).onConflictDoUpdate({ target: schema.malls.mallId, set: row });
}

export async function hasValidInstall(mallId: string): Promise<boolean> {
  const db = await getDb();
  const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
  return !!m && !m.uninstalledAt && !!m.refreshExpiresAt && m.refreshExpiresAt > new Date();
}

const fresh = (m: { accessExpiresAt: Date | null }) => !!m.accessExpiresAt && m.accessExpiresAt.getTime() - Date.now() > 5 * 60_000; // 만료 5분 전부터 갱신
const inflight = new Map<string, Promise<string>>();

/**
 * 토큰 갱신은 몰마다 한 번에 하나만 한다. 카페24는 갱신할 때 refresh token을 새로 주고 이전 것을 무효로 만들기 때문에,
 * 두 요청이 동시에 갱신하면 두 번째는 무효 토큰으로 실패한다.
 * - 같은 서버 안: 진행 중인 갱신을 함께 기다린다 (inflight)
 * - 서버 여러 대: DB 행 잠금(SELECT … FOR UPDATE) 뒤 다시 읽어, 그 사이 다른 서버가 갱신했으면 그 토큰을 쓴다
 * stale: 'auto'는 아직 유효하면 갱신하지 않음, 문자열은 그 토큰이 거절됐을 때(401) 아직 그 토큰이면 갱신, 'always'는 무조건 갱신(앱 삭제 확인용)
 */
async function refreshUnderLock(mallId: string, stale: "auto" | "always" | string): Promise<string> {
  const e = requireReal();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(schema.malls).where(eq(schema.malls.mallId, mallId)).for("update");
    if (!m?.accessTokenEnc || !m.refreshTokenEnc) throw new Error(`mall ${mallId} not installed`);
    const current = decrypt(m.accessTokenEnc, e.TOKEN_ENC_KEY);
    if (stale === "auto" && fresh(m)) return current;
    if (stale !== "auto" && stale !== "always" && current !== stale) return current; // 다른 요청이 이미 갱신함
    const t = await refreshTokens(mallId, e.CAFE24_CLIENT_ID, e.CAFE24_CLIENT_SECRET, decrypt(m.refreshTokenEnc, e.TOKEN_ENC_KEY));
    await tx.update(schema.malls).set({
      accessTokenEnc: encrypt(t.accessToken, e.TOKEN_ENC_KEY),
      refreshTokenEnc: encrypt(t.refreshToken, e.TOKEN_ENC_KEY),
      accessExpiresAt: t.accessExpiresAt,
      refreshExpiresAt: t.refreshExpiresAt,
      scopes: t.scopes,
      uninstalledAt: null,
    }).where(eq(schema.malls.mallId, mallId));
    return t.accessToken;
  });
}

function refreshOnce(mallId: string, stale: "auto" | "always" | string): Promise<string> {
  const key = `${mallId}:${stale === "always" ? "always" : "refresh"}`;
  let p = inflight.get(key);
  if (!p) {
    p = refreshUnderLock(mallId, stale).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

function tokenProvider(mallId: string): TokenProvider {
  return {
    async get(force) {
      const e = requireReal();
      const db = await getDb();
      const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
      if (!m?.accessTokenEnc || !m.refreshTokenEnc) throw new Error(`mall ${mallId} not installed`);
      if (!force && fresh(m)) return decrypt(m.accessTokenEnc, e.TOKEN_ENC_KEY);
      return refreshOnce(mallId, force ? decrypt(m.accessTokenEnc, e.TOKEN_ENC_KEY) : "auto");
    },
  };
}

/**
 * 앱 삭제 웹훅(90077)을 받았을 때. 본문은 위조될 수 있으니 토큰 갱신을 직접 시도해 보고,
 * 카페24가 토큰을 거절(4xx)할 때만 삭제로 확정해 저장된 토큰을 지운다. 갱신이 되면 아직 설치된 것이다.
 * 갱신은 잠금 안에서 최신 refresh token으로 하므로, 동시에 일어난 다른 갱신 때문에 삭제로 잘못 판단하지 않는다.
 */
export async function confirmUninstall(mallId: string): Promise<boolean> {
  const db = await getDb();
  const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
  if (!m || m.uninstalledAt) return false;
  if (m.refreshTokenEnc) {
    try {
      await refreshOnce(mallId, "always");
      return false;
    } catch (err) {
      if (!(err instanceof TokenError) || err.status >= 500) throw err;
    }
  }
  await db.update(schema.malls)
    .set({ uninstalledAt: new Date(), accessTokenEnc: null, refreshTokenEnc: null, accessExpiresAt: null, refreshExpiresAt: null, scriptTagNo: null })
    .where(eq(schema.malls.mallId, mallId));
  await db.insert(schema.auditLogs).values({ mallId, actor: "cafe24", action: "app.uninstalled", detail: {} });
  return true;
}

export async function realShopApi(mallId: string): Promise<ShopApi> {
  const db = await getDb();
  const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
  // 개인정보 권한은 그 몰이 실제로 동의한 권한(설치 때 받은 토큰의 scopes)으로 판단한다
  return new Cafe24Api(new Cafe24Client(mallId, tokenProvider(mallId)), m?.shopNo ?? 1, env().CAFE24_SERVICE_KEY, !!m?.scopes.includes("mall.read_privacy"));
}
