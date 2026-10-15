// GET /api/admin/malls/:mall/sales — 몰의 공구 매출: 합계 · 추이(?by=day|week|month) · 공구별 (#79)
//     ?format=csv&kind=campaigns|daily — 엑셀(CSV) 내려받기 (공구별 · 날짜별)

import { admin, csvFile, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { salesBy, salesCsv, salesCsvKind, salesOverview } from "@/lib/engine/sales";
import { chip } from "@/app/console/format";

type P = { params: Promise<{ mall: string }> };

export const GET = admin(async (req, { params }: P) => {
  const ctx = await getCtx(), q = req.nextUrl.searchParams, mall = (await params).mall;
  if (q.get("format") === "csv") {
    const f = await salesCsv(ctx, mall, salesCsvKind(q.get("kind")), (state, proceeded) => chip(state, proceeded)[0]);
    return csvFile(f.filename, f.body);
  }
  return json(await salesOverview(ctx, mall, salesBy(q.get("by"))));
});
