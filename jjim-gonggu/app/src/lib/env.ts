import { randomBytes } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  CAFE24_CLIENT_ID: z.string().default(""),
  CAFE24_CLIENT_SECRET: z.string().default(""),
  CAFE24_SERVICE_KEY: z.string().default(""),
  CAFE24_API_VERSION: z.string().default("2026-09-01"),
  APP_BASE_URL: z.string().url().default("http://localhost:3100"),
  TOKEN_ENC_KEY: z.string().default(""),
  CAFE24_MOCK: z.enum(["0", "1"]).default("1"),
  // 운영자 화면 로그인 토큰 (24자 이상). 데모 모드에서 비워 두면 서버를 켤 때마다 새로 만든다
  ADMIN_TOKEN: z.string().default(""),
  // 외부 크론이 /api/cron/tick 을 부를 때 쓰는 비밀값. 비워 두면 그 주소는 꺼진다
  CRON_SECRET: z.string().default(""),
  // 카페24 웹훅 X-API-Key 헤더와 비교할 값 (VERIFY: 앱별 고정 키인지 PoC에서 확인). 비워 두면 검사하지 않는다 — 본문은 어차피 믿지 않는다
  WEBHOOK_API_KEY: z.string().default(""),
  // inline: 서버 안에서 30초마다 정기 작업 / off: 외부 크론만 사용 (서버를 여러 대 띄울 때)
  SCHEDULER: z.enum(["inline", "off"]).default("inline"),
  MOCK_DELAY_MS: z.coerce.number().default(0),
});

const g = globalThis as unknown as { __jjimDemoAdmin?: string };

export const env = () => {
  const e = schema.parse(process.env);
  const mock = e.CAFE24_MOCK === "1";
  const adminToken = e.ADMIN_TOKEN || (mock ? (g.__jjimDemoAdmin ??= randomBytes(18).toString("base64url")) : "");
  return { ...e, mock, adminToken, redirectUri: `${e.APP_BASE_URL}/api/cafe24/callback` };
};

export function requireReal() {
  const e = env();
  const missing = (["CAFE24_CLIENT_ID", "CAFE24_CLIENT_SECRET", "TOKEN_ENC_KEY"] as const).filter((k) => !e[k]);
  if (missing.length) throw new Error(`환경변수 누락: ${missing.join(", ")} (.env.local 참고)`);
  return e;
}
