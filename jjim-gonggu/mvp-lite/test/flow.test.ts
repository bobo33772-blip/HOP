import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, baseInput, MALL, PRODUCT } from './helpers.ts';
import { HOUR, isQuietHours, nextAllowedSendTime } from '../src/time.ts';
import { openCampaign, previewCampaign, getCampaign, recordProductionDecision } from '../src/services/campaigns.ts';
import { createPledge, cancelPledge, myPledge } from '../src/services/pledges.ts';
import { judgeNow } from '../src/services/judge.ts';
import { handleOrderWebhook, reconcileCampaign } from '../src/services/payments.ts';
import { buildReport, pilotScorecard } from '../src/services/report.ts';
import { tick } from '../src/scheduler.ts';
import type { Ctx } from '../src/context.ts';
import type { MockCafe24 } from '../src/cafe24/mock.ts';

const pledge = (ctx: Ctx, cafe24: MockCafe24, id: string, member: string, qty = 1, key = `${member}-k`) =>
  createPledge(ctx, id, { member_token: cafe24.encryptMember(MALL, member), qty }, key);

async function openAndFill(env: ReturnType<typeof setup>, members: string[], qty = 1, input = {}) {
  const { ctx, cafe24 } = env;
  const { campaign } = await openCampaign(ctx, 'op', MALL, { ...baseInput(env.clock), ...input });
  for (const m of members) await pledge(ctx, cafe24, campaign.id, m, qty);
  return campaign;
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `m${a + i}`);

test('광고 문자 금지 시간은 21:00~08:00 KST이고, 다음 발송은 08:00으로 미룬다', () => {
  assert.equal(isQuietHours(new Date('2026-10-12T12:30:00Z')), true);   // 21:30 KST
  assert.equal(isQuietHours(new Date('2026-10-12T22:59:00Z')), true);   // 07:59 KST
  assert.equal(isQuietHours(new Date('2026-10-12T23:00:00Z')), false);  // 08:00 KST
  assert.equal(nextAllowedSendTime(new Date('2026-10-12T12:30:00Z')).toISOString(), '2026-10-12T23:00:00.000Z');
  assert.equal(nextAllowedSendTime(new Date('2026-10-12T16:00:00Z')).toISOString(), '2026-10-12T23:00:00.000Z'); // 01:00 KST
});

test('개설 조건: 정가 이상·원가 미만·24시간 안 마감·마감 전 출고일은 막는다', async () => {
  const env = setup();
  const now = env.clock.now();
  const bad = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), deal_price: 52000 });
  assert.match(bad.errors.join(), /정가/);
  const below = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), deal_price: 25000 });
  assert.match(below.errors.join(), /원가/);
  const ok = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), deal_price: 25000, confirm_below_cost: true });
  assert.equal(ok.errors.length, 0);
  const soon = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), deadline_at: new Date(now.getTime() + 2 * HOUR).toISOString() });
  assert.match(soon.errors.join(), /24시간/);
  const ship = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), ship_eta: '2026-10-13' });
  assert.match(ship.errors.join(), /출고일/);
});

test('초대: 찜 ∪ 장바구니에서 중복을 빼고 수신 동의자에게만, (광고)·수신거부 문구를 붙여 보낸다', async () => {
  const env = setup();
  const pv = await previewCampaign(env.ctx, MALL, baseInput(env.clock));
  assert.deepEqual(pv.audience, { wishlist: 120, cart: 40, unique: 139, reachable: 69 });
  const { campaign, invited } = await openCampaign(env.ctx, 'op', MALL, baseInput(env.clock));
  assert.equal(invited, 69);
  assert.ok(campaign.coupon_no);
  await tick(env.ctx);
  assert.equal(env.cafe24.smsLog.length, 1);
  const sms = env.cafe24.smsLog[0];
  assert.ok(sms.content.startsWith('(광고)[LINEN & CO.]'));
  assert.match(sms.content, /무료수신거부 080-000-0000/);
  assert.equal(sms.member_ids.length, 69);
  assert.ok(sms.member_ids.every(id => Number(id.slice(1)) % 2 === 0), '수신 미동의자는 0명이어야 한다');
});

test('밤 10시에 연 공구의 초대 문자는 다음 날 08:00에 나간다', async () => {
  const env = setup();
  env.clock.set(new Date('2026-10-12T13:00:00Z')); // 22:00 KST
  await openCampaign(env.ctx, 'op', MALL, baseInput(env.clock));
  await tick(env.ctx);
  assert.equal(env.cafe24.smsLog.length, 0);
  env.clock.set(new Date('2026-10-12T23:00:30Z')); // 08:00 KST
  await tick(env.ctx);
  assert.equal(env.cafe24.smsLog.length, 1);
});

test('초대 문자가 마감 전에 못 나갔다면 마감 후에는 보내지 않고 이슈로 남긴다', async () => {
  const env = setup();
  const { campaign } = await openCampaign(env.ctx, 'op', MALL, baseInput(env.clock));
  env.cafe24.failNextSms = true;           // 첫 시도 실패 → 10분 뒤 재시도 예약
  await tick(env.ctx);
  env.clock.advance(5 * 24 * HOUR);        // 재시도 전에 마감이 지남
  await tick(env.ctx);
  assert.equal(env.cafe24.smsLog.filter(s => s.is_ad).length, 0);
  const m = env.db.prepare("SELECT status, error FROM messages WHERE campaign_id = ? AND kind = 'invite_ad'").get(campaign.id) as { status: string; error: string };
  assert.equal(m.status, 'failed');
  assert.match(m.error, /마감 후/);
});

test('마감은 초대 문자가 나갈 수 있는 시각부터 24시간 이상 남아야 한다', async () => {
  const env = setup();
  env.clock.set(new Date('2026-10-12T13:00:00Z')); // 22:00 KST → 초대는 다음 날 08:00
  const pv = await previewCampaign(env.ctx, MALL, { ...baseInput(env.clock), deadline_at: new Date('2026-10-13T13:30:00Z').toISOString() });
  assert.match(pv.errors.join(), /최소 24시간/);
});

test('신청: 위조 회원 거부, 1인 한도, 같은 요청 재전송은 한 번만, 마감 전 취소 가능', async () => {
  const env = setup();
  const { ctx, cafe24 } = env;
  const { campaign } = await openCampaign(ctx, 'op', MALL, baseInput(env.clock));
  await assert.rejects(createPledge(ctx, campaign.id, { member_token: 'forged.token-value', qty: 1 }, 'k1'), /본인 확인/);
  const otherMall = cafe24.encryptMember('othermall', 'm2');
  await assert.rejects(createPledge(ctx, campaign.id, { member_token: otherMall, qty: 1 }, 'k1'), /본인 확인/);
  await assert.rejects(pledge(ctx, cafe24, campaign.id, 'm2', 3), /최대 2개/);
  const a = await pledge(ctx, cafe24, campaign.id, 'm2', 2, 'same');
  const b = await pledge(ctx, cafe24, campaign.id, 'm2', 2, 'same');
  assert.equal(a.replay, false); assert.equal(b.replay, true);
  assert.equal(b.campaign.pledged_qty, 2);
  await assert.rejects(pledge(ctx, cafe24, campaign.id, 'm2', 1, 'other'), /이미 2개/);
  await cancelPledge(ctx, campaign.id, { member_token: cafe24.encryptMember(MALL, 'm2') });
  assert.equal((await myPledge(ctx, campaign.id, { member_token: cafe24.encryptMember(MALL, 'm2') })).campaign.pledged_qty, 0);
  await pledge(ctx, cafe24, campaign.id, 'm2', 1, 'again');
  env.clock.advance(5 * 24 * HOUR + 1);
  await assert.rejects(pledge(ctx, cafe24, campaign.id, 'm4', 1), /마감/);
  await assert.rejects(cancelPledge(ctx, campaign.id, { member_token: cafe24.encryptMember(MALL, 'm2') }), /마감/);
});

test('판정은 실제 마감 시각 이후에만, 한 번만 일어난다', async () => {
  const env = setup();
  const c = await openAndFill(env, range(1, 10));
  await assert.rejects(judgeNow(env.ctx, c.id, 'op'), /마감 시각 전/);
  env.clock.advance(5 * 24 * HOUR);
  const r1 = await tick(env.ctx);
  const r2 = await tick(env.ctx);
  assert.deepEqual(r1.judged, [c.id]);
  assert.deepEqual(r2.judged, []);
});

test('미달: 진행 안 됨으로 끝나고, 쿠폰은 발급하지 않고, 동의자에게 결과를 알린다', async () => {
  const env = setup();
  const c = await openAndFill(env, range(1, 10)); // 10개 < 목표 30개
  env.clock.advance(5 * 24 * HOUR);
  await tick(env.ctx);
  const after = getCampaign(env.ctx, c.id);
  assert.equal(after.state, 'failed');
  assert.equal((await env.cafe24.listCouponHolders(MALL, c.coupon_no!)).length, 0);
  const result = env.cafe24.smsLog.find(s => !s.is_ad)!;
  assert.match(result.content, /진행되지 않아요. 결제된 금액은 없어요/);
  assert.deepEqual(result.member_ids.sort(), ['m10', 'm2', 'm4', 'm6', 'm8']);
});

test('달성: 신청자 전원에게 쿠폰을 주고, 빠진 회원은 다시 발급, 끝까지 빠지면 이슈로 남긴다', async () => {
  const env = setup();
  const members = range(1, 40);
  const c = await openAndFill(env, members);
  env.cafe24.dropNextIssue.add('m5');
  env.cafe24.blockIssue.add('m7');
  env.clock.advance(5 * 24 * HOUR);
  await tick(env.ctx);
  const holders = new Set(await env.cafe24.listCouponHolders(MALL, c.coupon_no!));
  assert.equal(getCampaign(env.ctx, c.id).state, 'reached');
  assert.ok(holders.has('m5'), '한 번 빠진 회원은 재발급으로 채운다');
  assert.equal(holders.has('m7'), false);
  assert.equal(holders.size, 39);
  const issue = env.db.prepare("SELECT detail FROM issues WHERE kind = 'coupon_missing'").get() as { detail: string };
  assert.deepEqual(JSON.parse(issue.detail).members, ['m7']);
});

test('결제 집계: 쿠폰 주문만, 중복 웹훅은 한 번, 취소는 빼고, 기한 뒤 결제는 확정에 넣지 않는다', async () => {
  const env = setup();
  const { ctx, cafe24 } = env;
  const c = await openAndFill(env, range(1, 40), 1);
  env.clock.advance(5 * 24 * HOUR);
  await tick(ctx);
  const cp = getCampaign(ctx, c.id).coupon_no!;
  const o1 = await cafe24.placeOrder(MALL, 'm1', PRODUCT, 1, cp);
  await cafe24.placeOrder(MALL, 'm2', PRODUCT, 1, cp);
  await cafe24.placeOrder(MALL, 'm3', PRODUCT, 1);               // 쿠폰 없는 정가 주문
  await handleOrderWebhook(ctx, { event_no: 90023, resource: { mall_id: MALL, order_id: o1.order_id } }); // 중복
  await handleOrderWebhook(ctx, { event_no: 90023, resource: { mall_id: MALL, order_id: 'ORD-FAKE' } });  // 위조
  let rep = buildReport(ctx, c.id);
  assert.equal(rep.confirmed.qty, 2);
  assert.equal(rep.confirmed.revenue, 78000);
  await cafe24.cancelOrder(MALL, o1.order_id);
  rep = buildReport(ctx, c.id);
  assert.equal(rep.confirmed.qty, 1);
  assert.equal(rep.confirmed.cancelled_orders, 1);
});

test('기한 뒤 결제(쿠폰 유효 여유 시간 안)는 late로 기록하고 확정 수량에서 뺀다', async () => {
  const env = setup();
  const { ctx, cafe24 } = env;
  const c = await openAndFill(env, range(1, 40), 1);
  env.clock.advance(5 * 24 * HOUR);
  await tick(ctx);
  const cp = getCampaign(ctx, c.id).coupon_no!;
  env.clock.advance(72 * HOUR + 60 * 1000);       // pay_until 직후, 쿠폰은 여유 24시간 안
  await cafe24.placeOrder(MALL, 'm6', PRODUCT, 1, cp, { silent: true });
  await reconcileCampaign(ctx, c.id);
  const rep = buildReport(ctx, c.id);
  assert.equal(rep.confirmed.qty, 0);
  assert.equal(rep.confirmed.late_orders, 1);
});

test('웹훅이 유실돼도 야간 대사가 채우고, 고친 내역을 남긴다', async () => {
  const env = setup();
  const { ctx, cafe24 } = env;
  const c = await openAndFill(env, range(1, 40), 1);
  env.clock.advance(5 * 24 * HOUR);
  await tick(ctx);
  const cp = getCampaign(ctx, c.id).coupon_no!;
  await cafe24.placeOrder(MALL, 'm8', PRODUCT, 1, cp, { silent: true });
  assert.equal(buildReport(ctx, c.id).confirmed.qty, 0);
  await reconcileCampaign(ctx, c.id);
  assert.equal(buildReport(ctx, c.id).confirmed.qty, 1);
  const fixed = env.db.prepare("SELECT COUNT(*) AS n FROM issues WHERE kind = 'reconcile_fixed'").get() as { n: number };
  assert.equal(Number(fixed.n), 1);
});

test('4주 판정표: 확정 → 생산 결정 기록까지 끝나면 원씽을 충족한다', async () => {
  const env = setup();
  const { ctx, cafe24 } = env;
  const c = await openAndFill(env, range(1, 40), 1);
  await tick(ctx); // 초대 문자 발송
  env.clock.advance(5 * 24 * HOUR);
  await tick(ctx);
  const cp = getCampaign(ctx, c.id).coupon_no!;
  for (const m of range(1, 25)) await cafe24.placeOrder(MALL, m, PRODUCT, 1, cp);
  assert.throws(() => recordProductionDecision(ctx, 'op', c.id, { qty: 25, note: '가마 10/30' }), /확정된 공구/);
  env.clock.advance(72 * HOUR);
  await tick(ctx);
  assert.equal(getCampaign(ctx, c.id).state, 'settled');
  const rep = buildReport(ctx, c.id);
  assert.equal(rep.confirmed.qty, 25);
  assert.equal(rep.funnel.coupon_issued, 40);
  assert.equal(rep.rates.pledge_to_paid, 25 / 40);
  assert.equal(rep.funnel.invited_pledgers, 20);           // 짝수 회원만 초대받았다
  assert.equal(rep.rates.invite_to_pledge, 20 / 69);
  assert.throws(() => recordProductionDecision(ctx, 'op', c.id, { qty: 25, note: ' ' }), /근거/);
  recordProductionDecision(ctx, 'op', c.id, { qty: 26, note: '가마 10/30 · 여유 1장' });
  const sc = pilotScorecard(ctx);
  assert.equal(sc.rows.find(r => r.key === 'one_thing')!.pass, true);
  assert.equal(sc.rows.find(r => r.key === 'scale')!.pass, false); // 아직 1몰 · 1건
});

test('개인정보: 고객 전화번호·이름·주소를 담는 열이 없다', () => {
  const { db } = setup();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map(t => t.name);
  const cols = tables.flatMap(t => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map(c => `${t}.${c.name}`));
  const bad = cols.filter(c => /phone|cellphone|mobile|email|address|customer_name|member_name|\.name$/i.test(c));
  assert.deepEqual(bad, []);
});
