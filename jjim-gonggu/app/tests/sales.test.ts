// 공구 매출 (#79): 리포트 확정 매출과 같은 숫자 · 이익 · 원가 칸 없음(#87) · 추이 칸(한국 시간, 월요일 시작, 빈 칸 0) · 엑셀(CSV) · 다른 몰과 분리.

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { HOUR } from "@/lib/time";
import { getCampaign } from "@/lib/engine/campaigns";
import { reconcileCampaign } from "@/lib/engine/payments";
import { buildReport } from "@/lib/engine/report";
import { tick } from "@/lib/engine/scheduler";
import { TREND_MAX, bucketOf, salesCsv, salesOverview } from "@/lib/engine/sales";
import type { CampaignInput } from "@/lib/core/campaign";
import { csvFile } from "@/lib/http";
import { chip } from "@/app/console/format";
import { MALL, PRODUCT, openAndFill, range, setup } from "./helpers";

const DAY = 24 * HOUR;
const stateName = (s: Parameters<typeof chip>[0], p: boolean) => chip(s, p)[0];

/** 10/12(월) 10:00 KST에 열고 10/17(토) 10:00에 달성 → 결제 기간(72시간) */
async function reached(input: Partial<CampaignInput> = {}) {
  const env = await setup();
  const c = await openAndFill(env, range(1, 40), 1, input);
  expect((await salesOverview(env.ctx, MALL)).campaigns).toEqual([]); // 모집 중 공구는 매출이 없어 표에 없다
  env.clock.advance(5 * DAY);
  await tick(env.ctx);
  return { env, c, cp: (await getCampaign(env.ctx, c.id)).couponNo! };
}

/** 10/17(토) m1 결제 · 10/19(월) m2 결제 + m4 결제 후 취소 · 정가 주문 m3 · 결제 기한 뒤 m5 */
async function withOrders(input: Partial<CampaignInput> = {}) {
  const r = await reached(input);
  const { env, cp } = r;
  await env.world.placeOrder(MALL, "m1", PRODUCT, 1, cp);
  env.clock.advance(2 * DAY);
  await env.world.placeOrder(MALL, "m2", PRODUCT, 1, cp);
  await env.world.placeOrder(MALL, "m3", PRODUCT, 1); // 쿠폰 없는 정가 주문은 공구 매출이 아니다
  const o4 = await env.world.placeOrder(MALL, "m4", PRODUCT, 1, cp);
  await env.world.cancelOrder(MALL, o4.orderId);
  env.clock.advance(DAY + 60_000); // 결제 기한 직후 (쿠폰 여유 시간 안)
  await env.world.placeOrder(MALL, "m5", PRODUCT, 1, cp, { silent: true });
  await reconcileCampaign(env.ctx, r.c.id);
  return r;
}

describe("공구 매출 (#79)", () => {
  it("공구별 확정 매출 · 수량은 리포트와 같고, 취소 · 기한 뒤 결제는 건수만. 이익 · 원가는 내보내지 않는다 (#87)", async () => {
    const { env, c } = await withOrders();
    const rep = await buildReport(env.ctx, c.id);
    const s = await salesOverview(env.ctx, MALL);
    expect(s.campaigns).toHaveLength(1);
    expect(s.campaigns[0]).toMatchObject({
      id: c.id, state: "reached", proceeded: false,
      orders: 2, qty: rep.confirmed.qty, revenue: rep.confirmed.revenue,
      cancelledOrders: 1, lateOrders: 1,
    });
    expect(rep.confirmed.revenue).toBe(78000);
    expect(s.totals).toEqual({ campaigns: 1, orders: 2, qty: 2, revenue: 78000, thisMonth: 78000, lastMonth: 0 });
    expect(JSON.stringify(s)).not.toMatch(/profit|costPrice/);
    expect((await salesOverview(env.ctx, "other-mall")).campaigns).toEqual([]); // 다른 몰 매출은 보이지 않는다
  });

  it("추이: 결제된 날(한국 시간) 기준 일 · 주(월요일 시작) · 월. 빈 칸은 0으로 채우고 지금 칸까지 보여 준다", async () => {
    const { env } = await withOrders();
    const pick = (p: { key: string; label: string; revenue: number }[]) => p.map(({ key, label, revenue }) => [key, label, revenue]);
    expect(pick((await salesOverview(env.ctx, MALL, "day")).trend.points)).toEqual([
      ["2026-10-17", "10/17(토)", 39000], ["2026-10-18", "10/18(일)", 0], ["2026-10-19", "10/19(월)", 39000], ["2026-10-20", "10/20(화)", 0],
    ]);
    expect(pick((await salesOverview(env.ctx, MALL, "week")).trend.points)).toEqual([
      ["2026-10-12", "10/12~10/18", 39000], ["2026-10-19", "10/19~10/25", 39000],
    ]);
    expect(pick((await salesOverview(env.ctx, MALL, "month")).trend.points)).toEqual([["2026-10", "2026년 10월", 78000]]);
    // 오래 지나면 최근 칸만 (전체는 엑셀 날짜별)
    env.clock.advance(120 * DAY);
    const long = await salesOverview(env.ctx, MALL, "day");
    expect(long.trend).toMatchObject({ truncated: true });
    expect(long.trend.points).toHaveLength(TREND_MAX.day);
    expect(long.totals).toMatchObject({ revenue: 78000, thisMonth: 0, lastMonth: 0 });
  });

  it("추이 칸 경계는 한국 시간: 일요일 23:59는 그 주, 월요일 00:00은 다음 주 · 월말 자정 넘기면 다음 달", () => {
    expect(bucketOf(new Date("2026-10-18T14:59:00Z"), "week")).toBe("2026-10-12");
    expect(bucketOf(new Date("2026-10-18T15:00:00Z"), "week")).toBe("2026-10-19");
    expect(bucketOf(new Date("2026-10-18T15:00:00Z"), "day")).toBe("2026-10-19");
    expect(bucketOf(new Date("2026-10-31T15:30:00Z"), "month")).toBe("2026-11");
    expect(bucketOf(new Date("2027-01-03T03:00:00Z"), "week")).toBe("2026-12-28"); // 해를 넘기는 주
  });

  it("엑셀(CSV): 공구별 · 날짜별. 숫자는 단위 없이, 날짜는 엑셀이 읽는 모양, 회원 ID는 없다", async () => {
    const { env } = await withOrders();
    const camp = await salesCsv(env.ctx, MALL, "campaigns", stateName);
    expect(camp.filename).toBe("jjimkkong-linenco-sales-campaigns-20261020.csv");
    const lines = camp.body.trimEnd().split("\r\n");
    expect(lines[0]).toBe("상품번호,상품,상태,공구 연 날,모집 마감,결제 마감,확정 완료,정가(원),공구가(원),목표 수량,결제 주문(건),확정 수량,확정 매출(원),취소 주문(건),기한 뒤 결제(건)");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^102,스톤웨어 디너 접시 4P,달성 · 결제 기간,2026-10-12 10:00,2026-10-17 10:00,2026-10-\d\d \d\d:00,,52000,39000,30,2,2,78000,1,1$/);
    const daily = await salesCsv(env.ctx, MALL, "daily", stateName);
    expect(daily.body.trimEnd().split("\r\n")).toEqual([
      "날짜,상품번호,상품,결제 주문(건),확정 수량,확정 매출(원)",
      "2026-10-17,102,스톤웨어 디너 접시 4P,1,1,39000",
      "2026-10-19,102,스톤웨어 디너 접시 4P,1,1,39000",
    ]);
    expect(camp.body + daily.body).not.toMatch(/\bm\d+\b/);
  });

  it("엑셀(CSV): 수식처럼 보이는 상품명은 글자로 두고, 쉼표는 따옴표로 묶는다", async () => {
    const { env, c } = await withOrders();
    await env.db.update(schema.campaigns).set({ productName: "=1+2, 접시" }).where(eq(schema.campaigns.id, c.id));
    const row = (await salesCsv(env.ctx, MALL, "campaigns", stateName)).body.split("\r\n")[1];
    expect(row.startsWith(`102,"'=1+2, 접시",`)).toBe(true);
    expect(row.endsWith(",78000,1,1")).toBe(true);
  });

  it("내려받기 응답: 엑셀에서 한글이 깨지지 않게 BOM, CSV 형식, 파일 이름", async () => {
    const r = csvFile("jjimkkong-linenco-sales-daily-20261020.csv", "날짜\r\n");
    expect([...new Uint8Array(await r.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="jjimkkong-linenco-sales-daily-20261020.csv"');
    expect(csvFile('a"b\r\n.csv', "").headers.get("content-disposition")).toBe('attachment; filename="ab.csv"');
  });
});
