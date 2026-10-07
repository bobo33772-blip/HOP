// GET  /api/admin/malls/:mall/radar — 찜 많은 상위 20개 상품 (마지막 완료 수집) + 진행 중 수집 상태
// POST /api/admin/malls/:mall/radar — 수집 시작 (응답 후 백그라운드로 돈다)

import { after } from "next/server";
import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { getMall } from "@/lib/engine/campaigns";
import { getRadar, latestRun, runCollection, startCollection } from "@/lib/radar";

type P = { params: Promise<{ mall: string }> };

export const GET = admin(async (_req, { params }: P) => {
  const { mall } = await params;
  const ctx = await getCtx();
  await getMall(ctx, mall);
  const [radar, current] = await Promise.all([getRadar(ctx.db, mall, "total", 20), latestRun(ctx.db, mall)]);
  return json({ ...radar, current });
});

export const POST = admin(async (_req, { params }: P) => {
  const { mall } = await params;
  const ctx = await getCtx();
  await getMall(ctx, mall);
  const { run, started } = await startCollection(ctx.db, mall);
  if (started) {
    const api = await ctx.shop(mall);
    after(() => runCollection(ctx.db, api, mall, run.id));
  }
  return json({ run, started }, started ? 202 : 200);
});
