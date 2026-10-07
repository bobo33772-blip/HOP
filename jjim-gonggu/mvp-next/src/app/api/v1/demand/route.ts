// GET /api/v1/demand?sort=total|wishlist|cart — 수요 레이더 (마지막 완료 수집 + 진행 중 수집 상태)

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { requireSeller } from "@/lib/auth";
import { getRadar, latestRun, type RadarSort } from "@/lib/radar";

const SORTS: RadarSort[] = ["total", "wishlist", "cart"];

export async function GET(req: NextRequest) {
  const s = await requireSeller();
  if (s instanceof NextResponse) return s;
  const q = req.nextUrl.searchParams.get("sort") as RadarSort | null;
  const sort = q && SORTS.includes(q) ? q : "total";
  const db = await getDb();
  const [radar, current] = await Promise.all([getRadar(db, s.mallId, sort), latestRun(db, s.mallId)]);
  return NextResponse.json({ ...radar, current });
}
