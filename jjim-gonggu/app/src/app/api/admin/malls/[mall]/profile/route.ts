// POST /api/admin/malls/:mall/profile — 브랜드명 · 문자 발신번호 · 무료수신거부 번호 (광고 문자 필수 정보)

import { admin, json, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { saveMallProfile } from "@/lib/console-actions";

export const POST = admin(async (req, { params }: { params: Promise<{ mall: string }> }) => {
  await saveMallProfile(await getCtx(), "operator", (await params).mall, await readJson(req));
  return json({ ok: true });
});
