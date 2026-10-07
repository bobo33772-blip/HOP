// GET  /api/admin/malls/:mall/campaigns — 공구 목록
// POST /api/admin/malls/:mall/campaigns — 공구 열기 (쿠폰 생성 · 초대 문자 예약)

import { admin, json, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { listCampaigns, openCampaign, parseCampaignInput } from "@/lib/engine/campaigns";

type P = { params: Promise<{ mall: string }> };

export const GET = admin(async (_req, { params }: P) => {
  return json({ campaigns: await listCampaigns(await getCtx(), (await params).mall) });
});

export const POST = admin(async (req, { params }: P) => {
  const out = await openCampaign(await getCtx(), "operator", (await params).mall, parseCampaignInput(await readJson(req)));
  return json({ campaign: { id: out.campaign.id }, invited: out.invited, sendAt: out.sendAt }, 201);
});
