// 공구 개설 (F3·F4): 미리보기 → 쿠폰 생성 → 초대 대상 저장 → 초대 문자 예약.

import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import { allProducts } from "../cafe24/api";
import { errorMessages, validateCampaignInput, type CampaignInput, type CampaignState } from "../core/campaign";
import { COUNTED_PLEDGE_STATES } from "../core/pledge";
import { formatAdMessage, isValidOptOutNumber, nextAllowedSendTime } from "../core/messaging";
import { HOUR, fmtKst, won } from "../time";
import { audit, recordIssue, UserError, type Ctx } from "./context";

export type Campaign = typeof schema.campaigns.$inferSelect;
export type Mall = typeof schema.malls.$inferSelect;

/** 결제 기간이 끝난 뒤에도 판정 지연에 대비해 쿠폰을 하루 더 열어 둔다 (기한 뒤 결제는 late로 따로 센다) */
const COUPON_GRACE_HOURS = 24;

export async function getMall(ctx: Ctx, mallId: string): Promise<Mall> {
  const [m] = await ctx.db.select().from(schema.malls).where(eq(schema.malls.mallId, mallId));
  if (!m || m.uninstalledAt) throw new UserError("mall_not_found", "연결된 쇼핑몰이 아니에요.", 404);
  return m;
}

export async function getCampaign(ctx: Ctx, id: string): Promise<Campaign> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("campaign_not_found", "공구를 찾을 수 없어요.", 404);
  const [c] = await ctx.db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
  if (!c) throw new UserError("campaign_not_found", "공구를 찾을 수 없어요.", 404);
  return c;
}

/** 진행률에 들어가는 신청 수량 (취소·미달 제외) */
export async function pledgedQty(ctx: Ctx, campaignId: string): Promise<number> {
  const [r] = await ctx.db
    .select({ q: sql<number>`coalesce(sum(${schema.pledges.qty}), 0)` })
    .from(schema.pledges)
    .where(and(eq(schema.pledges.campaignId, campaignId), inArray(schema.pledges.state, COUNTED_PLEDGE_STATES)));
  return Number(r?.q ?? 0);
}

/** consentChecked=false: 개인정보 권한이 없어 수신 동의를 미리 확인하지 못했다. reachable은 최대치이고, 수신거부 고객은 카페24가 발송 때 뺀다 */
export interface Audience { wishlist: number; cart: number; unique: number; reachable: number; consentChecked: boolean; members: { memberId: string; source: string }[] }

/** 찜 ∪ 장바구니 회원에서 중복을 빼고, 문자 수신 동의자만 남긴다. 개인정보 권한이 없으면 장바구니 회원만, 수신 동의는 카페24 발송 단계에 맡긴다 */
export async function buildAudience(ctx: Ctx, mallId: string, productNo: number): Promise<Audience> {
  const api = await ctx.shop(mallId);
  const [w, c] = await Promise.all([api.privacy ? api.wishlistMembers(productNo) : Promise.resolve([] as string[]), api.cartMembers(productNo)]);
  const src = new Map<string, string>();
  for (const id of w) src.set(id, "wishlist");
  for (const id of c) src.set(id, src.has(id) ? "both" : "cart");
  const ids = [...src.keys()];
  const ok = api.privacy ? new Set((ids.length ? await api.consents(ids) : []).filter((x) => x.sms).map((x) => x.memberId)) : new Set(ids);
  const members = ids.filter((id) => ok.has(id)).map((id) => ({ memberId: id, source: src.get(id)! }));
  return { wishlist: w.length, cart: c.length, unique: ids.length, reachable: members.length, consentChecked: api.privacy, members };
}

type InviteFields = Pick<Campaign, "productName" | "targetQty" | "dealPrice" | "listPrice" | "deadlineAt" | "shipEta">;

export function inviteContent(mall: Pick<Mall, "mallId" | "brandName" | "optOutNumber">, c: InviteFields, link: string): string {
  return formatAdMessage({
    mallName: `[${mall.brandName || mall.mallId}]`,
    body: `찜하신 ${c.productName} 공동구매가 열렸어요. ${c.targetQty}개가 모이면 ${won(c.dealPrice)}(정가 ${won(c.listPrice)}). ${fmtKst(c.deadlineAt)} 마감, 결제는 목표 달성 후에 해요. 예상 출고 ${c.shipEta}.\n${link}`,
    optOutNumber: mall.optOutNumber ?? "",
  });
}

async function prepare(ctx: Ctx, mallId: string, input: CampaignInput) {
  const mall = await getMall(ctx, mallId);
  const api = await ctx.shop(mallId);
  const product = (await allProducts(api)).find((p) => p.productNo === Number(input.productNo));
  if (!product) throw new UserError("product_not_found", "상품을 찾을 수 없어요.", 404);
  const issues = validateCampaignInput(input, product.price, ctx.clock.now());
  const aud = await buildAudience(ctx, mallId, product.productNo);
  const draft: InviteFields = { productName: product.name, targetQty: input.targetQty, dealPrice: input.dealPrice, listPrice: product.price, deadlineAt: input.deadlineAt, shipEta: input.shipEta };
  return { mall, product, issues, aud, message: inviteContent(mall, draft, ctx.productUrl(mallId, product.productNo)) };
}

/** 열기 전 미리보기: 초대 인원, 문자 내용, 발송 시각, 개당 마진 */
export async function previewCampaign(ctx: Ctx, mallId: string, input: CampaignInput) {
  const { product, issues, aud, message } = await prepare(ctx, mallId, input);
  return {
    product,
    errors: errorMessages(issues),
    warnings: issues.filter((i) => i.level === "warning").map((i) => i.message),
    message,
    audience: { wishlist: aud.wishlist, cart: aud.cart, unique: aud.unique, reachable: aud.reachable, consentChecked: aud.consentChecked },
    sendAt: nextAllowedSendTime(ctx.clock.now()),
    marginPerUnit: input.costPrice != null ? input.dealPrice - input.costPrice : null,
  };
}

/** 공구 열기: 쿠폰을 먼저 만들고(실패하면 아무것도 저장하지 않음), 초대 대상과 초대 문자를 예약한다 */
export async function openCampaign(ctx: Ctx, actor: string, mallId: string, input: CampaignInput) {
  const pv = await prepare(ctx, mallId, input);
  if (!pv.mall.brandName || !pv.mall.smsSender || !isValidOptOutNumber(pv.mall.optOutNumber)) {
    throw new UserError("profile_required", "브랜드명·문자 발신번호·무료수신거부 번호를 먼저 등록해 주세요. 광고 문자에 반드시 들어가야 해요.");
  }
  const errors = errorMessages(pv.issues);
  if (errors.length) throw new UserError("invalid_input", errors.join(" "));
  if (pv.aud.reachable === 0) throw new UserError("no_audience", pv.aud.consentChecked ? "문자를 받을 수 있는 찜·장바구니 고객이 없어요." : "이 상품을 장바구니에 담은 고객이 없어요.");
  const [dup] = await ctx.db.select({ id: schema.campaigns.id }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.mallId, mallId), eq(schema.campaigns.productNo, pv.product.productNo), inArray(schema.campaigns.state, ["open", "reached"])));
  if (dup) throw new UserError("duplicate", "이 상품은 이미 진행 중인 공구가 있어요.", 409);

  const now = ctx.clock.now();
  const deadline = input.deadlineAt;
  const api = await ctx.shop(mallId);
  const couponNo = await api.createCoupon({
    name: `[찜꽁] ${pv.product.name}`,
    productNo: pv.product.productNo,
    discountAmount: pv.product.price - input.dealPrice,
    availableFrom: deadline,
    availableUntil: new Date(deadline.getTime() + (input.payWindowHours + COUPON_GRACE_HOURS) * HOUR),
  });

  const sendAt = nextAllowedSendTime(now);
  let campaign: Campaign;
  try {
    campaign = await ctx.db.transaction(async (tx) => {
      const [c] = await tx.insert(schema.campaigns).values({
        mallId, productNo: pv.product.productNo, productName: pv.product.name, listPrice: pv.product.price, dealPrice: input.dealPrice,
        costPrice: input.costPrice ?? null, targetQty: input.targetQty, perMemberLimit: input.perMemberLimit, deadlineAt: deadline,
        payWindowHours: input.payWindowHours, shipEta: input.shipEta, state: "open", couponNo,
        reportToken: randomBytes(18).toString("base64url"), openedAt: now,
      }).returning();
      for (let i = 0; i < pv.aud.members.length; i += 500) {
        await tx.insert(schema.invitations).values(pv.aud.members.slice(i, i + 500).map((m) => ({ campaignId: c.id, memberId: m.memberId, source: m.source })));
      }
      await tx.insert(schema.messages).values({ campaignId: c.id, kind: "invite_ad", recipients: pv.aud.members.map((m) => m.memberId), content: pv.message, sendAfter: sendAt });
      await tx.insert(schema.auditLogs).values({ at: now, actor, action: "campaign.open", target: c.id, mallId, detail: { ...input, couponNo, invited: pv.aud.members.length } });
      return c;
    });
  } catch (e) {
    await recordIssue(ctx, null, "orphan_coupon", { mallId, couponNo, error: String(e) });
    throw e;
  }
  return { campaign, invited: pv.aud.members.length, sendAt };
}

export interface PublicCampaign {
  id: string; state: CampaignState; productNo: number; productName: string; listPrice: number; dealPrice: number;
  targetQty: number; pledgedQty: number; perMemberLimit: number; deadlineAt: Date; payUntil: Date | null; shipEta: string;
}

/** 위젯·문자에 보여 줄 공개 정보 (쿠폰 번호·원가·개인정보 없음) */
export async function publicView(ctx: Ctx, c: Campaign): Promise<PublicCampaign> {
  return {
    id: c.id, state: c.state as CampaignState, productNo: c.productNo, productName: c.productName,
    listPrice: c.listPrice, dealPrice: c.dealPrice, targetQty: c.targetQty, pledgedQty: await pledgedQty(ctx, c.id),
    perMemberLimit: c.perMemberLimit, deadlineAt: c.deadlineAt, payUntil: c.payUntil, shipEta: c.shipEta,
  };
}

export async function activeCampaignForProduct(ctx: Ctx, mallId: string, productNo: number): Promise<Campaign | null> {
  const [c] = await ctx.db.select().from(schema.campaigns)
    .where(and(eq(schema.campaigns.mallId, mallId), eq(schema.campaigns.productNo, productNo)))
    .orderBy(desc(schema.campaigns.openedAt)).limit(1);
  return c ?? null;
}

export async function listCampaigns(ctx: Ctx, mallId: string) {
  const rows = await ctx.db.select().from(schema.campaigns).where(eq(schema.campaigns.mallId, mallId)).orderBy(desc(schema.campaigns.openedAt));
  return Promise.all(rows.map((c) => publicView(ctx, c)));
}

/** 원씽 기록: 판매자가 확정 수량을 보고 생산·발주를 결정했다 (운영자가 판매자 확인 후 입력) */
export async function recordProductionDecision(ctx: Ctx, actor: string, campaignId: string, body: { qty?: unknown; note?: unknown }) {
  const c = await getCampaign(ctx, campaignId);
  if (c.state !== "settled") throw new UserError("not_settled", "결제 기간이 끝나 확정된 공구만 기록할 수 있어요.", 409);
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1) throw new UserError("bad_qty", "생산·발주 수량을 입력해 주세요.");
  const note = String(body.note ?? "").slice(0, 300);
  if (!note.trim()) throw new UserError("note_required", "확인 근거를 적어 주세요. 예: 발주서 번호, 가마 일정 날짜");
  const now = ctx.clock.now();
  await ctx.db.update(schema.campaigns).set({ decisionQty: qty, decisionNote: note, decidedAt: now }).where(eq(schema.campaigns.id, c.id));
  await audit(ctx, actor, "campaign.production_decided", c.id, { qty, note }, c.mallId);
  return getCampaign(ctx, c.id);
}

/** API 본문 → CampaignInput (형식만 바꾸고, 규칙 검사는 validateCampaignInput이 한다) */
export function parseCampaignInput(b: Record<string, unknown>): CampaignInput {
  const num = (v: unknown) => (v === "" || v == null ? NaN : Number(v));
  return {
    productNo: num(b.productNo),
    targetQty: num(b.targetQty),
    dealPrice: num(b.dealPrice),
    costPrice: b.costPrice === "" || b.costPrice == null ? null : Number(b.costPrice),
    perMemberLimit: num(b.perMemberLimit),
    deadlineAt: new Date(String(b.deadlineAt ?? "")),
    payWindowHours: num(b.payWindowHours),
    shipEta: String(b.shipEta ?? ""),
    confirmBelowCost: b.confirmBelowCost === true || b.confirmBelowCost === "true",
  };
}
