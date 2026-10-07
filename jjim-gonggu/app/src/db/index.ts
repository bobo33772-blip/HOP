// DATABASE_URL이 있으면 Postgres(운영·스테이징), 없으면 로컬 내장 Postgres(PGlite)를 쓴다.
// PGlite는 Docker 없이 바로 개발·테스트하기 위한 것이며 운영에서는 쓰지 않는다.
// 데모 모드(CAFE24_MOCK=1)는 모의 쇼핑몰이 메모리에만 있으므로 DB도 메모리에 둔다 → 서버를 다시 켜면 처음부터.

import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __jjimDb?: Promise<Db> };

async function create(dataDir?: string): Promise<Db> {
  // 데모 모드는 .env.local에 운영 DATABASE_URL이 있어도 절대 쓰지 않는다 (모의 데이터가 운영 DB에 섞이지 않게)
  const mock = (process.env.CAFE24_MOCK ?? "1") === "1";
  const url = mock ? undefined : process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // Vercel 같은 서버리스에서는 함수 인스턴스마다 연결이 생기므로 연결 수를 작게,
    // Supabase 연결 풀러(트랜잭션 모드, 6543 포트)는 prepared statement를 지원하지 않아 끈다.
    const serverless = !!process.env.VERCEL;
    return drizzle(postgres(url, { max: serverless ? 3 : 10, prepare: false }), { schema }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = dataDir ?? (mock ? "memory://" : ".data/pg");
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
