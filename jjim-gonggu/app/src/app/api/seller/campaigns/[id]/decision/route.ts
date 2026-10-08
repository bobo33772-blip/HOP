// POST /api/seller/campaigns/:id/decision — 확정 수량으로 생산·발주를 결정했다고 기록

import { json, readJson, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { ownedCampaign } from "@/lib/console-actions";
import { recordProductionDecision } from "@/lib/engine/campaigns";

export const POST = seller(async (req, { params }: { params: Promise<{ id: string }> }, s) => {
  const ctx = await getCtx();
  const c = await ownedCampaign(ctx, (await params).id, s.mallId);
  const done = await recordProductionDecision(ctx, `seller:${s.userId ?? "unknown"}`, c.id, await readJson(req));
  return json({ campaign: { id: done.id, decisionQty: done.decisionQty } });
});
