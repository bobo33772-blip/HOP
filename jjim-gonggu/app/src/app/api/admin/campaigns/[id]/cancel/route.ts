// POST /api/admin/campaigns/:id/cancel — 모집 중인 공구를 취소 (판매자 확인 후 운영자가 대신 누를 때, 본문 { reason }) (#65)

import { admin, json, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { cancelCampaign } from "@/lib/engine/cancel";

export const POST = admin(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const r = await cancelCampaign(await getCtx(), "operator", (await params).id, await readJson(req));
  return json({ campaign: { id: r.campaign.id, state: r.campaign.state }, pledgers: r.pledgers, notified: r.notified });
});
