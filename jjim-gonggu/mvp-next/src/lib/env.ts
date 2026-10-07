import { z } from "zod";

const schema = z.object({
  CAFE24_CLIENT_ID: z.string().default(""),
  CAFE24_CLIENT_SECRET: z.string().default(""),
  CAFE24_SERVICE_KEY: z.string().default(""),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  TOKEN_ENC_KEY: z.string().default(""),
  CAFE24_MOCK: z.enum(["0", "1"]).default("1"),
});

export const env = () => {
  const e = schema.parse(process.env);
  return { ...e, mock: e.CAFE24_MOCK === "1", redirectUri: `${e.APP_BASE_URL}/api/cafe24/callback` };
};

export function requireReal() {
  const e = env();
  const missing = (["CAFE24_CLIENT_ID", "CAFE24_CLIENT_SECRET", "TOKEN_ENC_KEY"] as const).filter((k) => !e[k]);
  if (missing.length) throw new Error(`환경변수 누락: ${missing.join(", ")} (.env.local 참고)`);
  return e;
}
