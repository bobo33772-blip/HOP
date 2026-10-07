import { openDb } from '../src/db.ts';
import { MockCafe24 } from '../src/cafe24/mock.ts';
import { manualClock, HOUR } from '../src/time.ts';
import type { Ctx } from '../src/context.ts';
import { handleOrderWebhook } from '../src/services/payments.ts';

export const MALL = 'linenco';
export const PRODUCT = 102;

/** 2026-10-12(월) 10:00 KST에서 시작하는 모의 쇼핑몰 1곳: 회원 200명, 상품 찜 120명, 장바구니 40명 */
export function setup(opts: { members?: number; consentEvery?: number } = {}) {
  const clock = manualClock(new Date('2026-10-12T01:00:00Z'));
  const cafe24 = new MockCafe24(clock);
  cafe24.addMall(MALL, [
    { product_no: 101, product_name: '워싱 린넨 이불 커버 (Q)', price: 129000, sold_out: true },
    { product_no: PRODUCT, product_name: '스톤웨어 디너 접시 4P', price: 52000, sold_out: true },
    { product_no: 103, product_name: '린넨 암막 커튼 2장', price: 89000, sold_out: false },
  ]);
  const n = opts.members ?? 200, every = opts.consentEvery ?? 2;
  for (let i = 1; i <= n; i++) cafe24.addMember(MALL, `m${i}`, i % every === 0);
  for (let i = 1; i <= 120; i++) cafe24.addWish(MALL, PRODUCT, `m${i}`);
  for (let i = 100; i <= 139; i++) cafe24.addCart(MALL, PRODUCT, `m${i}`);
  for (let i = 1; i <= 60; i++) cafe24.addWish(MALL, 101, `m${i}`);
  const db = openDb();
  db.prepare("INSERT INTO malls (mall_id, brand_name, unsubscribe_no, sender_no, installed_at) VALUES (?, 'LINEN & CO.', '080-000-0000', '02-000-0000', ?)").run(MALL, clock.now().toISOString());
  const logs: string[] = [];
  const ctx: Ctx = { db, cafe24, clock, productUrl: (m, p) => `https://${m}.example/product/${p}`, log: (msg) => { logs.push(msg); } };
  cafe24.onWebhook(async e => { await handleOrderWebhook(ctx, e); });
  return { ctx, cafe24, clock, db, logs };
}

export const baseInput = (clock: { now(): Date }) => ({
  product_no: PRODUCT, target_qty: 30, deal_price: 39000, cost_price: 28500, per_member_limit: 2,
  deadline_at: new Date(clock.now().getTime() + 5 * 24 * HOUR).toISOString(), pay_window_h: 72, ship_eta: '2026-11-06',
});
