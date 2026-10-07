// GET /api/public/campaigns/:id/progress — 위젯이 30초마다 진행률을 다시 읽는다

import { CORS, handle, json, preflight } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { getCampaign, publicView } from "@/lib/engine/campaigns";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await getCtx();
  return json({ campaign: await publicView(ctx, await getCampaign(ctx, (await params).id)) }, 200, CORS);
}, CORS);

export const OPTIONS = preflight;
