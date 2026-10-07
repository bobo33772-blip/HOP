// POST /api/v1/demand/collect — 수요 수집 시작. 응답 후 백그라운드로 돈다.
// MVP 임시 방식(after). 5단계에서 큐 워커(BullMQ)로 옮기고 매일 새벽 배치로 갱신한다.

import { NextResponse, after } from "next/server";
import { getDb } from "@/db";
import { requireSeller } from "@/lib/auth";
import { shopApi } from "@/lib/malls";
import { runCollection, startCollection } from "@/lib/radar";

export async function POST() {
  const s = await requireSeller();
  if (s instanceof NextResponse) return s;
  const db = await getDb();
  const { run, started } = await startCollection(db, s.mallId);
  if (started) {
    const api = await shopApi(s.mallId);
    after(() => runCollection(db, api, s.mallId, run.id));
  }
  return NextResponse.json({ run, started }, { status: started ? 202 : 200 });
}
