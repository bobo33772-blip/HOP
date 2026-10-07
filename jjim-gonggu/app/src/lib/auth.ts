import { NextResponse } from "next/server";
import { getSession, type Session } from "./session";

/** 판매자 API용: 세션이 없으면 401 응답을 돌려준다. */
export async function requireSeller(): Promise<Session | NextResponse> {
  const s = await getSession();
  return s ?? NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
