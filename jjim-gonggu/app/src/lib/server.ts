// 서버 전역 엔진 컨텍스트. 실제 모드는 카페24 + 시스템 시계, 데모 모드(CAFE24_MOCK=1)는 모의 쇼핑몰 + 앞으로 돌릴 수 있는 시계.
// Next.js 개발 서버의 핫 리로드에도 살아남도록 globalThis에 둔다.

import { getDb, schema } from "@/db";
import { env } from "./env";
import { realShopApi } from "./malls";
import { DEMO_BRAND, DEMO_MALL, MockCafe24, seedDemoMall } from "./cafe24/mock";
import { offsetClock, systemClock, type ManualClock } from "./time";
import type { Ctx } from "./engine/context";
import { handleOrderWebhook } from "./engine/payments";
import { runScheduled } from "./engine/scheduler";

export interface Demo { world: MockCafe24; clock: ManualClock }

const g = globalThis as unknown as { __jjimCtx?: Promise<Ctx>; __jjimDemo?: Demo; __jjimTimer?: ReturnType<typeof setInterval> };

async function create(): Promise<Ctx> {
  const e = env();
  const db = await getDb();
  if (!e.mock) {
    return {
      db,
      shop: realShopApi,
      clock: systemClock,
      // VERIFY: 독립 도메인을 쓰는 몰은 상품 주소가 다르다. 파일럿 몰별로 확인한다.
      productUrl: (mall, no) => `https://${mall}.cafe24.com/product/detail.html?product_no=${no}`,
      log: (m, x) => console.log(new Date().toISOString(), m, x ?? ""),
    };
  }
  const clock = offsetClock();
  const world = new MockCafe24(clock, e.TOKEN_ENC_KEY || "demo-member-key");
  world.delayMs = e.MOCK_DELAY_MS;
  seedDemoMall(world);
  g.__jjimDemo = { world, clock };
  await db.insert(schema.malls).values({ mallId: DEMO_MALL, brandName: DEMO_BRAND, smsSender: "02-000-0000", optOutNumber: "080-000-0000" }).onConflictDoNothing();
  const ctx: Ctx = {
    db,
    shop: async (mallId) => world.forMall(mallId),
    clock,
    productUrl: (_m, no) => `${e.APP_BASE_URL}/demo/shop/${no}`,
    log: (m, x) => console.log("[demo]", m, x ?? ""),
  };
  // 모의 쇼핑몰에서 결제·취소가 일어나면 실제처럼 웹훅이 들어온다
  world.onWebhook(async (ev) => { await handleOrderWebhook(ctx, ev); });
  return ctx;
}

export function getCtx(): Promise<Ctx> {
  g.__jjimCtx ??= create().catch((err) => {
    g.__jjimCtx = undefined;
    throw err;
  });
  return g.__jjimCtx;
}

/** 데모 모드일 때만 모의 쇼핑몰과 시계를 돌려준다 */
export async function getDemo(): Promise<Demo | null> {
  if (!env().mock) return null;
  await getCtx();
  return g.__jjimDemo ?? null;
}

/** 서버 안 정기 작업 (instrumentation.ts에서 한 번 시작). 겹쳐 돌지 않게 막는다 */
export function startScheduler(everyMs = 30_000) {
  if (g.__jjimTimer) return;
  const state = { lastReconcileDay: "" };
  let running = false;
  g.__jjimTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runScheduled(await getCtx(), state);
    } catch (e) {
      console.error("스케줄러 오류", e);
    } finally {
      running = false;
    }
  }, everyMs);
}
