// 정기 작업. 한 번의 tick: 예약 문자 발송 → 마감 판정 → 결제 기간 종료 확정 → (판정 직후 결과 문자).
// 매시 결제 기간 중인 공구를, 매일 03:00 KST에는 최근 14일 공구를 대사하고 보관 기간이 지난 개인정보를 파기한다.

import type { Ctx } from "./context";
import { releaseDueMessages } from "./messages";
import { judgeDue } from "./judge";
import { reconcilePaying, reconcileRecent, settleDue } from "./payments";
import { purgeExpired } from "./retention";
import { resumeCollections } from "../radar";
import { kstDate, kstHour } from "../time";

// 같은 서버 안에서 tick이 겹치지 않게 한 줄로 세운다 (서버 안 정기 작업 · 데모 시간 넘기기 · 크론이 동시에 부를 수 있다)
const queue = new WeakMap<Ctx, Promise<unknown>>();

export function tick(ctx: Ctx): Promise<Awaited<ReturnType<typeof tickOnce>>> {
  const run = (queue.get(ctx) ?? Promise.resolve()).catch(() => {}).then(() => tickOnce(ctx));
  queue.set(ctx, run);
  return run;
}

async function tickOnce(ctx: Ctx) {
  let sent = await releaseDueMessages(ctx); // 마감 직전까지 예약된 초대를 먼저 보낸다
  const judged = await judgeDue(ctx);
  const settled = await settleDue(ctx);
  sent += await releaseDueMessages(ctx); // 방금 만든 결과 안내
  return { judged, settled, sent };
}

/** tick + 매시 결제 기간 중 공구 대사 + 하루 한 번 03시 전체 대사. 상태는 호출하는 쪽이 들고 있다 (대사는 여러 번 돌아도 결과가 같다) */
export async function runScheduled(ctx: Ctx, state: { lastReconcileDay: string; lastReconcileHour?: string }) {
  const r = await tick(ctx);
  const now = ctx.clock.now();
  const day = kstDate(now);
  const hour = `${day} ${kstHour(now)}`;
  let reconciled = 0;
  if (kstHour(now) === 3 && day !== state.lastReconcileDay) {
    state.lastReconcileDay = day;
    state.lastReconcileHour = hour;
    reconciled = await reconcileRecent(ctx);
    await purgeExpired(ctx);
  } else if (hour !== state.lastReconcileHour) {
    state.lastReconcileHour = hour;
    reconciled = await reconcilePaying(ctx);
  }
  // 시간 제한으로 멈춘 수요 레이더 수집을 이어 간다 (실패해도 다른 정기 작업에는 영향 없음)
  const collections = await resumeCollections(ctx.db, (m) => ctx.shop(m), now.getTime()).catch((e) => { ctx.log("레이더 이어 받기 실패", String(e)); return 0; });
  return { ...r, reconciled, collections };
}
