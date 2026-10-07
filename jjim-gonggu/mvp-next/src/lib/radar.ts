// 수요 레이더 (F2). 기획서 결정: 레이더는 숫자(count)만 먼저 보여 주고,
// 회원 목록·수신동의 대조(도달 가능 인원)는 공구를 열 상품에서만 계산한다 → 호출량과 개인정보 조회를 줄인다.

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import type { ShopApi } from "./cafe24/api";

const PAGE = 100;
const MAX_PRODUCTS = 5_000;

export type RadarSort = "total" | "wishlist" | "cart";

export interface RadarRow {
  productNo: number;
  name: string;
  price: number;
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

/** 상품 목록을 훑으며 상품별 찜·장바구니 수를 저장한다. 워커(또는 MVP에서는 요청 밖 백그라운드)에서 실행. */
export async function runCollection(db: Db, api: ShopApi, mallId: string, runId: number): Promise<void> {
  const run = eq(schema.collectionRuns.id, runId);
  try {
    const products = [];
    for (let offset = 0; offset < MAX_PRODUCTS; offset += PAGE) {
      const page = await api.listProducts(offset, PAGE);
      products.push(...page);
      if (page.length < PAGE) break;
    }
    await db.update(schema.collectionRuns).set({ totalProducts: products.length }).where(run);

    let done = 0;
    for (const p of products) {
      const [wishlist, cart] = await Promise.all([api.wishlistCount(p.productNo), api.cartCount(p.productNo)]);
      await db.insert(schema.demandSnapshots).values({
        runId, mallId, productNo: p.productNo, productName: p.name, price: p.price, wishlistCount: wishlist, cartCount: cart,
      });
      done++;
      await db.update(schema.collectionRuns).set({ doneProducts: done }).where(run);
    }
    await db.update(schema.collectionRuns).set({ status: "done", doneProducts: done, finishedAt: new Date() }).where(run);
  } catch (err) {
    await db.update(schema.collectionRuns).set({ status: "failed", error: String(err).slice(0, 500), finishedAt: new Date() }).where(run);
  }
}

/** 마지막으로 끝난 수집 결과. 찜·장바구니가 하나도 없는 상품은 뺀다. */
export async function getRadar(db: Db, mallId: string, sort: RadarSort = "total", limit = 50): Promise<{ run: RunStatus | null; rows: RadarRow[] }> {
  const run = await latestRun(db, mallId, "done");
  if (!run) return { run: null, rows: [] };
  const snaps = await db.select().from(schema.demandSnapshots).where(eq(schema.demandSnapshots.runId, run.id));
  const key = (r: RadarRow) => (sort === "wishlist" ? r.wishlist : sort === "cart" ? r.cart : r.wishlist + r.cart);
  const rows = snaps
    .map((s) => ({ productNo: s.productNo, name: s.productName, price: s.price, wishlist: s.wishlistCount, cart: s.cartCount }))
    .filter((r) => r.wishlist + r.cart > 0)
    .sort((a, b) => key(b) - key(a) || a.productNo - b.productNo)
    .slice(0, limit);
  return { run, rows };
}

export interface Reach {
  productNo: number;
  interested: number; // 찜 ∪ 장바구니 회원 (중복 제거)
  reachable: number; // 그중 문자 수신동의
  wishlistCapped: boolean; // 찜 회원 목록이 100명에서 끊겼을 가능성 (PoC P8)
}

/** 공구를 열 상품 하나에 대해서만 회원 목록을 모아 수신동의자 수를 센다. 회원 ID는 저장하지 않고 숫자만 돌려준다. */
export async function computeReach(api: ShopApi, productNo: number): Promise<Reach> {
  const [wishCount, wish, cart] = await Promise.all([api.wishlistCount(productNo), api.wishlistMembers(productNo), api.cartMembers(productNo)]);
  const members = [...new Set([...wish, ...cart])];
  const consents = members.length ? await api.consents(members) : [];
  return {
    productNo,
    interested: members.length,
    reachable: consents.filter((c) => c.sms).length,
    wishlistCapped: wishCount > wish.length,
  };
}
