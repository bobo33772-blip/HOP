// 수요 레이더 (F2). 기획서 결정: 레이더는 숫자(count)만 먼저 보여 주고,
// 회원 목록·수신동의 대조(도달 가능 인원)는 공구를 열 상품에서만 계산한다 → 호출량과 개인정보 조회를 줄인다.

import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import { allProducts, type ShopApi } from "./cafe24/api";
import { alertCounts } from "./engine/alerts";

const MAX_PRODUCTS = 5_000;

export type RadarSort = "total" | "alert" | "wishlist" | "cart";

export interface RadarRow {
  productNo: number;
  name: string;
  price: number;
  soldOut: boolean;
  alert: number; // 위젯 '공구 열리면 알림 받기' 신청 수 (지금 값, 우리 DB)
  wishlist: number;
  cart: number;
}

export interface RunStatus {
  id: number;
  status: "running" | "done" | "failed";
  total: number;
  done: number;
  startedAt: Date;
  finishedAt: Date | null;
}

const toStatus = (r: typeof schema.collectionRuns.$inferSelect): RunStatus => ({
  id: r.id, status: r.status as RunStatus["status"], total: r.totalProducts, done: r.doneProducts, startedAt: r.startedAt, finishedAt: r.finishedAt,
});

export async function latestRun(db: Db, mallId: string, status?: RunStatus["status"]): Promise<RunStatus | null> {
  const where = status ? and(eq(schema.collectionRuns.mallId, mallId), eq(schema.collectionRuns.status, status)) : eq(schema.collectionRuns.mallId, mallId);
  const [r] = await db.select().from(schema.collectionRuns).where(where).orderBy(desc(schema.collectionRuns.id)).limit(1);
  return r ? toStatus(r) : null;
}

/** 수집 시작. 이미 진행 중이면 그 run을 돌려준다 (중복 수집 방지). */
export async function startCollection(db: Db, mallId: string): Promise<{ run: RunStatus; started: boolean }> {
  const running = await latestRun(db, mallId, "running");
  if (running) return { run: running, started: false };
  const [r] = await db.insert(schema.collectionRuns).values({ mallId }).returning();
  return { run: toStatus(r), started: true };
}

/** 상품 하나에 카페24 호출이 최대 2번이라, 10분 3,000회(초당 5회) 한도를 넘지 않게 상품마다 이만큼 쉰다 (데모는 0) */
const PACE_MS = 450;
/**
 * 한 번 실행에서 수집하는 최대 시간. 서버리스(Vercel) 함수는 실행 시간 제한이 있어 상품이 많으면 한 번에 끝나지 않는다.
 * 시간이 다 되면 멈추고(진행 중 그대로), 1분 정기 작업(resumeCollections)이 이어서 수집한다.
 */
const BUDGET_MS = 40_000;
const realMode = () => process.env.CAFE24_MOCK === "0";

/** 상품 목록을 훑으며 상품별 찜·장바구니 수를 저장한다. 이미 저장한 상품 수(doneProducts)부터 이어서 한다 */
export async function runCollection(db: Db, api: ShopApi, mallId: string, runId: number, opts: { paceMs?: number; budgetMs?: number } = {}): Promise<void> {
  const paceMs = opts.paceMs ?? (realMode() ? PACE_MS : 0);
  const deadline = Date.now() + (opts.budgetMs ?? (realMode() ? BUDGET_MS : Infinity));
  const run = eq(schema.collectionRuns.id, runId);
  try {
    const [r] = await db.select().from(schema.collectionRuns).where(run);
    if (!r || r.status !== "running") return;
    const products = await allProducts(api, MAX_PRODUCTS);
    await db.update(schema.collectionRuns).set({ totalProducts: products.length }).where(run);

    let done = Math.min(r.doneProducts, products.length);
    for (const p of products.slice(done)) {
      if (Date.now() >= deadline) return; // 다음 정기 작업이 이어서 한다
      // 찜 수는 개인정보 권한이 있어야 조회된다 (없으면 0으로 두고 장바구니만 본다)
      const [wishlist, cart] = await Promise.all([api.privacy ? api.wishlistCount(p.productNo) : Promise.resolve(0), api.cartCount(p.productNo)]);
      await db.insert(schema.demandSnapshots).values({
        runId, mallId, productNo: p.productNo, productName: p.name, price: p.price, soldOut: !!p.soldOut, wishlistCount: wishlist, cartCount: cart,
      });
      done++;
      await db.update(schema.collectionRuns).set({ doneProducts: done }).where(run);
      if (paceMs) await new Promise((res) => setTimeout(res, paceMs));
    }
    await db.update(schema.collectionRuns).set({ status: "done", doneProducts: done, finishedAt: new Date() }).where(run);
  } catch (err) {
    await db.update(schema.collectionRuns).set({ status: "failed", error: String(err).slice(0, 500), finishedAt: new Date() }).where(run);
  }
}

/**
 * 정기 작업에서 호출: 시간 제한으로 멈춘 수집을 이어 간다.
 * 시작한 지 50초가 안 된 수집은 처음 실행(최대 40초)이 아직 돌고 있을 수 있어 건드리지 않는다.
 */
export async function resumeCollections(db: Db, shop: (mallId: string) => Promise<ShopApi>, now = Date.now()): Promise<number> {
  const R = schema.collectionRuns;
  const runs = await db.select().from(R).where(and(eq(R.status, "running"), lt(R.startedAt, new Date(now - 50_000))));
  for (const r of runs) await runCollection(db, await shop(r.mallId), r.mallId, r.id);
  return runs.length;
}

/** 마지막으로 끝난 수집 결과에 지금의 알림 신청 수를 더한다. 셋 다 하나도 없는 상품은 뺀다. */
export async function getRadar(db: Db, mallId: string, sort: RadarSort = "total", limit = 50): Promise<{ run: RunStatus | null; rows: RadarRow[] }> {
  const run = await latestRun(db, mallId, "done");
  if (!run) return { run: null, rows: [] };
  const [snaps, alerts] = await Promise.all([db.select().from(schema.demandSnapshots).where(eq(schema.demandSnapshots.runId, run.id)), alertCounts({ db }, mallId)]);
  const key = (r: RadarRow) => (sort === "alert" ? r.alert : sort === "wishlist" ? r.wishlist : sort === "cart" ? r.cart : r.alert + r.wishlist + r.cart);
  // 수집이 이어 받는 사이 같은 상품이 두 번 저장됐을 수 있어 상품별로 마지막 값만 쓴다
  const latest = new Map(snaps.map((s) => [s.productNo, s]));
  const rows = [...latest.values()]
    .map((s) => ({ productNo: s.productNo, name: s.productName, price: s.price, soldOut: s.soldOut, alert: alerts.get(s.productNo) ?? 0, wishlist: s.wishlistCount, cart: s.cartCount }))
    .filter((r) => r.alert + r.wishlist + r.cart > 0)
    .sort((a, b) => key(b) - key(a) || a.productNo - b.productNo)
    .slice(0, limit);
  return { run, rows };
}

export interface Reach {
  productNo: number;
  interested: number; // 알림 신청 ∪ 찜 ∪ 장바구니 회원 (중복 제거)
  reachable: number; // 그중 문자 수신동의
  wishlistCapped: boolean; // 찜 회원 목록이 100명에서 끊겼을 가능성 (PoC P8)
  consentChecked: boolean; // false면 reachable은 최대치 (수신거부 고객은 카페24가 발송 때 뺀다)
}

/** 공구를 열 상품 하나에 대해서만 회원 목록을 모아 수신동의자 수를 센다. 회원 ID는 저장하지 않고 숫자만 돌려준다. */
export async function computeReach(api: ShopApi, productNo: number, alerts: string[] = []): Promise<Reach> {
  const none = Promise.resolve([] as string[]);
  const [wishCount, wish, cart] = await Promise.all([api.privacy ? api.wishlistCount(productNo) : Promise.resolve(0), api.privacy ? api.wishlistMembers(productNo) : none, api.cartMembers(productNo)]);
  const members = [...new Set([...alerts, ...wish, ...cart])];
  const reachable = api.privacy ? (members.length ? await api.consents(members) : []).filter((c) => c.sms).length : members.length;
  return { productNo, interested: members.length, reachable, wishlistCapped: wishCount > wish.length, consentChecked: api.privacy };
}
