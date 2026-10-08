// POST /api/admin/malls/:mall/campaigns/preview — 열기 전 미리보기: 초대 인원, 문자 내용, 발송 시각, 개당 마진

import { admin, json, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { parseCampaignInput, previewCampaign } from "@/lib/engine/campaigns";

export const POST = admin(async (req, { params }: { params: Promise<{ mall: string }> }) => {
  return json(await previewCampaign(await getCtx(), (await params).mall, parseCampaignInput(await readJson(req))));
});
