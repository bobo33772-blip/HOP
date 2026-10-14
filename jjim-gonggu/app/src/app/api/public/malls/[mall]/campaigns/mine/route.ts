// POST /api/public/malls/:mall/campaigns/mine — 내가 초대받았거나 신청한 다른 상품의 진행 중 공구 (#60)
// 회원 토큰을 본문으로 받으려고 POST. 본문: { member_token, exclude: 지금 보는 상품 번호 }

import { CORS, handle, json, limitPledge, preflight, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { myOtherCampaigns } from "@/lib/engine/my-campaigns";

type P = { params: Promise<{ mall: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  limitPledge(req);
  return json(await myOtherCampaigns(await getCtx(), (await params).mall, await readJson(req)), 200, CORS);
}, CORS);

export const OPTIONS = preflight;
