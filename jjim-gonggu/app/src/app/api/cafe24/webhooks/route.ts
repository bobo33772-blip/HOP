// 카페24 웹훅 수신. 받으면 저장(trace id로 중복 제거)하고, 주문·결제·취소 이벤트는 바로 반영한다.
// 반영할 때도 본문은 믿지 않고 주문번호로 카페24 주문을 다시 조회한다 → 위조 웹훅이 확정 수량을 바꾸지 못한다.
// 공식 형식(2026-10-07 확인): 헤더 X-API-Key, X-Trace-ID / 본문 { event_no, resource: { mall_id, ... } }
// 웹훅은 누락될 수 있어 매일 03:00 야간 대사로 보완한다. 실패 응답이 쌓이면 카페24가 자동 미수신 처리하므로 처리 오류도 200으로 답한다.
// ⚠ PoC 체크: X-API-Key가 앱별 고정 키인지 확인 후 WEBHOOK_API_KEY로 검증.

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { env } from "@/lib/env";
import { json, safeEqual } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { CANCEL_EVENTS, PAID_EVENTS, handleOrderWebhook } from "@/lib/engine/payments";

export async function POST(req: Request) {
  const key = env().WEBHOOK_API_KEY;
  if (key && !safeEqual(req.headers.get("x-api-key") ?? "", key)) return json({ error: "bad_key" }, 401);

  const raw = await req.text();
  let body: { event_no?: number; resource?: { mall_id?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (typeof body.event_no !== "number") return json({ error: "no_event_no" }, 400);

  const ctx = await getCtx();
  const traceId = req.headers.get("x-trace-id") ?? createHash("sha256").update(raw).digest("hex");
  const [ev] = await ctx.db.insert(schema.webhookEvents)
    .values({ traceId, eventNo: body.event_no, mallId: body.resource?.mall_id ?? null, payload: body })
    .onConflictDoNothing().returning();
  if (!ev) return json({ ok: true, duplicate: true });

  if (!PAID_EVENTS.has(body.event_no) && !CANCEL_EVENTS.has(body.event_no)) return json({ ok: true, handled: 0 });
  try {
    const out = await handleOrderWebhook(ctx, body);
    await ctx.db.update(schema.webhookEvents).set({ processedAt: new Date() }).where(eq(schema.webhookEvents.id, ev.id));
    return json({ ok: true, ...out });
  } catch (e) {
    await ctx.db.update(schema.webhookEvents).set({ error: String(e).slice(0, 500) }).where(eq(schema.webhookEvents.id, ev.id));
    console.error("webhook 처리 실패 (야간 대사가 보완)", e);
    return json({ ok: true, handled: 0, deferred: true });
  }
}
