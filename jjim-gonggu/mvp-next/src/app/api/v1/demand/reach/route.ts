// GET /api/v1/demand/reach?product_no=101 — 공구를 열 상품의 도달 가능 인원(수신동의자 수). 숫자만 돌려준다.

import { NextResponse, type NextRequest } from "next/server";
import { getDb, schema } from "@/db";
import { requireSeller } from "@/lib/auth";
import { shopApi } from "@/lib/malls";
import { computeReach } from "@/lib/radar";

export async function GET(req: NextRequest) {
  const s = await requireSeller();
  if (s instanceof NextResponse) return s;
  const productNo = Number(req.nextUrl.searchParams.get("product_no"));
  if (!Number.isInteger(productNo) || productNo <= 0) return NextResponse.json({ error: "bad_product_no" }, { status: 400 });

  const reach = await computeReach(await shopApi(s.mallId), productNo);
  const db = await getDb();
  await db.insert(schema.auditLogs).values({ mallId: s.mallId, actor: `seller:${s.userId ?? "unknown"}`, action: "privacy.reach_computed", detail: { productNo, interested: reach.interested } });
  return NextResponse.json(reach);
}
