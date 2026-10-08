// POST /api/cron/tick — 외부 크론용 정기 작업 (Authorization: Bearer CRON_SECRET). 1분마다 부르면 된다.
// 서버를 여러 대 띄우면 SCHEDULER=off로 서버 안 작업을 끄고 이 주소만 쓴다. CRON_SECRET이 비어 있으면 꺼져 있다.

import { env } from "@/lib/env";
import { json, safeEqual } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { runScheduled } from "@/lib/engine/scheduler";

const state = { lastReconcileDay: "" };

export async function POST(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return json({ error: "disabled" }, 404);
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return json({ error: "unauthorized" }, 401);
  const r = await runScheduled(await getCtx(), state);
  return json({ ok: true, judged: r.judged.length, settled: r.settled.length, sent: r.sent, reconciled: r.reconciled });
}
