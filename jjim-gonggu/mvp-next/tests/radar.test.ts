import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db";
import { MockCafe24Api } from "@/lib/cafe24/mock";
import { computeReach, getRadar, latestRun, runCollection, startCollection } from "@/lib/radar";

describe("수요 레이더", () => {
  it("수집 전에는 비어 있고, 수집 후 합계순으로 정렬, 찜·장바구니 0인 상품은 제외", async () => {
    const db = await createTestDb();
    const api = new MockCafe24Api();
    expect(await getRadar(db, "m")).toEqual({ run: null, rows: [] });

    const { run, started } = await startCollection(db, "m");
    expect(started).toBe(true);
    await runCollection(db, api, "m", run.id);

    const r = await getRadar(db, "m");
    expect(r.run).toMatchObject({ status: "done", total: 8, done: 8 });
    expect(r.rows.map((x) => x.productNo)).toEqual([101, 106, 102, 103, 104, 107, 105]);
    expect(r.rows[0]).toEqual({ productNo: 101, name: "데일리 숄더백 (블랙)", price: 59000, wishlist: 320, cart: 48 });

    const byCart = await getRadar(db, "m", "cart");
    expect(byCart.rows[0].productNo).toBe(101);
    expect(byCart.rows[1].productNo).toBe(106);
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
    const ok = new MockCafe24Api();
    const first = await startCollection(db, "m");
    await runCollection(db, ok, "m", first.run.id);

    class Broken extends MockCafe24Api { override async wishlistCount(): Promise<number> { throw new Error("cafe24 500"); } }
    const broken = new Broken();
    const second = await startCollection(db, "m");
    await runCollection(db, broken, "m", second.run.id);

    expect(await latestRun(db, "m")).toMatchObject({ id: second.run.id, status: "failed" });
    expect((await getRadar(db, "m")).run?.id).toBe(first.run.id);
  });

  it("도달 가능 인원: 찜∪장바구니 중복 제거 후 수신동의자만, 찜 100명 초과면 capped 표시", async () => {
    const api = new MockCafe24Api();
    const reach = await computeReach(api, 101);
    expect(reach.interested).toBe(148); // 찜 목록 100명(상한) + 장바구니 48명
    expect(reach.reachable).toBeGreaterThan(0);
    expect(reach.reachable).toBeLessThan(reach.interested);
    expect(reach.wishlistCapped).toBe(true);

    const small = await computeReach(api, 104);
    expect(small).toMatchObject({ interested: 25, wishlistCapped: false });
  });
});
