// POST /api/admin/malls/:mall/profile — 브랜드명 · 문자 발신번호 · 무료수신거부 번호 (광고 문자 필수 정보)

import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { admin, json, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { audit, UserError } from "@/lib/engine/context";
import { isValidOptOutNumber } from "@/lib/core/messaging";
import { getMall } from "@/lib/engine/campaigns";

export const POST = admin(async (req, { params }: { params: Promise<{ mall: string }> }) => {
  const { mall } = await params;
  const ctx = await getCtx();
  await getMall(ctx, mall);
  const b = await readJson(req);
  const brandName = String(b.brandName ?? "").trim().slice(0, 40);
  const optOutNumber = String(b.optOutNumber ?? "").trim().slice(0, 20);
  const smsSender = String(b.smsSender ?? "").trim().slice(0, 20);
  if (!brandName || !isValidOptOutNumber(optOutNumber) || !/^[0-9-]{8,20}$/.test(smsSender)) {
    throw new UserError("bad_profile", "브랜드명, 문자 발신번호, 무료수신거부 번호를 확인해 주세요.");
  }
  await ctx.db.update(schema.malls).set({ brandName, optOutNumber, smsSender }).where(eq(schema.malls.mallId, mall));
  await audit(ctx, "operator", "mall.profile", mall, { brandName, optOutNumber, smsSender }, mall);
  return json({ ok: true });
});
