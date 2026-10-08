// POST /api/seller/widget — 상품 페이지 위젯 스크립트 (다시) 설치

import { json, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { audit } from "@/lib/engine/context";
import { installWidget } from "@/lib/console-actions";

export const POST = seller(async (_req, _c: unknown, s) => {
  const ctx = await getCtx();
  const scriptNo = await installWidget(ctx, s.mallId);
  await audit(ctx, `seller:${s.userId ?? "unknown"}`, "mall.widget_installed", s.mallId, { scriptNo }, s.mallId);
  return json({ ok: true });
});
