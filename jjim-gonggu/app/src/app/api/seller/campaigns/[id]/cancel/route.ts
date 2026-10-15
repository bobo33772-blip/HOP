// POST /api/seller/campaigns/:id/cancel — 모집 중인 내 공구를 취소 (본문 { reason }, 이유 필수). 다른 몰 공구는 404 (#65)

import { json, readJson, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { ownedCampaign } from "@/lib/console-actions";
import { cancelCampaign } from "@/lib/engine/cancel";

export const POST = seller(async (req, { params }: { params: Promise<{ id: string }> }, s) => {
  const ctx = await getCtx();
  const c = await ownedCampaign(ctx, (await params).id, s.mallId);
  const r = await cancelCampaign(ctx, `seller:${s.userId ?? "unknown"}`, c.id, await readJson(req));
  return json({ campaign: { id: r.campaign.id, state: r.campaign.state }, pledgers: r.pledgers, notified: r.notified });
});
