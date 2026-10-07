import { audit, newId, recordIssue } from '../db.ts';
import { HOUR, fmtKst, nextAllowedSendTime } from '../time.ts';
import { UserError, type Ctx } from '../context.ts';
import { getCampaign, getMall, pledgedQty, type Campaign } from './campaigns.ts';

/** 마감 시각이 지난 진행 중 공구를 모두 판정한다 */
export async function judgeDue(ctx: Ctx): Promise<string[]> {
  const rows = ctx.db.prepare("SELECT id FROM campaigns WHERE state = 'open' AND deadline_at <= ?").all(ctx.clock.now().toISOString()) as { id: string }[];
  const done: string[] = [];
  for (const r of rows) { if (await judge(ctx, r.id, 'scheduler')) done.push(r.id); }
  return done;
}

/** 운영자 수동 실행용. 마감 전에는 판정하지 않는다 (가짜 마감 금지) */
export async function judgeNow(ctx: Ctx, campaignId: string, actor: string) {
  const c = getCampaign(ctx, campaignId);
  if (ctx.clock.now() < new Date(c.deadline_at)) throw new UserError('before_deadline', '마감 시각 전에는 판정할 수 없어요.', 409);
  if (c.state !== 'open') throw new UserError('already_judged', '이미 판정한 공구예요.', 409);
  await judge(ctx, campaignId, actor);
  return getCampaign(ctx, campaignId);
}

async function judge(ctx: Ctx, id: string, actor: string): Promise<boolean> {
  const now = ctx.clock.now();
  const c = getCampaign(ctx, id);
  const total = pledgedQty(ctx, id);
  const reached = total >= c.target_qty;
  const payUntil = new Date(now.getTime() + c.pay_window_h * HOUR);
  // 상태 전이는 한 번만 일어난다 (스케줄러 중복 실행 대비)
  const r = ctx.db.prepare("UPDATE campaigns SET state = ?, judged_at = ?, pay_until = ? WHERE id = ? AND state = 'open'")
    .run(reached ? 'reached' : 'failed', now.toISOString(), reached ? payUntil.toISOString() : null, id);
  if (!r.changes) return false;
  audit(ctx.db, now, actor, reached ? 'campaign.reached' : 'campaign.failed', id, { pledged: total, target: c.target_qty });

  const pledgers = (ctx.db.prepare("SELECT member_id FROM pledges WHERE campaign_id = ? AND state = 'pledged'").all(id) as { member_id: string }[]).map(x => x.member_id);
  if (reached) {
    await issueCoupons(ctx, getCampaign(ctx, id), pledgers);
  } else {
    ctx.db.prepare("UPDATE pledges SET state = 'not_reached', updated_at = ? WHERE campaign_id = ? AND state = 'pledged'").run(now.toISOString(), id);
  }
  await queueResult(ctx, getCampaign(ctx, id), pledgers, total);
  return true;
}

/** 100명씩 나눠 발급하고, 발급 내역과 대조해 빠진 회원은 한 번 더 발급한다. 그래도 빠지면 이슈로 남긴다 */
async function issueCoupons(ctx: Ctx, c: Campaign, memberIds: string[]) {
  const now = ctx.clock.now();
  for (let i = 0; i < memberIds.length; i += 100) {
    try { await ctx.cafe24.issueCoupon(c.mall_id, c.coupon_no!, memberIds.slice(i, i + 100)); }
    catch (e) { ctx.log('쿠폰 발급 묶음 실패', { campaign: c.id, error: String(e) }); }
  }
  let holders = new Set(await ctx.cafe24.listCouponHolders(c.mall_id, c.coupon_no!));
  let missing = memberIds.filter(m => !holders.has(m));
  if (missing.length) {
    for (let i = 0; i < missing.length; i += 100) {
      try { await ctx.cafe24.issueCoupon(c.mall_id, c.coupon_no!, missing.slice(i, i + 100)); } catch { /* 아래에서 다시 대조 */ }
    }
    holders = new Set(await ctx.cafe24.listCouponHolders(c.mall_id, c.coupon_no!));
    missing = memberIds.filter(m => !holders.has(m));
  }
  const ok = ctx.db.prepare("UPDATE pledges SET state = 'coupon_issued', updated_at = ? WHERE campaign_id = ? AND member_id = ? AND state = 'pledged'");
  for (const m of memberIds) if (holders.has(m)) ok.run(now.toISOString(), c.id, m);
  if (missing.length) recordIssue(ctx.db, now, c.id, 'coupon_missing', { count: missing.length, members: missing });
}

/** 결과 안내 문자. 광고성 여부(P5) 결론 전이라 수신 동의 고객에게만 보낸다 */
async function queueResult(ctx: Ctx, c: Campaign, pledgers: string[], total: number) {
  if (!pledgers.length) return;
  const mall = getMall(ctx, c.mall_id);
  const ok = await ctx.cafe24.smsConsented(c.mall_id, pledgers);
  const to = pledgers.filter(m => ok.has(m));
  if (!to.length) return;
  const link = ctx.productUrl(c.mall_id, c.product_no);
  const content = c.state === 'reached'
    ? `[${mall.brand_name}] ${c.product_name} 공동구매가 목표를 달성했어요 (${total}/${c.target_qty}개). 회원님 계정에 할인 쿠폰을 넣어 드렸어요. ${fmtKst(c.pay_until)}까지 결제해 주세요.\n${link}`
    : `[${mall.brand_name}] ${c.product_name} 공동구매가 목표(${c.target_qty}개)에 못 미쳐 진행되지 않아요. 결제된 금액은 없어요. 신청해 주셔서 감사합니다.`;
  ctx.db.prepare(`INSERT INTO messages (id, campaign_id, kind, recipients_json, content, status, send_after) VALUES (?,?,?,?,?,'scheduled',?)`)
    .run(newId('msg'), c.id, 'result', JSON.stringify(to), content, nextAllowedSendTime(ctx.clock.now()).toISOString());
}
