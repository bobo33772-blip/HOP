// GET /api/admin/malls/:mall/products/:no/defaults — 공구 열기 칸 미리 채우기: 원가(지난 공구 → 카페24 공급가) · 최소 생산 수량 (#124)

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { productDefaults } from "@/lib/console-actions";

type P = { params: Promise<{ mall: string; no: string }> };

export const GET = admin(async (_req, { params }: P) => { const p = await params; return json(await productDefaults(await getCtx(), p.mall, Number(p.no))); });
