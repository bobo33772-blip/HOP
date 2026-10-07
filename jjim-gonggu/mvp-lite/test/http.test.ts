import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { setup, baseInput, MALL } from './helpers.ts';
import { startServer } from '../src/http/server.ts';
import { HOUR } from '../src/time.ts';
import { tick } from '../src/scheduler.ts';

const env = setup();
const ADMIN = 'test-admin-token-0123456789abcdef';
const SECRET = 'webhook-secret';
const server = await startServer(env.ctx, { adminToken: ADMIN, publicBaseUrl: 'http://localhost', webhookSecret: SECRET, pledgePerMinute: 1000 }, 0);
const B = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

const j = (b: unknown) => ({ 'Content-Type': 'application/json', body: JSON.stringify(b) });
let cookie = '';

test('운영자 API는 로그인 없이 막히고, 틀린 토큰으로는 로그인할 수 없다', async () => {
  assert.equal((await fetch(`${B}/admin/api/malls`)).status, 401);
  const bad = await fetch(`${B}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=wrong', redirect: 'manual' });
  assert.equal(bad.status, 401);
  const ok = await fetch(`${B}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${ADMIN}`, redirect: 'manual' });
  assert.equal(ok.status, 303);
  const sc = ok.headers.get('set-cookie')!;
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  cookie = sc.split(';')[0];
  assert.equal((await fetch(`${B}/admin/api/malls`, { headers: { cookie } })).status, 200);
});

test('운영자 쓰기 요청은 X-JJG 헤더가 없으면 막는다 (다른 사이트에서 보내는 요청 차단)', async () => {
  const r = await fetch(`${B}/admin/api/malls/${MALL}/campaigns`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(baseInput(env.clock)) });
  assert.equal(r.status, 403);
});

let campaignId = '';
let token = '';
test('운영자가 공구를 열고, 고객은 공개 API로 결제 없이 신청한다 (재전송은 한 번만)', async () => {
  const r = await fetch(`${B}/admin/api/malls/${MALL}/campaigns`, { method: 'POST', headers: { cookie, 'X-JJG': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(baseInput(env.clock)) });
  assert.equal(r.status, 201);
  campaignId = (await r.json()).campaign.id;
  const w = await fetch(`${B}/v1/public/malls/${MALL}/products/102/campaign`);
  assert.equal(w.headers.get('access-control-allow-origin'), '*');
  const pub = await w.json();
  assert.equal(pub.campaign.id, campaignId);
  assert.equal(JSON.stringify(pub).includes('coupon_no'), false, '공개 응답에 쿠폰 번호를 넣지 않는다');
  const body = j({ member_token: env.cafe24.encryptMember(MALL, 'm2'), qty: 1 });
  const p1 = await fetch(`${B}/v1/public/campaigns/${campaignId}/pledges`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'abc' }, body: body.body });
  const p2 = await fetch(`${B}/v1/public/campaigns/${campaignId}/pledges`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'abc' }, body: body.body });
  assert.equal(p1.status, 201); assert.equal(p2.status, 200);
  assert.equal((await p2.json()).campaign.pledged_qty, 1);
  const forged = await fetch(`${B}/v1/public/campaigns/${campaignId}/pledges`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'x' }, body: JSON.stringify({ member_token: 'aGFjazptMg.forged', qty: 1 }) });
  assert.equal(forged.status, 401);
  token = (await (await fetch(`${B}/admin/api/campaigns/${campaignId}`, { headers: { cookie } })).json()).report_token;
});

test('웹훅은 서명이 맞아야 받고, 받아도 본문 대신 카페24 주문을 다시 조회한다', async () => {
  const raw = JSON.stringify({ event_no: 90023, resource: { mall_id: MALL, order_id: 'ORD-NOPE' } });
  const noSig = await fetch(`${B}/webhooks/cafe24`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });
  assert.equal(noSig.status, 401);
  const sig = createHmac('sha256', SECRET).update(raw).digest('base64');
  const ok = await fetch(`${B}/webhooks/cafe24`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-JJG-Signature': sig }, body: raw });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { handled: 0 });
});

test('판매자 리포트 링크에는 회원 ID 같은 개인정보가 없다', async () => {
  for (let i = 4; i <= 70; i += 2) await fetch(`${B}/v1/public/campaigns/${campaignId}/pledges`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `k${i}` }, body: JSON.stringify({ member_token: env.cafe24.encryptMember(MALL, `m${i}`), qty: 1 }) });
  env.clock.advance(5 * 24 * HOUR);
  await tick(env.ctx);
  const html = await (await fetch(`${B}/r/${token}`)).text();
  assert.match(html, /공구 리포트/);
  assert.equal(/\bm\d{1,3}\b/.test(html.replace(/<style[\s\S]*?<\/style>/, '')), false);
  assert.equal((await fetch(`${B}/r/not-a-token`)).status, 404);
});
