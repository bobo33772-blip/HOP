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
import { env } from "./env";
import { digits, type SmsSender } from "./cafe24/api";

/** 카페24에 등록된 문자 발신번호 목록. 조회에 실패하면 null (화면은 직접 입력으로 대신한다) */
async function registeredSenders(ctx: Ctx, mallId: string): Promise<SmsSender[] | null> {
  try { return await (await ctx.shop(mallId)).smsSenders(); } catch (e) { ctx.log("발신번호 목록 조회 실패", String(e)); return null; }
}

export async function mallProfile(ctx: Ctx, mallId: string) {
  const m = await getMall(ctx, mallId);
  const senders = await registeredSenders(ctx, mallId);
  return { mallId: m.mallId, brandName: m.brandName, optOutNumber: m.optOutNumber, smsSender: m.smsSender, senders };
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
  // 카페24는 등록된 발신번호로만 문자를 보낸다 → 목록을 받을 수 있으면 그 안의 번호인지 확인한다
  const senders = await registeredSenders(ctx, mallId);
  if (senders && !senders.some((s) => digits(s.number) === digits(smsSender))) {
    throw new UserError("sender_not_registered", "카페24 관리자 › SMS 발신번호 관리에 등록된 번호만 쓸 수 있어요. 먼저 등록한 뒤 다시 골라 주세요.");
  }
  await ctx.db.update(schema.malls).set({ brandName, optOutNumber, smsSender }).where(eq(schema.malls.mallId, mallId));
  await audit(ctx, actor, "mall.profile", mallId, { brandName, optOutNumber, smsSender }, mallId);
}

/** 찜 많은 상위 20개 상품 (마지막 완료 수집) + 진행 중 수집 상태 */
export async function radarState(ctx: Ctx, mallId: string) {
  await getMall(ctx, mallId);
  const [radar, current, api] = await Promise.all([getRadar(ctx.db, mallId, "total", 20), latestRun(ctx.db, mallId), ctx.shop(mallId)]);
  return { ...radar, current, privacy: api.privacy };
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

/** 상품 페이지 위젯 스크립트 설치(카페24 스크립트태그). 설치 직후 실패했을 때 앱을 다시 설치하지 않고 이것만 다시 한다 */
export async function installWidget(ctx: Ctx, mallId: string) {
  await getMall(ctx, mallId);
  const e = env();
  const api = await ctx.shop(mallId);
  // 위젯은 몰 ID와 앱 Client ID(공개값)로 카페24 Front SDK를 초기화해 암호화 회원 ID를 받는다
  const scriptNo = await api.installScriptTag(`${e.APP_BASE_URL}/widget.js?mall=${encodeURIComponent(mallId)}&client_id=${encodeURIComponent(e.CAFE24_CLIENT_ID)}`);
  await ctx.db.update(schema.malls).set({ scriptTagNo: scriptNo }).where(eq(schema.malls.mallId, mallId));
  return scriptNo;
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
