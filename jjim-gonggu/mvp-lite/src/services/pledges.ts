import { newId, tx } from '../db.ts';
import { UserError, type Ctx } from '../context.ts';
import { getCampaign, pledgedQty, publicView } from './campaigns.ts';

type Pledge = { id: string; campaign_id: string; member_id: string; qty: number; state: string; idem_key: string; created_at: string };

async function memberOf(ctx: Ctx, mallId: string, token: unknown): Promise<string> {
  if (typeof token !== 'string' || token.length < 8 || token.length > 2048) throw new UserError('login_required', '로그인한 회원만 참여할 수 있어요.', 401);
  const id = await ctx.cafe24.verifyMember(mallId, token);
  if (!id) throw new UserError('member_unverified', '본인 확인에 실패했어요. 다시 로그인해 주세요.', 401);
  return id;
}

/** 결제 없는 참여 신청. 같은 Idempotency-Key로 다시 오면 처음 결과를 그대로 돌려준다 */
export async function createPledge(ctx: Ctx, campaignId: string, body: { member_token?: unknown; qty?: unknown }, idemKey: string | undefined) {
  const c = getCampaign(ctx, campaignId);
  const memberId = await memberOf(ctx, c.mall_id, body.member_token);
  const qty = Number(body.qty);
  if (!idemKey || idemKey.length > 100) throw new UserError('idempotency_required', 'Idempotency-Key 헤더가 필요해요.');
  const now = ctx.clock.now();
  if (c.state !== 'open' || now >= new Date(c.deadline_at)) throw new UserError('closed', '마감된 공구예요.', 409);
  if (!Number.isInteger(qty) || qty < 1) throw new UserError('bad_qty', '수량을 확인해 주세요.');
  if (qty > c.per_member_limit) throw new UserError('over_limit', `1인 최대 ${c.per_member_limit}개까지 신청할 수 있어요.`, 422);

  return tx(ctx.db, () => {
    const ex = ctx.db.prepare('SELECT * FROM pledges WHERE campaign_id = ? AND member_id = ?').get(c.id, memberId) as Pledge | undefined;
    if (ex && ex.idem_key === idemKey) return { pledge: view(ex), campaign: publicView(ctx, c), replay: true };
    if (ex && ex.state === 'pledged') throw new UserError('already_pledged', `이미 ${ex.qty}개 신청했어요. 수량을 바꾸려면 취소 후 다시 신청해 주세요.`, 409);
    const ts = now.toISOString();
    if (ex) {
      ctx.db.prepare("UPDATE pledges SET qty = ?, state = 'pledged', idem_key = ?, updated_at = ? WHERE id = ?").run(qty, idemKey, ts, ex.id);
    } else {
      ctx.db.prepare("INSERT INTO pledges (id, campaign_id, member_id, qty, state, idem_key, created_at, updated_at) VALUES (?,?,?,?, 'pledged', ?,?,?)")
        .run(newId('plg'), c.id, memberId, qty, idemKey, ts, ts);
    }
    const p = ctx.db.prepare('SELECT * FROM pledges WHERE campaign_id = ? AND member_id = ?').get(c.id, memberId) as Pledge;
    return { pledge: view(p), campaign: publicView(ctx, c), replay: false };
  });
}

export async function cancelPledge(ctx: Ctx, campaignId: string, body: { member_token?: unknown }) {
  const c = getCampaign(ctx, campaignId);
  const memberId = await memberOf(ctx, c.mall_id, body.member_token);
  if (c.state !== 'open' || ctx.clock.now() >= new Date(c.deadline_at)) throw new UserError('closed', '마감 후에는 취소할 수 없어요.', 409);
  const r = ctx.db.prepare("UPDATE pledges SET state = 'cancelled', updated_at = ? WHERE campaign_id = ? AND member_id = ? AND state = 'pledged'")
    .run(ctx.clock.now().toISOString(), c.id, memberId);
  if (!r.changes) throw new UserError('no_pledge', '취소할 신청이 없어요.', 404);
  return { campaign: publicView(ctx, c) };
}

export async function myPledge(ctx: Ctx, campaignId: string, body: { member_token?: unknown }) {
  const c = getCampaign(ctx, campaignId);
  const memberId = await memberOf(ctx, c.mall_id, body.member_token);
  const p = ctx.db.prepare('SELECT * FROM pledges WHERE campaign_id = ? AND member_id = ?').get(c.id, memberId) as Pledge | undefined;
  return { pledge: p ? view(p) : null, campaign: publicView(ctx, c) };
}

const view = (p: Pledge) => ({ qty: p.qty, state: p.state, created_at: p.created_at });

export { pledgedQty };
