// 매일 03:00 정기 작업: 실제 카페24일 때 토큰 미리 갱신(놓친 앱 삭제 확정 포함)을 하루 한 번 부른다 (카페24 심사 점검 M4 · M5).

import { describe, expect, it } from "vitest";
import { HOUR } from "@/lib/time";
import { runScheduled } from "@/lib/engine/scheduler";
import { setup } from "./helpers";

describe("매일 03:00 정기 작업", () => {
  it("토큰 미리 갱신을 03시에 하루 한 번만 부르고, 없으면(데모) 건너뛴다", async () => {
    const env = await setup(); // 시계: 10:00 KST
    let calls = 0;
    const ctx = { ...env.ctx, keepTokensFresh: async () => { calls++; return { refreshed: 1, uninstalled: 0 }; } };
    const state = { lastReconcileDay: "" };
    await runScheduled(ctx, state);
    expect(calls).toBe(0);
    env.clock.advance(17 * HOUR); // 다음 날 03:00 KST
    await runScheduled(ctx, state);
    await runScheduled(ctx, state); // 같은 날 두 번째
    expect(calls).toBe(1);
    await expect(runScheduled(env.ctx, { lastReconcileDay: "" })).resolves.toBeDefined(); // keepTokensFresh 없는 데모 컨텍스트
  });

  it("토큰 미리 갱신이 실패해도 다른 정기 작업은 끝까지 돈다", async () => {
    const env = await setup();
    env.clock.advance(17 * HOUR);
    const ctx = { ...env.ctx, keepTokensFresh: async () => { throw new Error("카페24 장애 (모의)"); } };
    await expect(runScheduled(ctx, { lastReconcileDay: "" })).resolves.toMatchObject({ reconciled: expect.any(Number) });
  });
});
