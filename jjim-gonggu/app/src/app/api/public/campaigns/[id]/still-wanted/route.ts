// POST   /api/public/campaigns/:id/still-wanted — 미달 공구 신청자의 '그래도 살래요' 표시 (판정 뒤 48시간 안)
// DELETE /api/public/campaigns/:id/still-wanted — 표시 취소

import { CORS, handle, json, limitPledge, preflight, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { setStillWanted } from "@/lib/engine/proceed";

type P = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  limitPledge(req);
  return json(await setStillWanted(await getCtx(), (await params).id, await readJson(req), true), 200, CORS);
}, CORS);

export const DELETE = handle(async (req: Request, { params }: P) => {
  limitPledge(req);
  return json(await setStillWanted(await getCtx(), (await params).id, await readJson(req), false), 200, CORS);
}, CORS);

export const OPTIONS = preflight;
