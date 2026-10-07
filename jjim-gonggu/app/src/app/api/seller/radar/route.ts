// GET  /api/seller/radar — 찜 많은 상위 20개 상품 + 수집 상태
// POST /api/seller/radar — 수집 시작

import { json, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { radarState, startRadar } from "@/lib/console-actions";

export const GET = seller(async (_req, _c: unknown, s) => json(await radarState(await getCtx(), s.mallId)));

export const POST = seller(async (_req, _c: unknown, s) => {
  const out = await startRadar(await getCtx(), s.mallId);
  return json(out, out.started ? 202 : 200);
});
