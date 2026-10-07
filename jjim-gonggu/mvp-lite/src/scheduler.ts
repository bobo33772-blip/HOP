import type { Ctx } from './context.ts';
import { releaseDueMessages } from './services/messages.ts';
import { judgeDue } from './services/judge.ts';
import { reconcileRecent, settleDue } from './services/payments.ts';

/** 한 번의 정기 작업: 예약 문자 발송 → 마감 판정 → 결제 기간 종료 확정 → (판정 직후 결과 문자) */
export async function tick(ctx: Ctx) {
  let sent = await releaseDueMessages(ctx);     // 마감 직전까지 예약된 초대를 먼저 보낸다
  const judged = await judgeDue(ctx);
  const settled = await settleDue(ctx);
  sent += await releaseDueMessages(ctx);        // 방금 만든 결과 안내
  return { judged, settled, sent };
}

/** 30초마다 tick, 매일 03:00(KST)에 최근 14일 공구 야간 대사 */
export function startScheduler(ctx: Ctx, everyMs = 30_000) {
  let running = false;
  let lastReconcileDay = '';
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick(ctx);
      const kst = new Date(ctx.clock.now().getTime() + 9 * 3600 * 1000);
      const day = kst.toISOString().slice(0, 10);
      if (kst.getUTCHours() === 3 && day !== lastReconcileDay) { lastReconcileDay = day; await reconcileRecent(ctx); }
    } catch (e) { ctx.log('스케줄러 오류', String(e)); }
    finally { running = false; }
  }, everyMs);
  return () => clearInterval(timer);
}
