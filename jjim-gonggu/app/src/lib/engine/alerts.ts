// '공구 열리면 알림 받기' (카페24 찜 API 대체). 사업자등록 없이는 찜 회원 조회(mall.read_privacy)를 받을 수 없어,
// 상품 페이지 위젯에서 고객이 직접 신청하게 한다. 로그인 회원(암호화 회원 ID 서버 검증)만, 회원 ID만 저장한다.

import { and, count, eq } from "drizzle-orm";
import { schema } from "@/db";
import { audit, UserError, type Ctx } from "./context";
import { getMall } from "./campaigns";
import { memberOf } from "./pledges";

const A = schema.productAlerts;
const of = (mallId: string, productNo: number) => and(eq(A.mallId, mallId), eq(A.productNo, productNo));

function productNoOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UserError("product_not_found", "상품을 찾을 수 없어요.", 404);
  return n;
}

/** 이 상품의 공구를 기다리는 회원 수 (위젯에 공개해도 되는 숫자) */
export async function waitingCount(ctx: Ctx, mallId: string, productNo: number): Promise<number> {
  const [r] = await ctx.db.select({ n: count() }).from(A).where(of(mallId, productNo));
  return Number(r?.n ?? 0);
}

export async function publicAlertView(ctx: Ctx, mallId: string, no: unknown) {
  const productNo = productNoOf(no);
  return { productNo, waiting: await waitingCount(ctx, mallId, productNo) };
}

async function mine(ctx: Ctx, mallId: string, productNo: number, memberId: string) {
  const [r] = await ctx.db.select().from(A).where(and(of(mallId, productNo), eq(A.memberId, memberId)));
  return r ? { createdAt: r.createdAt } : null;
}

/** 알림 신청. 이미 신청했으면 처음 신청을 그대로 돌려준다 */
export async function requestAlert(ctx: Ctx, mallId: string, no: unknown, body: { member_token?: unknown }) {
  await getMall(ctx, mallId);
  const productNo = productNoOf(no);
  const memberId = await memberOf(ctx, mallId, body.member_token);
  const inserted = await ctx.db.insert(A).values({ mallId, productNo, memberId, createdAt: ctx.clock.now() }).onConflictDoNothing().returning();
  if (inserted.length) await audit(ctx, `customer:${memberId}`, "alert.request", String(productNo), null, mallId);
  return { alert: await mine(ctx, mallId, productNo, memberId), waiting: await waitingCount(ctx, mallId, productNo) };
}

export async function cancelAlert(ctx: Ctx, mallId: string, no: unknown, body: { member_token?: unknown }) {
  const productNo = productNoOf(no);
  const memberId = await memberOf(ctx, mallId, body.member_token);
  await ctx.db.delete(A).where(and(of(mallId, productNo), eq(A.memberId, memberId)));
  return { alert: null, waiting: await waitingCount(ctx, mallId, productNo) };
}

export async function myAlert(ctx: Ctx, mallId: string, no: unknown, body: { member_token?: unknown }) {
  const productNo = productNoOf(no);
  const memberId = await memberOf(ctx, mallId, body.member_token);
  return { alert: await mine(ctx, mallId, productNo, memberId), waiting: await waitingCount(ctx, mallId, productNo) };
}

/** 공구 초대 대상으로 쓸 회원 ID (개설 시 한 상품에서만 읽는다) */
export async function alertMembers(ctx: Pick<Ctx, "db">, mallId: string, productNo: number): Promise<string[]> {
  return (await ctx.db.select({ m: A.memberId }).from(A).where(of(mallId, productNo))).map((r) => r.m);
}

/** 수요 레이더용: 상품별 알림 신청 수 */
export async function alertCounts(ctx: Pick<Ctx, "db">, mallId: string): Promise<Map<number, number>> {
  const rows = await ctx.db.select({ p: A.productNo, n: count() }).from(A).where(eq(A.mallId, mallId)).groupBy(A.productNo);
  return new Map(rows.map((r) => [r.p, Number(r.n)]));
}
