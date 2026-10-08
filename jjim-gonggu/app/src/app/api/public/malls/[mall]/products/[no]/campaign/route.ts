// GET /api/public/malls/:mall/products/:no/campaign — 위젯: 이 상품의 최근 공구 (공개 정보만)

import { CORS, handle, json, preflight } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { activeCampaignForProduct, publicView } from "@/lib/engine/campaigns";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ mall: string; no: string }> }) => {
  const { mall, no } = await params;
  const ctx = await getCtx();
  const c = Number.isInteger(Number(no)) ? await activeCampaignForProduct(ctx, mall, Number(no)) : null;
  if (!c) return json({ error: "none", message: "진행 중인 공구가 없어요." }, 404, CORS);
  return json({ campaign: await publicView(ctx, c) }, 200, CORS);
}, CORS);

export const OPTIONS = preflight;
