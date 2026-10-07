// GET/POST /api/seller/profile — 내 쇼핑몰의 브랜드명 · 문자 발신번호 · 무료수신거부 번호

import { json, readJson, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { mallProfile, saveMallProfile } from "@/lib/console-actions";

export const GET = seller(async (_req, _c: unknown, s) => json({ mall: await mallProfile(await getCtx(), s.mallId) }));

export const POST = seller(async (req, _c: unknown, s) => {
  await saveMallProfile(await getCtx(), `seller:${s.userId ?? "unknown"}`, s.mallId, await readJson(req));
  return json({ ok: true });
});
