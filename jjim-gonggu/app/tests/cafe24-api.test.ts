// 카페24 OpenAPI 스펙(2026-09-01)과 대조해 고친 호출들. 가짜 fetch로 실제 요청 모양과 응답 해석을 확인한다.

import { describe, expect, it } from "vitest";
import { Cafe24Client } from "@/lib/cafe24/client";
import { Cafe24Api, smsBytes } from "@/lib/cafe24/api";

type Call = { method: string; path: string; query: Record<string, string>; body: unknown };
type Route = (c: Call) => { status?: number; json?: unknown; headers?: Record<string, string> } | undefined;

function fakeShop(route: Route, sleep: (ms: number) => Promise<void> = async () => {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (u: URL, init: RequestInit) => {
    const url = new URL(String(u));
    const c: Call = { method: init.method ?? "GET", path: url.pathname.replace("/api/v2/admin", ""), query: Object.fromEntries(url.searchParams), body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const r = route(c) ?? { status: 404, json: { error: "no route" } };
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  const client = new Cafe24Client("linenco", { get: async () => "t" }, fetchImpl, sleep);
  return { api: new Cafe24Api(client, 1, "", false), client, calls };
}

describe("주문의 공구 쿠폰 확인", () => {
  it("주문 쿠폰 번호는 coupon_code 필드에서 읽는다", async () => {
    const { api } = fakeShop((c) => c.path === "/orders/O1" ? { json: { order: { order_id: "O1", member_id: "m1", paid: "T", canceled: "F", payment_date: "2026-10-12T10:00:00+09:00", items: [{ product_no: 102, quantity: 2, payment_amount: "78000.00" }], coupons: [{ coupon_code: "CP9" }] } } } : undefined);
    const o = await api.getOrder("O1");
    expect(o).toMatchObject({ orderId: "O1", memberId: "m1", couponNos: ["CP9"], status: "paid", items: [{ productNo: 102, qty: 2, amount: 78000 }] });
  });

  it("쿠폰으로 결제된 주문은 /orders 목록 대신 쿠폰 발급 내역(used_coupon=T)의 related_order_id로 찾는다", async () => {
    const { api, calls } = fakeShop((c) => {
      if (c.path === "/coupons/CP9/issues") return { json: { issues: [{ issue_no: 1, member_id: "m1", used_coupon: "T", related_order_id: "O1" }, { issue_no: 2, member_id: "m2", used_coupon: "T", related_order_id: "O2" }] } };
      if (c.path.startsWith("/orders/")) {
        const id = c.path.split("/")[2];
        return { json: { order: { order_id: id, member_id: id === "O1" ? "m1" : "m2", paid: "T", payment_date: "2026-10-12T10:00:00+09:00", items: [], coupons: [{ coupon_code: id === "O1" ? "CP9" : "OTHER" }] } } };
      }
    });
    const orders = await api.listOrdersWithCoupon("CP9", new Date("2026-10-01T00:00:00Z"));
    expect(orders.map((o) => o.orderId)).toEqual(["O1"]); // O2는 다른 쿠폰으로 결제 → 제외
    expect(calls[0].query.used_coupon).toBe("T");
    expect(calls.some((c) => c.path === "/orders")).toBe(false);
  });

  it("발급 내역은 500건씩, 그 다음은 since_issue_no로 이어 받는다 (offset 8000 한도)", async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ issue_no: from + i, member_id: `m${from + i}` }));
    const { api, calls } = fakeShop((c) => c.path === "/coupons/CP1/issues" ? { json: { issues: c.query.since_issue_no ? page(501, 20) : page(1, 500) } } : undefined);
    const holders = await api.listCouponHolders("CP1");
    expect(holders).toHaveLength(520);
    expect(calls.map((c) => c.query.since_issue_no ?? null)).toEqual([null, "500"]);
    expect(calls.every((c) => c.query.offset === undefined)).toBe(true);
  });
});

describe("문자 발송", () => {
  const senders = { json: { senders: [{ sender_no: 7, sender: "010-8567-6386", auth_status: "T" }] } };

  it("sender_no는 등록된 발신번호의 일련번호(정수)로 보내고, 90바이트가 넘으면 LMS", async () => {
    const { api, calls } = fakeShop((c) => c.path === "/sms/senders" ? senders : c.path === "/sms" ? { json: { sms: { queue_code: "Q1" } } } : undefined);
    const r = await api.sendSms({ senderNo: "01085676386", memberIds: ["m1", "m2"], content: "(광고)[찜꽁] 장바구니에 담아 두신 스톤웨어 디너 접시 4P 공동구매가 열렸어요. 30개가 모이면 39,000원(정가 52,000원), 결제는 목표 달성 후에 해요.", isAd: true });
    expect(r.queueRef).toBe("Q1");
    const req = (calls.find((c) => c.path === "/sms")!.body as { request: Record<string, unknown> }).request;
    expect(req.sender_no).toBe(7);
    expect(req.type).toBe("LMS");
    expect(req.exclude_unsubscriber).toBe("T");
  });

  it("카페24에 등록되지 않은 발신번호면 보내지 않고 이유를 알려 준다", async () => {
    const { api, calls } = fakeShop((c) => c.path === "/sms/senders" ? senders : undefined);
    await expect(api.sendSms({ senderNo: "02-000-0000", memberIds: ["m1"], content: "안녕", isAd: false })).rejects.toThrow(/등록돼 있지 않아요/);
    expect(calls.some((c) => c.path === "/sms")).toBe(false);
  });

  it("바이트 계산: 한글 2바이트, 영문·숫자 1바이트", () => {
    expect(smsBytes("가나다abc12")).toBe(11);
    expect(smsBytes("가".repeat(45))).toBe(90);
  });
});

describe("호출기 재시도 정책", () => {
  it("503이면 조회(GET)는 다시 보내지만 문자 발송(POST)은 다시 보내지 않는다 (중복 발송 방지)", async () => {
    let n = 0;
    const { client } = fakeShop((c) => (c.method === "GET" && n++ === 0 ? { status: 503 } : c.method === "GET" ? { json: { count: 3 } } : { status: 503 }));
    expect((await client.request<{ count: number }>("GET", "/products/1/carts/count")).count).toBe(3);
    await expect(client.request("POST", "/sms", { body: {} })).rejects.toThrow(/503/);
  });

  it("X-Api-Call-Limit이 3/4을 넘으면 다음 호출 전에 쉰다", async () => {
    const slept: number[] = [];
    const { client } = fakeShop(() => ({ json: { count: 1 }, headers: { "X-Api-Call-Limit": "36/40" } }), async (ms) => void slept.push(ms));
    await client.request("GET", "/products/1/carts/count");
    expect(slept).toEqual([8000]); // 36칸 → 20칸까지 비우려면 (36-20)/2초
  });
});

describe("찜 회원 조회", () => {
  it("문서에 없는 limit 파라미터를 보내지 않는다", async () => {
    const { api, calls } = fakeShop((c) => c.path === "/products/102/wishlist/customers" ? { json: { customers: [{ member_id: "m1" }] } } : undefined);
    expect(await api.wishlistMembers(102)).toEqual(["m1"]);
    expect(calls[0].query.limit).toBeUndefined();
  });
});
