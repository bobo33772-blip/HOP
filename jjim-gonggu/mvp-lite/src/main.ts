// 실제 카페24 연동으로 실행한다. 필요한 값은 .env.example 참고.
import { openDb } from './db.ts';
import { RealCafe24 } from './cafe24/real.ts';
import { systemClock } from './time.ts';
import { startServer } from './http/server.ts';
import { startScheduler } from './scheduler.ts';
import type { Ctx } from './context.ts';

function need(name: string, minLen = 1): string {
  const v = process.env[name];
  if (!v || v.length < minLen) { console.error(`환경 변수 ${name}가 필요해요${minLen > 1 ? ` (${minLen}자 이상)` : ''}.`); process.exit(1); }
  return v;
}

const cfg = {
  clientId: need('CAFE24_CLIENT_ID'),
  clientSecret: need('CAFE24_CLIENT_SECRET'),
  apiVersion: process.env.CAFE24_API_VERSION ?? '2026-09-01',
  tokenKey: need('TOKEN_KEY', 32),
};
const db = openDb(process.env.DB_PATH ?? 'jjim-gonggu.db');
const real = new RealCafe24(db, cfg);
const ctx: Ctx = {
  db, cafe24: real, clock: systemClock,
  // VERIFY: 독립 도메인을 쓰는 몰은 상품 주소가 다르다. 파일럿 몰별로 확인한다.
  productUrl: (mall, no) => `https://${mall}.cafe24.com/product/detail.html?product_no=${no}`,
  log: (m, x) => console.log(new Date().toISOString(), m, x ?? ''),
};
const port = Number(process.env.PORT ?? 8787);
const base = need('PUBLIC_BASE_URL');
await startServer(ctx, {
  adminToken: need('ADMIN_TOKEN', 24),
  publicBaseUrl: base,
  webhookSecret: process.env.WEBHOOK_SECRET,
  oauth: {
    cfg, real,
    scopes: ['mall.read_product', 'mall.read_privacy', 'mall.read_personal', 'mall.read_order', 'mall.read_promotion', 'mall.write_promotion', 'mall.write_notification', 'mall.write_application'],
  },
}, port);
startScheduler(ctx);
console.log(`찜 공구 서버 실행 중: ${base} (포트 ${port}) · 운영자 화면 ${base}/admin · 설치 ${base}/oauth/start?mall_id=쇼핑몰ID`);
