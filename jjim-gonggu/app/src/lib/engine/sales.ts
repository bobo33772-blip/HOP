// 공구 매출 (#79): 판매자가 공구로 번 돈을 공구별 · 기간별로 본다. 엑셀(CSV)로도 내려받는다.
// 숫자는 리포트의 확정 매출(report.ts)과 같은 기준: 결제 기간 안에 공구 쿠폰으로 결제된 금액(order_links.status = paid).
// 신청 수량을 넘긴 추가 구매분 · 취소 · 반품은 결제 집계(payments.ts)에서 이미 빠지고, 결제 기간 뒤 결제(late)는 건수만 따로 센다.
// 매출만 보여 준다. 이익(원가) 칸은 원가를 적기 번거로워 두지 않는다 (#87). 고객 개인정보(회원 ID)는 내보내지 않는다.

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { CampaignState } from "../core/campaign";
import { DAY, HOUR, kstDate } from "../time";
import type { Ctx } from "./context";

export type SalesBy = "day" | "week" | "month";
export type SalesCsvKind = "campaigns" | "daily";

/** 추이 칸 수 상한. 넘으면 최근 것만 보여 주고(truncated), 전체는 엑셀 날짜별로 본다 */
export const TREND_MAX: Record<SalesBy, number> = { day: 92, week: 104, month: 120 };

export const salesBy = (v: string | null): SalesBy => (v === "day" || v === "month" ? v : "week");
export const salesCsvKind = (v: string | null): SalesCsvKind => (v === "daily" ? "daily" : "campaigns");

type Order = { campaignId: string; qty: number; amount: number; status: string; paidAt: Date };
type Sum = { orders: number; qty: number; revenue: number };

const zero = (): Sum => ({ orders: 0, qty: 0, revenue: 0 });
const add = (s: Sum, o: Order) => { s.orders++; s.qty += o.qty; s.revenue += o.amount; return s; };

/** 결제 기간이 시작돼 매출이 생기는 공구(달성 · 그래도 진행 · 확정 완료)와 그 주문. 모집 중 · 미달 · 취소는 매출이 없다 */
async function load(ctx: Ctx, mallId: string) {
  const C = schema.campaigns, O = schema.orderLinks;
  const camps = await ctx.db.select().from(C)
    .where(and(eq(C.mallId, mallId), inArray(C.state, ["reached", "settled"]))).orderBy(desc(C.openedAt));
  const orders: Order[] = camps.length
    ? await ctx.db.select({ campaignId: O.campaignId, qty: O.qty, amount: O.amount, status: O.status, paidAt: O.paidAt }).from(O)
      .where(inArray(O.campaignId, camps.map((c) => c.id)))
    : [];
  return { camps, orders };
}

// ---- 추이 칸 (한국 시간) ----

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

/** 결제 시각 → 추이 칸. 일: 2026-10-15, 주: 그 주 월요일 2026-10-12, 월: 2026-10 */
export function bucketOf(at: Date, by: SalesBy): string {
  const day = kstDate(at);
  if (by === "day") return day;
  if (by === "month") return day.slice(0, 7);
  return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
}

const nextBucket = (key: string, by: SalesBy) => (by === "month" ? shiftMonth(key, 1) : addDays(key, by === "week" ? 7 : 1));

function bucketLabel(key: string, by: SalesBy) {
  if (by === "month") return `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`;
  if (by === "week") return `${md(key)}~${md(addDays(key, 6))}`;
  return `${md(key)}(${WD[new Date(`${key}T00:00:00Z`).getUTCDay()]})`;
}

/** 첫 결제가 있는 칸부터 지금 칸까지. 매출이 없는 칸도 0으로 채워 흐름이 끊기지 않게 한다 */
function trend(paid: Order[], by: SalesBy, now: Date) {
  if (!paid.length) return { points: [], truncated: false };
  const sums = new Map<string, Sum>();
  for (const o of paid) {
    const k = bucketOf(o.paidAt, by);
    sums.set(k, add(sums.get(k) ?? zero(), o));
  }
  const keys = [...sums.keys()].sort();
  const last = [keys[keys.length - 1], bucketOf(now, by)].sort()[1];
  const points: ({ key: string; label: string } & Sum)[] = [];
  for (let k = keys[0]; k <= last; k = nextBucket(k, by)) points.push({ key: k, label: bucketLabel(k, by), ...(sums.get(k) ?? zero()) });
  const max = TREND_MAX[by];
  return { points: points.slice(-max), truncated: points.length > max };
}

// ---- 합계 · 공구별 ----

function campaignRows(camps: Awaited<ReturnType<typeof load>>["camps"], orders: Order[]) {
  const byCamp = new Map<string, Order[]>();
  for (const o of orders) {
    const list = byCamp.get(o.campaignId);
    if (list) list.push(o); else byCamp.set(o.campaignId, [o]);
  }
  return camps.map((c) => {
    const os = byCamp.get(c.id) ?? [];
    const paid = os.filter((o) => o.status === "paid").reduce(add, zero());
    return {
      id: c.id, productNo: c.productNo, productName: c.productName, state: c.state as CampaignState, proceeded: c.proceededAt != null,
      openedAt: c.openedAt, deadlineAt: c.deadlineAt, payUntil: c.payUntil, settledAt: c.settledAt,
      listPrice: c.listPrice, dealPrice: c.dealPrice, targetQty: c.targetQty,
      ...paid,
      cancelledOrders: os.filter((o) => o.status === "cancelled").length,
      lateOrders: os.filter((o) => o.status === "late").length,
    };
  });
}

type Head = { members: number; qty: number };

/** 공구별 · 신청 상태별 인원과 수량. 판매자가 궁금한 "결제를 기다리는 사람"과 "모집 중 신청"을 센다 (#92) */
async function pledgeHeads(ctx: Ctx, ids: string[]) {
  const P = schema.pledges;
  const rows = ids.length
    ? await ctx.db.select({ campaignId: P.campaignId, state: P.state, members: count(), qty: sql<number>`coalesce(sum(${P.qty}), 0)` })
      .from(P).where(inArray(P.campaignId, ids)).groupBy(P.campaignId, P.state)
    : [];
  const by = new Map<string, Head>(rows.map((r) => [`${r.campaignId}|${r.state}`, { members: Number(r.members), qty: Number(r.qty) }]));
  return (id: string, ...states: string[]): Head => states.reduce((a, s) => {
    const h = by.get(`${id}|${s}`);
    return { members: a.members + (h?.members ?? 0), qty: a.qty + (h?.qty ?? 0) };
  }, { members: 0, qty: 0 });
}

/** 공구 매출 화면: 합계(전체 · 이번 달 · 지난달) · 결제 대기 · 모집 중 신청 · 추이(일 · 주 · 월) · 공구별 */
export async function salesOverview(ctx: Ctx, mallId: string, by: SalesBy = "week") {
  const now = ctx.clock.now();
  const { camps, orders } = await load(ctx, mallId);
  const C = schema.campaigns;
  const opens = await ctx.db.select().from(C).where(and(eq(C.mallId, mallId), eq(C.state, "open")));
  const heads = await pledgeHeads(ctx, [...camps, ...opens].map((c) => c.id));
  // 공구별: 목표 대비 확정은 targetQty · qty로, 결제는 쿠폰 받은 사람 중 몇 명이 냈는지로 본다.
  // 결제 대기는 결제 기간 중인 공구에서 쿠폰을 받고 아직 안 낸 사람 (확정 뒤에는 기한이 지나 0)
  const campaigns = campaignRows(camps, orders).map((r) => {
    const waiting = r.state === "reached" ? heads(r.id, "coupon_issued") : { members: 0, qty: 0 };
    return {
      ...r,
      couponMembers: heads(r.id, "coupon_issued", "paid", "expired").members,
      paidMembers: heads(r.id, "paid").members,
      waitingMembers: waiting.members, waitingQty: waiting.qty,
    };
  });
  const waitingRows = campaigns.filter((r) => r.waitingMembers > 0);
  const dues = waitingRows.map((r) => r.payUntil).filter((d): d is Date => d != null && d.getTime() > now.getTime()).sort((a, b) => a.getTime() - b.getTime());
  // 모집 중: 지금 신청 수량 × 공구가. 목표를 채우면 그때 결제를 받는다 (모두 결제한다고 칠 때의 최대치)
  const recruitingRows = opens.map((c) => ({ c, h: heads(c.id, "pledged") }));
  const paid = orders.filter((o) => o.status === "paid");
  const thisMonth = bucketOf(now, "month"), lastMonth = shiftMonth(thisMonth, -1);
  const monthRevenue = (k: string) => paid.filter((o) => bucketOf(o.paidAt, "month") === k).reduce(add, zero()).revenue;
  const all = paid.reduce(add, zero());
  return {
    by,
    totals: {
      campaigns: campaigns.length, ...all,
      thisMonth: monthRevenue(thisMonth), lastMonth: monthRevenue(lastMonth),
    },
    waiting: {
      campaigns: waitingRows.length,
      members: waitingRows.reduce((a, r) => a + r.waitingMembers, 0),
      qty: waitingRows.reduce((a, r) => a + r.waitingQty, 0),
      amount: waitingRows.reduce((a, r) => a + r.waitingQty * r.dealPrice, 0),
      payUntil: dues[0] ?? null, // 가장 가까운 결제 마감
    },
    recruiting: {
      campaigns: recruitingRows.length,
      qty: recruitingRows.reduce((a, x) => a + x.h.qty, 0),
      amount: recruitingRows.reduce((a, x) => a + x.h.qty * x.c.dealPrice, 0),
      reachedTarget: recruitingRows.filter((x) => x.h.qty >= x.c.targetQty).length,
    },
    trend: trend(paid, by, now),
    campaigns,
  };
}

export type SalesOverview = Awaited<ReturnType<typeof salesOverview>>;

// ---- 엑셀(CSV) ----

type Cell = string | number | null | undefined;

/** 숫자는 단위 없이 그대로(엑셀에서 바로 더할 수 있게). 글자가 =, +, -, @로 시작하면 수식으로 읽히지 않게 ' 를 붙인다 */
function cell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows: Cell[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
/** 엑셀이 날짜로 읽는 모양 (한국 시간): 2026-10-17 14:00 */
const stamp = (d: Date | null) => (d ? new Date(d.getTime() + 9 * HOUR).toISOString().slice(0, 16).replace("T", " ") : null);

/** 엑셀 파일 내용. 공구별: 공구 한 줄씩 / 날짜별: 결제된 날 × 공구 한 줄씩(엑셀 피벗으로 원하는 단위의 추이를 본다).
 *  상태 이름은 화면과 같은 이름표를 쓰도록 부르는 쪽에서 넘긴다 (console/format.ts의 chip) */
export async function salesCsv(ctx: Ctx, mallId: string, kind: SalesCsvKind, stateName: (state: CampaignState, proceeded: boolean) => string) {
  const { camps, orders } = await load(ctx, mallId);
  const filename = `jjimkkong-${mallId.replace(/[^A-Za-z0-9_-]/g, "")}-sales-${kind}-${kstDate(ctx.clock.now()).replace(/-/g, "")}.csv`;
  if (kind === "campaigns") {
    const rows = campaignRows(camps, orders).map((r) => [
      r.productNo, r.productName, stateName(r.state, r.proceeded), stamp(r.openedAt), stamp(r.deadlineAt), stamp(r.payUntil), stamp(r.settledAt),
      r.listPrice, r.dealPrice, r.targetQty, r.orders, r.qty, r.revenue, r.cancelledOrders, r.lateOrders,
    ]);
    return { filename, body: toCsv([[
      "상품번호", "상품", "상태", "공구 연 날", "모집 마감", "결제 마감", "확정 완료", "정가(원)", "공구가(원)", "목표 수량",
      "결제 주문(건)", "확정 수량", "확정 매출(원)", "취소 주문(건)", "기한 뒤 결제(건)",
    ], ...rows]) };
  }
  const byId = new Map(camps.map((c) => [c.id, c]));
  const days = new Map<string, { day: string; c: (typeof camps)[number]; s: Sum }>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    const day = kstDate(o.paidAt), k = `${day}|${o.campaignId}`;
    const d = days.get(k) ?? { day, c: byId.get(o.campaignId)!, s: zero() };
    days.set(k, { ...d, s: add(d.s, o) });
  }
  const rows = [...days.values()]
    .sort((a, b) => a.day.localeCompare(b.day) || a.c.productName.localeCompare(b.c.productName, "ko"))
    .map(({ day, c, s }) => [day, c.productNo, c.productName, s.orders, s.qty, s.revenue]);
  return { filename, body: toCsv([["날짜", "상품번호", "상품", "결제 주문(건)", "확정 수량", "확정 매출(원)"], ...rows]) };
}
