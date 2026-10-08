// GET /api/admin/scorecard — 4주 성공 기준 판정표

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { pilotScorecard } from "@/lib/engine/report";

export const GET = admin(async () => json(await pilotScorecard(await getCtx())));
