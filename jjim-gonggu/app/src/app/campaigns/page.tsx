// 판매자 공구 관리: 내 공구 · 새 공구 열기 · 쇼핑몰 설정. 카페24 관리자에서 앱을 실행해 받은 세션으로만 열린다.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { requestedScopes } from "@/lib/cafe24/scopes";
import { env } from "@/lib/env";
import { DemoRoleBadge } from "../components/demo-role";
import SellerConsole from "./seller-console";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { getCtx } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "공구 관리 · 찜꽁" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const s = await getSession();
  if (!s) redirect("/");
  const q = await searchParams;
  // 쇼핑몰 설정 › 연결 상태의 '상품 페이지 위젯' (대시보드 시작하기와 같은 기준)
  const ctx = await getCtx();
  const [m] = await ctx.db.select().from(schema.malls).where(eq(schema.malls.mallId, s.mallId));
  const widget = !!m?.scriptTagNo || env().mock;
  return (
    <>
      <SellerConsole widget={widget} mallId={s.mallId} initialTab={q.tab} initialOpen={q.open} scopes={requestedScopes()} />
      {env().mock && <DemoRoleBadge role="seller" />}
    </>
  );
}
