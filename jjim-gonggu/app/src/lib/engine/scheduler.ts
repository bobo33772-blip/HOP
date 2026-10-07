// 정기 작업. 한 번의 tick: 예약 문자 발송 → 마감 판정 → 결제 기간 종료 확정 → (판정 직후 결과 문자).
// 매일 03:00 KST에는 최근 14일 공구를 야간 대사한다.

import type { Ctx } from "./context";
import { releaseDueMessages } from "./messages";
import { judgeDue } from "./judge";
import { reconcileRecent, settleDue } from "./payments";
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

/** tick + 하루 한 번 03시 대사. lastReconcileDay는 호출하는 쪽이 들고 있다 */
export async function runScheduled(ctx: Ctx, state: { lastReconcileDay: string }) {
  const r = await tick(ctx);
  const now = ctx.clock.now();
  const day = kstDate(now);
  let reconciled = 0;
  if (kstHour(now) === 3 && day !== state.lastReconcileDay) {
    state.lastReconcileDay = day;
    reconciled = await reconcileRecent(ctx);
  }
  return { ...r, reconciled };
}
