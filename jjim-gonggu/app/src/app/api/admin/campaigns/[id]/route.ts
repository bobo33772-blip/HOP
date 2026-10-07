// GET /api/admin/campaigns/:id — 공구 상세: 리포트 · 문자 · 확인할 일

import { and, asc, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { getCampaign } from "@/lib/engine/campaigns";
import { buildReport } from "@/lib/engine/report";

export const GET = admin(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await getCtx();
  const c = await getCampaign(ctx, (await params).id);
  const M = schema.messages, I = schema.issues;
  const [messages, issues] = await Promise.all([
    ctx.db.select().from(M).where(eq(M.campaignId, c.id)).orderBy(asc(M.sendAfter)),
    ctx.db.select({ id: I.id, at: I.at, kind: I.kind, detail: I.detail }).from(I).where(and(eq(I.campaignId, c.id), eq(I.resolved, false))).orderBy(desc(I.at)),
  ]);
  return json({
    report: await buildReport(ctx, c.id),
    reportToken: c.reportToken,
    messages: messages.map((m) => ({ id: m.id, kind: m.kind, recipients: m.recipients.length, content: m.content, status: m.status, sendAfter: m.sendAfter, sentAt: m.sentAt, error: m.error })),
    issues,
  });
});
