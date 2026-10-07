// GET /api/admin/now — 엔진 시계 (데모 모드에서는 앞당긴 시각)

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";

export const GET = admin(async () => json({ now: (await getCtx()).clock.now() }));
