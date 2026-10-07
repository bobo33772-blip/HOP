// POST /api/seller/campaigns/preview — 열기 전 미리보기

import { json, readJson, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { parseCampaignInput, previewCampaign } from "@/lib/engine/campaigns";

export const POST = seller(async (req, _c: unknown, s) => json(await previewCampaign(await getCtx(), s.mallId, parseCampaignInput(await readJson(req)))));
