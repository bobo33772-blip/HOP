// GET /api/seller/campaigns/:id — 내 공구 상세 (다른 몰 공구는 404)

import { json, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { campaignDetail } from "@/lib/console-actions";

export const GET = seller(async (_req, { params }: { params: Promise<{ id: string }> }, s) => json(await campaignDetail(await getCtx(), (await params).id, s.mallId)));
