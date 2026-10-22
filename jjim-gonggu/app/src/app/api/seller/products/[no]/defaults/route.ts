// GET /api/seller/products/:no/defaults — 공구 열기 칸 미리 채우기: 원가(지난 공구 → 카페24 공급가) · 최소 생산 수량 (#124)

import { json, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { productDefaults } from "@/lib/console-actions";

export const GET = seller(async (_req, { params }: { params: Promise<{ no: string }> }, s) => json(await productDefaults(await getCtx(), s.mallId, Number((await params).no))));
