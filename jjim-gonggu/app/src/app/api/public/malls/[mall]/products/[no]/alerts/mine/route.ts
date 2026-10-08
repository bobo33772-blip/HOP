// POST   /api/public/malls/:mall/products/:no/alerts/mine — 내 알림 신청 조회 (회원 토큰을 본문으로 받으려고 POST)
// DELETE /api/public/malls/:mall/products/:no/alerts/mine — 알림 신청 취소

import { CORS, handle, json, limitPledge, preflight, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { cancelAlert, myAlert } from "@/lib/engine/alerts";

type P = { params: Promise<{ mall: string; no: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  limitPledge(req);
  const { mall, no } = await params;
  return json(await myAlert(await getCtx(), mall, no, await readJson(req)), 200, CORS);
}, CORS);

export const DELETE = handle(async (req: Request, { params }: P) => {
  limitPledge(req);
  const { mall, no } = await params;
  return json(await cancelAlert(await getCtx(), mall, no, await readJson(req)), 200, CORS);
}, CORS);

export const OPTIONS = preflight;
