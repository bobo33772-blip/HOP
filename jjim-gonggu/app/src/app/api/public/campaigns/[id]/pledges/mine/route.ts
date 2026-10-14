// POST   /api/public/campaigns/:id/pledges/mine — 내 신청 조회 (회원 토큰을 본문으로 받으려고 POST)
// DELETE /api/public/campaigns/:id/pledges/mine — 마감 전 신청 취소

import { CORS, handle, json, limitLookup, limitPledge, preflight, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { cancelPledge, myPledge } from "@/lib/engine/pledges";

type P = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  limitLookup(req); // 조회는 쓰기와 요청 제한을 나눠 쓴다 (#69)
  return json(await myPledge(await getCtx(), (await params).id, await readJson(req)), 200, CORS);
}, CORS);

export const DELETE = handle(async (req: Request, { params }: P) => {
  limitPledge(req);
  return json(await cancelPledge(await getCtx(), (await params).id, await readJson(req)), 200, CORS);
}, CORS);

export const OPTIONS = preflight;
