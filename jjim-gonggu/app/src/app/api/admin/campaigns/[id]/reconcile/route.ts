// POST /api/admin/campaigns/:id/reconcile — 주문 대사 수동 실행

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { reconcileCampaign } from "@/lib/engine/payments";

export const POST = admin(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  return json(await reconcileCampaign(await getCtx(), (await params).id, "operator"));
});
