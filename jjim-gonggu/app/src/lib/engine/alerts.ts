// '공구 열리면 알림 받기' (카페24 찜 API 대체). 사업자등록 없이는 찜 회원 조회(mall.read_privacy)를 받을 수 없어,
// 상품 페이지 위젯에서 고객이 직접 신청하게 한다. 로그인 회원(암호화 회원 ID 서버 검증)만, 회원 ID만 저장한다.
// 품절 상품만 받는다 (#67): 재고가 있는 상품에서 받으면 지금 살 고객에게 할인을 기다리라고 권하게 된다.

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

/** 품절 여부를 상품마다 이만큼 저장해 두고 쓴다 (위젯이 열릴 때마다 카페24를 부르지 않게) */
const SOLD_OUT_TTL_MS = 10 * 60_000;
const soldOutCache = new WeakMap<Ctx, Map<string, { soldOut: boolean; at: number }>>();

/** 카페24 상품 조회로 본 품절 여부. 조회에 실패하면 품절이 아닌 것으로 본다(알림 버튼을 숨기는 쪽, 실패는 저장하지 않는다) */
export async function isSoldOut(ctx: Ctx, mallId: string, productNo: number): Promise<boolean> {
  let cache = soldOutCache.get(ctx);
  if (!cache) soldOutCache.set(ctx, (cache = new Map()));
  const key = `${mallId}:${productNo}`, now = ctx.clock.now().getTime(), hit = cache.get(key);
  if (hit && now - hit.at < SOLD_OUT_TTL_MS) return hit.soldOut;
  try {
    const soldOut = !!(await (await ctx.shop(mallId)).getProduct(productNo))?.soldOut;
    cache.set(key, { soldOut, at: now });
    return soldOut;
  } catch (e) {
    ctx.log("품절 여부 조회 실패", { mallId, productNo, error: String(e) });
    return false;
  }
}

/** 위젯용: 기다리는 회원 수와 품절 여부. 알림 버튼은 품절 상품에만 보인다 (#67) */
export async function publicAlertView(ctx: Ctx, mallId: string, no: unknown) {
  const productNo = productNoOf(no);
  return { productNo, waiting: await waitingCount(ctx, mallId, productNo), soldOut: await isSoldOut(ctx, mallId, productNo) };
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
  // 몰에 없는 상품 번호는 받지 않는다 (남은 신청 때문에 레이더가 그 상품을 계속 조회하지 않게, #21). 로그인 확인 뒤에만 카페24를 부른다
  const product = await (await ctx.shop(mallId)).getProduct(productNo);
  if (!product) throw new UserError("product_not_found", "상품을 찾을 수 없어요.", 404);
  // 재고가 있는 상품은 받지 않는다: 지금 정가로 살 수 있는 고객에게 할인을 기다리라고 권하게 된다 (#67)
  if (!product.soldOut) throw new UserError("not_sold_out", "품절된 상품만 공구 알림을 신청할 수 있어요.", 409);
  const inserted = await ctx.db.insert(A).values({ mallId, productNo, memberId, createdAt: ctx.clock.now() }).onConflictDoNothing().returning();
  if (inserted.length) await audit(ctx, `customer:${memberId}`, "alert.request", String(productNo), null, mallId);
  return { alert: await mine(ctx, mallId, productNo, memberId), waiting: await waitingCount(ctx, mallId, productNo) };
}

export async function cancelAlert(ctx: Ctx, mallId: string, no: unknown, body: { member_token?: unknown }) {
  await getMall(ctx, mallId); // 연결된 몰만 (앱을 삭제한 몰의 위젯이 불러도 404로 끝낸다)
  const productNo = productNoOf(no);
  const memberId = await memberOf(ctx, mallId, body.member_token);
  await ctx.db.delete(A).where(and(of(mallId, productNo), eq(A.memberId, memberId)));
  return { alert: null, waiting: await waitingCount(ctx, mallId, productNo) };
}

export async function myAlert(ctx: Ctx, mallId: string, no: unknown, body: { member_token?: unknown }) {
  await getMall(ctx, mallId);
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
