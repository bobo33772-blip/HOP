// POST /api/admin/messages/:id/retry — 실패한 문자 다시 보내기 예약

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { retryMessage } from "@/lib/engine/messages";

export const POST = admin(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const id = (await params).id;
  return json({ ok: /^[0-9a-f-]{36}$/i.test(id) && (await retryMessage(await getCtx(), id)) });
});
