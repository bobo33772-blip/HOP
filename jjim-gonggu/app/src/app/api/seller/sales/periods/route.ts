// GET /api/seller/sales/periods?month=2026-10 — 모니터링 › 기간별: 고른 달 매출 · 지난달 같은 기간 비교 · 최근 6개월 · 상품별 · 유입별 (#92)

import { json, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { salesPeriods } from "@/lib/engine/sales";

export const GET = seller(async (req, _c: unknown, s) => json(await salesPeriods(await getCtx(), s.mallId, req.nextUrl.searchParams.get("month"))));
