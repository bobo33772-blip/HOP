// 쿠폰 1,000명 발급 (#26): 실제 Cafe24Api · Cafe24Client 코드를 카페24 쿠폰 API를 흉내 낸 가짜 서버에 붙여 돌린다.
// 가짜 서버는 문서대로 호출 한도(버킷 40칸, 초당 2칸 비움, 넘으면 429) · 발급 1회 최대 100명 · 내역 조회 limit 500 + since_issue_no를 따른다.
// 테스트몰에 회원 1,000명을 만들 수 없어서(회원 생성 API 없음) 규모 확인은 여기서 하고, 실제 발급은 테스트몰 공구로 따로 확인한다.

import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { Cafe24Client } from "@/lib/cafe24/client";
import { Cafe24Api } from "@/lib/cafe24/api";
import { issueCoupons } from "@/lib/engine/judge";
import { MALL, openAndFill, range, setup } from "./helpers";

type Faults = { rejected?: Set<string>; failCall?: Set<number> };

function fakeCafe24(faults: Faults = {}) {
  let t = 0; // 가상 시각(ms)
  let used = 0, leakedAt = 0;
  let nextIssueNo = 1000;
  const issued: { issue_no: number; member_id: string }[] = [];
  const stats = { calls: 0, issueCalls: 0, listCalls: 0, throttled: 0 };
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(body === null ? "" : JSON.stringify(body), { status, headers: { "X-Api-Call-Limit": `${used}/40`, ...headers } });

  const fetchImpl = (async (u: URL, init: RequestInit) => {
    t += 150; // 왕복 시간
    used = Math.max(0, used - Math.floor((t - leakedAt) / 500)); // 초당 2칸 비움
    leakedAt = t - ((t - leakedAt) % 500);
    stats.calls++;
    if (used >= 40) { stats.throttled++; return reply(429, { error: "too many" }, { "Retry-After": "1" }); }
    used++;
    const m = u.pathname.match(/\/coupons\/([^/]+)\/issues$/);
    if (!m) return reply(404, { error: "not found" });
    if (init.method === "POST") {
      const n = ++stats.issueCalls;
      if (faults.failCall?.has(n)) return reply(500, { error: "temporary" }); // 처리되지 않은 서버 오류
      const ids = (JSON.parse(String(init.body)).request.member_id as string[]);
      if (ids.length > 100) return reply(422, { error: "member_id max 100" });
      if (ids.some((id) => faults.rejected?.has(id))) return reply(422, { error: "invalid member" }); // 묶음 전체 거절
      for (const id of ids) if (!issued.some((x) => x.member_id === id)) issued.push({ issue_no: nextIssueNo++, member_id: id });
      return reply(201, { issues: { count: ids.length } });
    }
    stats.listCalls++;
    const limit = Number(u.searchParams.get("limit") ?? 100);
    if (limit > 500) return reply(422, { error: "limit max 500" });
    const since = Number(u.searchParams.get("since_issue_no") ?? 0);
    return reply(200, { issues: issued.filter((x) => x.issue_no > since).slice(0, limit) });
  }) as unknown as typeof fetch;

  const sleep = async (ms: number) => { t += ms; };
  const api = new Cafe24Api(new Cafe24Client(MALL, { get: async () => "token" }, fetchImpl, sleep));
  return { api, issued, stats, elapsedSec: () => Math.round(t / 1000) };
}

async function prepare(n: number) {
  const env = await setup({ members: n + 10 });
  const members = range(1, n);
  const c = await openAndFill(env, members, 1, { targetQty: n });
  return { env, c, members };
}

const issuedCount = (env: Awaited<ReturnType<typeof setup>>, id: string) =>
  env.db.select().from(schema.pledges).where(and(eq(schema.pledges.campaignId, id), eq(schema.pledges.state, "coupon_issued"))).then((r) => r.length);

describe("쿠폰 1,000명 발급 (#26)", () => {
  it("1,000명 모두 발급되고 누락 이슈가 없다 · 호출 한도 안에서 끝난다", async () => {
    const { env, c, members } = await prepare(1000);
    const fake = fakeCafe24();
    await issueCoupons({ ...env.ctx, shop: async () => fake.api }, c, members);
    expect(new Set(fake.issued.map((x) => x.member_id)).size).toBe(1000);
    expect(await issuedCount(env, c.id)).toBe(1000);
    expect(await env.db.select().from(schema.issues).where(eq(schema.issues.kind, "coupon_missing"))).toHaveLength(0);
    // 발급 10번 + 내역 조회 2번(발급 전 · 후, 각 1페이지와 500건 넘으면 다음 페이지)
    expect(fake.stats.issueCalls).toBe(10);
    expect(fake.stats.calls).toBeLessThan(30); // 10분 3,000회 한도에 한참 못 미친다
    console.log("[#26] 1,000명:", { ...fake.stats, 걸린시간_초: fake.elapsedSec() });
  }, 120_000);

  it("거절되는 회원 1명과 일시 오류 묶음이 있어도 나머지는 모두 받고, 빠진 회원만 이슈로 남는다", async () => {
    const { env, c, members } = await prepare(1000);
    const fake = fakeCafe24({ rejected: new Set(["m777"]), failCall: new Set([3]) });
    await issueCoupons({ ...env.ctx, shop: async () => fake.api }, c, members);
    expect(new Set(fake.issued.map((x) => x.member_id)).size).toBe(999);
    expect(await issuedCount(env, c.id)).toBe(999);
    const [issue] = await env.db.select().from(schema.issues).where(eq(schema.issues.kind, "coupon_missing"));
    expect(issue.detail).toEqual({ count: 1, members: ["m777"] });
    console.log("[#26] 거절 1명 + 일시 오류:", { ...fake.stats, 걸린시간_초: fake.elapsedSec() });
  }, 120_000);
});
