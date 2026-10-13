// 결제 없는 참여 신청 (F5·F6). 로그인 회원만(암호화 회원 ID 서버 검증), 1인 한도, 같은 요청 재전송은 한 번만.

import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { canCancel, checkPledge, type PledgeState } from "../core/pledge";
import type { CampaignState } from "../core/campaign";
import { UserError, type Ctx } from "./context";
import { getCampaign, publicView } from "./campaigns";

type Pledge = typeof schema.pledges.$inferSelect;

export async function memberOf(ctx: Ctx, mallId: string, token: unknown): Promise<string> {
  if (typeof token !== "string" || token.length < 8 || token.length > 2048) throw new UserError("login_required", "로그인한 회원만 참여할 수 있어요.", 401);
  const id = await (await ctx.shop(mallId)).verifyMember(token);
  if (!id) throw new UserError("member_unverified", "본인 확인에 실패했어요. 다시 로그인해 주세요.", 401);
  return id;
}

const view = (p: Pledge) => ({ qty: p.qty, state: p.state as PledgeState, createdAt: p.createdAt });

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function findPledge(db: Pick<Db, "select">, campaignId: string, memberId: string) {
  const [p] = await db.select().from(schema.pledges).where(and(eq(schema.pledges.campaignId, campaignId), eq(schema.pledges.memberId, memberId)));
  return p;
}

/** 공구 줄을 잠그고 아직 모집 중인지 다시 본다. 판정도 같은 줄을 잠그므로, 판정과 엇갈린 신청·취소는 여기서 막힌다 */
async function lockOpen(ctx: Ctx, tx: Tx, campaignId: string, message: string) {
  const [row] = await tx.select({ state: schema.campaigns.state, deadlineAt: schema.campaigns.deadlineAt }).from(schema.campaigns)
    .where(eq(schema.campaigns.id, campaignId)).for("update");
  if (!row || row.state !== "open" || ctx.clock.now() >= row.deadlineAt) throw new UserError("closed", message, 409);
}

/** 같은 Idempotency-Key로 다시 오면 처음 결과를 그대로 돌려준다 */
export async function createPledge(ctx: Ctx, campaignId: string, body: { member_token?: unknown; qty?: unknown }, idemKey: string | undefined) {
  const c = await getCampaign(ctx, campaignId);
  const memberId = await memberOf(ctx, c.mallId, body.member_token);
  if (!idemKey || idemKey.length > 100) throw new UserError("idempotency_required", "Idempotency-Key 헤더가 필요해요.");
  const qty = Number(body.qty);
  const now = ctx.clock.now();
  const rejected = checkPledge({ campaignState: c.state as CampaignState, deadlineAt: c.deadlineAt, perMemberLimit: c.perMemberLimit, qty, now });
  if (rejected === "closed") throw new UserError("closed", "마감된 공구예요.", 409);
  if (rejected === "invalid_qty") throw new UserError("bad_qty", "수량을 확인해 주세요.");
  if (rejected === "limit") throw new UserError("over_limit", `1인 최대 ${c.perMemberLimit}개까지 신청할 수 있어요.`, 422);

  const { p, replay } = await ctx.db.transaction(async (tx) => {
    await lockOpen(ctx, tx, c.id, "마감된 공구예요.");
    const ex = await findPledge(tx, c.id, memberId);
    if (ex && ex.idemKey === idemKey) return { p: ex, replay: true };
    if (ex && ex.state === "pledged") throw new UserError("already_pledged", `이미 ${ex.qty}개 신청했어요. 수량을 바꾸려면 취소 후 다시 신청해 주세요.`, 409);
    if (ex && ex.state !== "cancelled") throw new UserError("closed", "마감된 공구예요.", 409);

    if (ex) {
      await tx.update(schema.pledges).set({ qty, state: "pledged", idemKey, updatedAt: now }).where(and(eq(schema.pledges.id, ex.id), eq(schema.pledges.state, "cancelled")));
    } else {
      // 같은 회원의 동시 요청은 (campaign_id, member_id) 유일 키가 막는다 → 뒤 요청은 이미 신청으로 처리
      const inserted = await tx.insert(schema.pledges).values({ campaignId: c.id, memberId, qty, state: "pledged", idemKey, createdAt: now, updatedAt: now })
        .onConflictDoNothing().returning();
      if (!inserted.length) {
        const again = await findPledge(tx, c.id, memberId);
        if (again && again.idemKey === idemKey) return { p: again, replay: true };
        throw new UserError("already_pledged", "이미 신청했어요.", 409);
      }
    }
    return { p: (await findPledge(tx, c.id, memberId))!, replay: false };
  });
  return { pledge: view(p), campaign: await publicView(ctx, c), replay };
}

export async function cancelPledge(ctx: Ctx, campaignId: string, body: { member_token?: unknown }) {
  const c = await getCampaign(ctx, campaignId);
  const memberId = await memberOf(ctx, c.mallId, body.member_token);
  const now = ctx.clock.now();
  if (!canCancel("pledged", c.state as CampaignState, c.deadlineAt, now)) throw new UserError("closed", "마감 후에는 취소할 수 없어요.", 409);
  await ctx.db.transaction(async (tx) => {
    await lockOpen(ctx, tx, c.id, "마감 후에는 취소할 수 없어요.");
    const r = await tx.update(schema.pledges).set({ state: "cancelled", updatedAt: now })
      .where(and(eq(schema.pledges.campaignId, c.id), eq(schema.pledges.memberId, memberId), eq(schema.pledges.state, "pledged"))).returning();
    if (!r.length) throw new UserError("no_pledge", "취소할 신청이 없어요.", 404);
  });
  return { campaign: await publicView(ctx, c) };
}

export async function myPledge(ctx: Ctx, campaignId: string, body: { member_token?: unknown }) {
  const c = await getCampaign(ctx, campaignId);
  const memberId = await memberOf(ctx, c.mallId, body.member_token);
  const p = await findPledge(ctx.db, c.id, memberId);
  return { pledge: p ? view(p) : null, campaign: await publicView(ctx, c) };
}
