// POST /api/admin/campaigns/:id/decision — 원씽 기록: 확정 수량으로 생산·발주를 결정했다

import { admin, json, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { recordProductionDecision } from "@/lib/engine/campaigns";

export const POST = admin(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const c = await recordProductionDecision(await getCtx(), "operator", (await params).id, await readJson(req));
  return json({ campaign: { id: c.id, decisionQty: c.decisionQty } });
});
