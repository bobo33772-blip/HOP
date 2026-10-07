// 몰 설치·토큰 관리와 ShopApi 생성.

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env, requireReal } from "./env";
import { decrypt, encrypt } from "./crypto";
import { Cafe24Client, type TokenProvider } from "./cafe24/client";
import { Cafe24Api, type ShopApi } from "./cafe24/api";
import { MockCafe24Api } from "./cafe24/mock";
import { refreshTokens, type TokenSet } from "./cafe24/oauth";

export const DEMO_MALL = "demo";

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

export async function ensureDemoMall() {
  const db = await getDb();
  await db.insert(schema.malls).values({ mallId: DEMO_MALL, smsSender: "02-000-0000", optOutNumber: "080-000-0000" }).onConflictDoNothing();
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

const g = globalThis as unknown as { __jjimMock?: MockCafe24Api };

export async function shopApi(mallId: string): Promise<ShopApi> {
  if (env().mock || mallId === DEMO_MALL) return (g.__jjimMock ??= new MockCafe24Api());
  const db = await getDb();
  const [m] = await db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
  return new Cafe24Api(new Cafe24Client(mallId, tokenProvider(mallId)), m?.shopNo ?? 1);
}
