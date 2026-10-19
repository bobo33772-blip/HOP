// 공구 엔진이 바깥 세상과 만나는 경계. 실제 운영은 getCtx()(server.ts), 테스트·데모는 직접 만들어 주입한다.

import type { Db } from "@/db";
import { schema } from "@/db";
import type { ShopApi } from "../cafe24/api";
import type { Clock } from "../time";

export interface Ctx {
  db: Db;
  shop(mallId: string): Promise<ShopApi>;
  clock: Clock;
  /** 고객이 문자 링크로 들어갈 상품 페이지 주소 */
  productUrl(mallId: string, productNo: number): string;
  log(msg: string, extra?: unknown): void;
  /** 실제 카페24일 때만: 설치된 몰의 토큰을 미리 갱신하고, 거절되면 앱 삭제로 확정한다 (매일 03:00) */
  keepTokensFresh?(): Promise<{ refreshed: number; uninstalled: number }>;
}

/** 사람이 읽을 수 있는 이유와 HTTP 상태를 함께 담은 오류. 라우트가 그대로 응답한다 */
export class UserError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export async function audit(ctx: Ctx, actor: string, action: string, target?: string | null, detail?: unknown, mallId?: string | null) {
  await ctx.db.insert(schema.auditLogs).values({ at: ctx.clock.now(), actor, action, target: target ?? null, detail: detail ?? null, mallId: mallId ?? null });
}

export async function recordIssue(ctx: Ctx, campaignId: string | null, kind: string, detail: unknown) {
  await ctx.db.insert(schema.issues).values({ at: ctx.clock.now(), campaignId, kind, detail: detail ?? {} });
}
