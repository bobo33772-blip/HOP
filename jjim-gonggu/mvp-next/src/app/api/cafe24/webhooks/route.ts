// 카페24 웹훅 수신. 받으면 바로 저장(trace id로 중복 제거)하고 200을 돌려준다. 처리는 워커가 한다.
// 쓰는 이벤트: 90023/90025 주문·결제, 90026/90029 취소·환불, 90084 장바구니, 90143 로그인, 90147 회원 탈퇴, 90077 앱 삭제, 90157 앱 결제.
// 공식 형식(2026-10-07 확인): 헤더 X-API-Key, X-Trace-ID / 본문 { event_no, resource: { mall_id, ... } }
// 웹훅은 누락될 수 있어 웹훅 로그 조회 API로 주기적 보완 필요(6단계 대사). 실패가 쌓이면 카페24가 자동 미수신 처리한다.
// ⚠ PoC 체크: X-API-Key가 앱별 고정 키인지 확인 후 검증 추가.

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getDb, schema } from "@/db";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: { event_no?: number; resource?: { mall_id?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (typeof body.event_no !== "number") return NextResponse.json({ error: "no_event_no" }, { status: 400 });

  const traceId = req.headers.get("x-trace-id") ?? createHash("sha256").update(raw).digest("hex");
  const db = await getDb();
  await db
    .insert(schema.webhookEvents)
    .values({ traceId, eventNo: body.event_no, mallId: body.resource?.mall_id ?? null, payload: body })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
