// POST /api/admin/campaigns/:id/judge — 마감 판정 수동 실행 (마감 전에는 거부)

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { judgeNow } from "@/lib/engine/judge";

export const POST = admin(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const c = await judgeNow(await getCtx(), (await params).id, "operator");
  return json({ campaign: { id: c.id, state: c.state } });
});
