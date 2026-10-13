// POST /api/admin/campaigns/:id/proceed — 미달 공구를 그래도 진행 (판매자 확인 후 운영자가 대신 누를 때)

import { admin, json, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { proceedCampaign } from "@/lib/engine/proceed";

export const POST = admin(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const c = await proceedCampaign(await getCtx(), "operator", (await params).id, await readJson(req));
  return json({ campaign: { id: c.id, state: c.state, dealPrice: c.dealPrice, payUntil: c.payUntil } });
});
