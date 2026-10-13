import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, schema } from "@/db";
import { MockCafe24, seedDemoMall, DEMO_MALL } from "@/lib/cafe24/mock";
import type { ShopApi } from "@/lib/cafe24/api";
import { systemClock } from "@/lib/time";

const demoApi = (): ShopApi => {
  const w = new MockCafe24(systemClock);
  seedDemoMall(w);
  return w.forMall(DEMO_MALL);
};
import { computeReach, getRadar, latestRun, resumeCollections, runCollection, startCollection } from "@/lib/radar";

describe("수요 레이더", () => {
  it("수집 전에는 비어 있고, 수집 후 합계순으로 정렬, 찜·장바구니 0인 상품은 제외", async () => {
    const db = await createTestDb();
    const api = demoApi();
    expect(await getRadar(db, "m")).toEqual({ run: null, rows: [] });

    const { run, started } = await startCollection(db, "m");
    expect(started).toBe(true);
    await runCollection(db, api, "m", run.id);

    const r = await getRadar(db, "m");
    expect(r.run).toMatchObject({ status: "done", total: 6, done: 6 });
    expect(r.rows.map((x) => x.productNo)).toEqual([101, 102, 103, 104, 106, 105]);
    expect(r.rows[0]).toEqual({ productNo: 101, name: "워싱 린넨 이불 커버 (Q)", price: 129000, soldOut: true, alert: 0, wishlist: 180, cart: 31 });

    const byCart = await getRadar(db, "m", "cart");
    expect(byCart.rows[0].productNo).toBe(102);
    expect(byCart.rows[1].productNo).toBe(101);
  });

  it("알림 신청만 있는 상품은 수집 전에도, 수집 결과에 없어도 상품 정보를 채워 보여 주고, 몰에 없는 상품 번호는 뺀다", async () => {
    const db = await createTestDb();
    const api = demoApi();
    const at = new Date();
    await db.insert(schema.productAlerts).values([
      { mallId: "m", productNo: 103, memberId: "a1", createdAt: at },
      { mallId: "m", productNo: 103, memberId: "a2", createdAt: at },
      { mallId: "m", productNo: 999, memberId: "a3", createdAt: at }, // 몰에 없는 상품
    ]);
    const before = await getRadar(db, "m", "total", 50, api);
    expect(before.run).toBeNull();
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0]).toMatchObject({ productNo: 103, alert: 2, wishlist: 0, cart: 0 });
    expect(before.rows[0].name.length).toBeGreaterThan(0);
    expect(before.rows[0].price).toBeGreaterThan(0);

    const { run } = await startCollection(db, "m");
    await runCollection(db, api, "m", run.id);
    await db.delete(schema.demandSnapshots).where(eq(schema.demandSnapshots.productNo, 103)); // 수집 뒤 추가된 상품처럼
    const after = await getRadar(db, "m", "alert", 50, api);
    expect(after.rows[0]).toMatchObject({ productNo: 103, alert: 2 });
    expect(after.rows.map((r) => r.productNo)).not.toContain(999);
  });

  it("알림 상품을 채울 때 상품 전체 목록을 받지 않고, 수집 중에는 채우지 않는다 (#21)", async () => {
    const db = await createTestDb();
    const base = demoApi();
    const calls = { list: 0, one: 0 };
    const api: ShopApi = { ...base, listProducts: async (o, l) => { calls.list++; return base.listProducts(o, l); }, getProduct: async (n) => { calls.one++; return base.getProduct(n); } };
    const at = new Date();
    await db.insert(schema.productAlerts).values([
      { mallId: "m", productNo: 103, memberId: "a1", createdAt: at },
      { mallId: "m", productNo: 999, memberId: "a2", createdAt: at },
    ]);
    await startCollection(db, "m"); // 첫 수집이 진행 중 (화면은 1.5초마다 다시 부른다)
    for (let i = 0; i < 5; i++) await getRadar(db, "m", "total", 50, api);
    expect(calls).toEqual({ list: 0, one: 0 });

    const run = (await latestRun(db, "m", "running"))!;
    await runCollection(db, base, "m", run.id);
    await db.delete(schema.demandSnapshots).where(eq(schema.demandSnapshots.productNo, 103)); // 수집 뒤 추가된 상품처럼
    const r = await getRadar(db, "m", "alert", 50, api);
    expect(r.rows[0]).toMatchObject({ productNo: 103, alert: 1 });
    expect(calls).toEqual({ list: 0, one: 2 }); // 빠진 상품 둘만 하나씩
  });

  it("시간 제한(서버리스)으로 멈추면 진행 중으로 남고, 정기 작업이 이어서 끝낸다", async () => {
    const db = await createTestDb();
    const api = demoApi();
    const { run } = await startCollection(db, "m");
    await runCollection(db, api, "m", run.id, { budgetMs: 0 }); // 첫 실행이 바로 시간 초과
    expect(await latestRun(db, "m")).toMatchObject({ status: "running", total: 6, done: 0 });

    expect(await resumeCollections(db, async () => api, Date.now())).toBe(0); // 시작 50초 안: 첫 실행이 돌고 있을 수 있어 건드리지 않음
    expect(await resumeCollections(db, async () => api, Date.now() + 60_000)).toBe(1);
    const r = await getRadar(db, "m");
    expect(r.run).toMatchObject({ status: "done", total: 6, done: 6 });
    expect(r.rows).toHaveLength(6);
  });

  it("진행 중인 수집이 있으면 새로 시작하지 않는다", async () => {
    const db = await createTestDb();
    const a = await startCollection(db, "m");
    const b = await startCollection(db, "m");
    expect(b.started).toBe(false);
    expect(b.run.id).toBe(a.run.id);
  });

  it("카페24 오류가 나면 run을 failed로 남기고, 이전 완료 결과는 그대로 보여 준다", async () => {
    const db = await createTestDb();
    const ok = demoApi();
    const first = await startCollection(db, "m");
    await runCollection(db, ok, "m", first.run.id);

    const broken: ShopApi = { ...demoApi(), wishlistCount: async () => { throw new Error("cafe24 500"); } };
    const second = await startCollection(db, "m");
    await runCollection(db, broken, "m", second.run.id);

    expect(await latestRun(db, "m")).toMatchObject({ id: second.run.id, status: "failed" });
    expect((await getRadar(db, "m")).run?.id).toBe(first.run.id);
  });

  it("도달 가능 인원: 찜∪장바구니 중복 제거 후 수신동의자만, 찜 100명 초과면 capped 표시", async () => {
    const api = demoApi();
    const reach = await computeReach(api, 101);
    expect(reach.interested).toBe(131); // 찜 목록 100명(상한) + 장바구니 31명
    expect(reach.reachable).toBeGreaterThan(0);
    expect(reach.reachable).toBeLessThan(reach.interested);
    expect(reach.wishlistCapped).toBe(true);

    const small = await computeReach(api, 104);
    expect(small).toMatchObject({ interested: 36, wishlistCapped: false }); // 찜 31 + 장바구니 6 − 겹침 1
  });
});
