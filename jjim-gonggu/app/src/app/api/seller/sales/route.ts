// GET /api/seller/sales — 내 공구 매출: 합계 · 추이(?by=day|week|month) · 공구별 (#79)
//     ?format=csv&kind=campaigns|daily — 엑셀(CSV) 내려받기 (공구별 · 날짜별)

import { csvFile, json, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { salesBy, salesCsv, salesCsvKind, salesOverview } from "@/lib/engine/sales";
import { chip } from "@/app/console/format";

export const GET = seller(async (req, _c: unknown, s) => {
  const ctx = await getCtx(), q = req.nextUrl.searchParams;
  if (q.get("format") === "csv") {
    const f = await salesCsv(ctx, s.mallId, salesCsvKind(q.get("kind")), (state, proceeded) => chip(state, proceeded)[0]);
    return csvFile(f.filename, f.body);
  }
  return json(await salesOverview(ctx, s.mallId, salesBy(q.get("by"))));
});
