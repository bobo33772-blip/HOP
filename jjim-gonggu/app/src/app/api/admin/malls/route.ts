// GET /api/admin/malls — 연결된 쇼핑몰과 문자 발송 정보

import { asc, isNull } from "drizzle-orm";
import { schema } from "@/db";
import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";

export const GET = admin(async () => {
  const ctx = await getCtx();
  const m = schema.malls;
  const malls = await ctx.db.select({ mallId: m.mallId, brandName: m.brandName, optOutNumber: m.optOutNumber, smsSender: m.smsSender })
    .from(m).where(isNull(m.uninstalledAt)).orderBy(asc(m.installedAt));
  return json({ malls });
});
