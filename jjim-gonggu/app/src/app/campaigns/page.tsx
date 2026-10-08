// 판매자 공구 관리: 내 공구 · 새 공구 열기 · 쇼핑몰 설정. 카페24 관리자에서 앱을 실행해 받은 세션으로만 열린다.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import SellerConsole from "./seller-console";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "공구 관리 · 찜꽁" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const s = await getSession();
  if (!s) redirect("/");
  const q = await searchParams;
  return <SellerConsole mallId={s.mallId} initialTab={q.tab} initialOpen={q.open} />;
}
