// 운영 Postgres 마이그레이션: DATABASE_URL=... pnpm db:migrate
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required (로컬 PGlite는 앱 시작 시 자동 마이그레이션됩니다)");
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
await sql.end();
console.log("migrated");
