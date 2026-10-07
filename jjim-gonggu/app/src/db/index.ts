// DATABASE_URL이 있으면 Postgres(운영·스테이징), 없으면 로컬 내장 Postgres(PGlite)를 쓴다.
// PGlite는 Docker 없이 바로 개발·테스트하기 위한 것이며 운영에서는 쓰지 않는다.
// 데모 모드(CAFE24_MOCK=1)는 모의 쇼핑몰이 메모리에만 있으므로 DB도 메모리에 둔다 → 서버를 다시 켜면 처음부터.

import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __jjimDb?: Promise<Db> };

async function create(dataDir?: string): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    return drizzle(postgres(url, { max: 10 }), { schema }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = dataDir ?? ((process.env.CAFE24_MOCK ?? "1") === "1" ? "memory://" : ".data/pg");
  if (dir === ".data/pg") (await import("node:fs")).mkdirSync(".data", { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  // 실패한 초기화는 캐시하지 않는다 (다음 요청에서 재시도)
  g.__jjimDb ??= create().catch((err) => {
    g.__jjimDb = undefined;
    throw err;
  });
  return g.__jjimDb;
}

/** 테스트용: 메모리 DB (매번 새로) */
export const createTestDb = () => create("memory://");

export { schema };
