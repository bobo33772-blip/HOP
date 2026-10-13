// POST /api/seller/campaigns/:id/proceed — 미달 공구를 '그래도 살래요' 표시한 고객에게 그래도 진행 (본문 price를 비우면 원래 공구가)

import { json, readJson, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { ownedCampaign } from "@/lib/console-actions";
import { proceedCampaign } from "@/lib/engine/proceed";

export const POST = seller(async (req, { params }: { params: Promise<{ id: string }> }, s) => {
  const ctx = await getCtx();
  const c = await ownedCampaign(ctx, (await params).id, s.mallId);
  const done = await proceedCampaign(ctx, `seller:${s.userId ?? "unknown"}`, c.id, await readJson(req));
  return json({ campaign: { id: done.id, state: done.state, dealPrice: done.dealPrice, payUntil: done.payUntil } });
});
