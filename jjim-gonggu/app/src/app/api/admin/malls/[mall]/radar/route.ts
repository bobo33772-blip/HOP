// GET  /api/admin/malls/:mall/radar — 찜 많은 상위 20개 상품 (마지막 완료 수집) + 진행 중 수집 상태
// POST /api/admin/malls/:mall/radar — 수집 시작 (응답 후 백그라운드로 돈다)

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { radarState, startRadar } from "@/lib/console-actions";

type P = { params: Promise<{ mall: string }> };

export const GET = admin(async (_req, { params }: P) => json(await radarState(await getCtx(), (await params).mall)));

export const POST = admin(async (_req, { params }: P) => {
  const out = await startRadar(await getCtx(), (await params).mall);
  return json(out, out.started ? 202 : 200);
});
