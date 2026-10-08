// POST /api/public/campaigns/:id/pledges — 결제 없는 참여 신청. 헤더 Idempotency-Key 필수, 같은 키로 다시 오면 200

import { CORS, handle, json, limitPledge, preflight, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { createPledge } from "@/lib/engine/pledges";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  limitPledge(req);
  const out = await createPledge(await getCtx(), (await params).id, await readJson(req), req.headers.get("idempotency-key") || undefined);
  return json(out, out.replay ? 200 : 201, CORS);
}, CORS);

export const OPTIONS = preflight;
