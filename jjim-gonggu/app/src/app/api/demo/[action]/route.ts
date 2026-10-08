// 데모 전용 동작 (CAFE24_MOCK=1일 때만). 실제 문자·결제는 일어나지 않는다.
// POST advance {to: 1|24|deadline|payend, productNo} · simulate-pledges {productNo, n} · simulate-payments {productNo, rate} · checkout {member, productNo}
// GET  state?member=m62

import type { NextRequest } from "next/server";
import { handle, json, readJson } from "@/lib/http";
import { getCtx, getDemo } from "@/lib/server";
import { advance, checkout, isDemoMember, memberState, simulatePayments, simulatePledges } from "@/lib/demo";
import { UserError } from "@/lib/engine/context";

type P = { params: Promise<{ action: string }> };

async function demoOr404() {
  const demo = await getDemo();
  if (!demo) throw new UserError("not_found", "없는 주소예요.", 404);
  return { demo, ctx: await getCtx() };
}

export const POST = handle(async (req: NextRequest, { params }: P) => {
  const { demo, ctx } = await demoOr404();
  const b = await readJson(req);
  const productNo = Number(b.productNo);
  switch ((await params).action) {
    case "advance": return json({ now: await advance(ctx, demo, String(b.to ?? "1"), productNo) });
    case "simulate-pledges": return json({ message: await simulatePledges(ctx, demo, productNo, Number(b.n) || 10) });
    case "simulate-payments": return json({ message: await simulatePayments(ctx, demo, productNo, Number(b.rate) || 0.6) });
    case "checkout": {
      const member = String(b.member ?? "");
      if (!isDemoMember(member)) throw new UserError("bad_member", "회원을 먼저 골라 주세요");
      return json({ message: await checkout(ctx, demo, member, productNo) });
    }
    default: throw new UserError("not_found", "없는 주소예요.", 404);
  }
});

export const GET = handle(async (req: NextRequest, { params }: P) => {
  const { demo } = await demoOr404();
  if ((await params).action !== "state") throw new UserError("not_found", "없는 주소예요.", 404);
  const member = req.nextUrl.searchParams.get("member") ?? "";
  return json(memberState(demo, isDemoMember(member) ? member : ""));
});
