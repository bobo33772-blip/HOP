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

function tokenProvider(mallId: string): TokenProvider {
  return {
    async get(force) {
      const e = requireReal();
      const db = await getDb();
      const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
      if (!m?.accessTokenEnc || !m.refreshTokenEnc) throw new Error(`mall ${mallId} not installed`);
      // 만료 5분 전부터 갱신
      if (!force && m.accessExpiresAt && m.accessExpiresAt.getTime() - Date.now() > 5 * 60_000) return decrypt(m.accessTokenEnc, e.TOKEN_ENC_KEY);
      const t = await refreshTokens(mallId, e.CAFE24_CLIENT_ID, e.CAFE24_CLIENT_SECRET, decrypt(m.refreshTokenEnc, e.TOKEN_ENC_KEY));
      await saveInstall(mallId, t, m.shopNo);
      return t.accessToken;
    },
  };
}

/**
 * 앱 삭제 웹훅(90077)을 받았을 때. 본문은 위조될 수 있으니 토큰 갱신을 직접 시도해 보고,
 * 카페24가 토큰을 거절(4xx)할 때만 삭제로 확정해 저장된 토큰을 지운다. 갱신이 되면 아직 설치된 것이다.
 */
export async function confirmUninstall(mallId: string): Promise<boolean> {
  const e = requireReal();
  const db = await getDb();
  const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
  if (!m || m.uninstalledAt) return false;
  if (m.refreshTokenEnc) {
    try {
      const t = await refreshTokens(mallId, e.CAFE24_CLIENT_ID, e.CAFE24_CLIENT_SECRET, decrypt(m.refreshTokenEnc, e.TOKEN_ENC_KEY));
      await saveInstall(mallId, t, m.shopNo);
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
