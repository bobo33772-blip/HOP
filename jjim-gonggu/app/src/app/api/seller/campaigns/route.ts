// GET  /api/seller/campaigns — 내 공구 목록
// POST /api/seller/campaigns — 공구 열기 (쿠폰 생성 · 초대 문자 예약)

import { json, readJson, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { listCampaigns, openCampaign, parseCampaignInput } from "@/lib/engine/campaigns";

export const GET = seller(async (_req, _c: unknown, s) => json({ campaigns: await listCampaigns(await getCtx(), s.mallId) }));

export const POST = seller(async (req, _c: unknown, s) => {
  const out = await openCampaign(await getCtx(), `seller:${s.userId ?? "unknown"}`, s.mallId, parseCampaignInput(await readJson(req)));
  return json({ campaign: { id: out.campaign.id }, invited: out.invited, sendAt: out.sendAt }, 201);
});
