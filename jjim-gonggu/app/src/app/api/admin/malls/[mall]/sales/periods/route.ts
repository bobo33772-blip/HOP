// GET /api/admin/malls/:mall/sales/periods?month=2026-10 — 몰의 기간별 매출 (판매자 모니터링 › 기간별과 같은 숫자, #92)

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { salesPeriods } from "@/lib/engine/sales";

type P = { params: Promise<{ mall: string }> };

export const GET = admin(async (req, { params }: P) => json(await salesPeriods(await getCtx(), (await params).mall, req.nextUrl.searchParams.get("month"))));
