// 운영자 API(/api/admin/…)와 판매자 API(/api/seller/…)가 같이 쓰는 동작. 누가 어느 몰을 다룰 수 있는지는 라우트가 정한다.

import { after } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { schema } from "@/db";
import type { Ctx } from "./engine/context";
import { audit, UserError } from "./engine/context";
import { isValidOptOutNumber } from "./core/messaging";
import { getCampaign, getMall, type Campaign } from "./engine/campaigns";
import { buildReport } from "./engine/report";
import { getRadar, latestRun, runCollection, startCollection } from "./radar";

export async function mallProfile(ctx: Ctx, mallId: string) {
  const m = await getMall(ctx, mallId);
  return { mallId: m.mallId, brandName: m.brandName, optOutNumber: m.optOutNumber, smsSender: m.smsSender };
}

/** 브랜드명 · 문자 발신번호 · 무료수신거부 번호 (광고 문자 필수 정보) */
export async function saveMallProfile(ctx: Ctx, actor: string, mallId: string, b: Record<string, unknown>) {
  await getMall(ctx, mallId);
  const brandName = String(b.brandName ?? "").trim().slice(0, 40);
  const optOutNumber = String(b.optOutNumber ?? "").trim().slice(0, 20);
  const smsSender = String(b.smsSender ?? "").trim().slice(0, 20);
  if (!brandName || !isValidOptOutNumber(optOutNumber) || !/^[0-9-]{8,20}$/.test(smsSender)) {
    throw new UserError("bad_profile", "브랜드명, 문자 발신번호, 무료수신거부 번호를 확인해 주세요.");
  }
  await ctx.db.update(schema.malls).set({ brandName, optOutNumber, smsSender }).where(eq(schema.malls.mallId, mallId));
  await audit(ctx, actor, "mall.profile", mallId, { brandName, optOutNumber, smsSender }, mallId);
}

/** 찜 많은 상위 20개 상품 (마지막 완료 수집) + 진행 중 수집 상태 */
export async function radarState(ctx: Ctx, mallId: string) {
  await getMall(ctx, mallId);
  const [radar, current] = await Promise.all([getRadar(ctx.db, mallId, "total", 20), latestRun(ctx.db, mallId)]);
  return { ...radar, current };
}

/** 수집 시작 (응답 뒤 백그라운드). 이미 진행 중이면 그 수집을 돌려준다 */
export async function startRadar(ctx: Ctx, mallId: string) {
  await getMall(ctx, mallId);
  const { run, started } = await startCollection(ctx.db, mallId);
  if (started) {
    const api = await ctx.shop(mallId);
    after(() => runCollection(ctx.db, api, mallId, run.id));
  }
  return { run, started };
}

/** 공구 상세: 리포트 · 문자 · 확인할 일. mallId를 주면 그 몰의 공구만 (판매자용) */
export async function campaignDetail(ctx: Ctx, id: string, mallId?: string) {
  const c = await ownedCampaign(ctx, id, mallId);
  const M = schema.messages, I = schema.issues;
  const [messages, issues] = await Promise.all([
    ctx.db.select().from(M).where(eq(M.campaignId, c.id)).orderBy(asc(M.sendAfter)),
    ctx.db.select({ id: I.id, at: I.at, kind: I.kind, detail: I.detail }).from(I).where(and(eq(I.campaignId, c.id), eq(I.resolved, false))).orderBy(desc(I.at)),
  ]);
  return {
    report: await buildReport(ctx, c.id),
    reportToken: c.reportToken,
    messages: messages.map((m) => ({ id: m.id, kind: m.kind, recipients: m.recipients.length, content: m.content, status: m.status, sendAfter: m.sendAfter, sentAt: m.sentAt, error: m.error })),
    issues: mallId ? [] : issues, // 판매자에게는 내부 확인 목록을 보여 주지 않는다
  };
}

/** 공구를 찾고, mallId가 있으면 그 몰의 공구인지 확인한다 (다른 몰 공구는 없는 것처럼 404) */
export async function ownedCampaign(ctx: Ctx, id: string, mallId?: string): Promise<Campaign> {
  const c = await getCampaign(ctx, id);
  if (mallId && c.mallId !== mallId) throw new UserError("campaign_not_found", "공구를 찾을 수 없어요.", 404);
  return c;
}
