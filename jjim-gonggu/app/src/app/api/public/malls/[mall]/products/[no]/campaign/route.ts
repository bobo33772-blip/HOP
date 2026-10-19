// GET /api/public/malls/:mall/products/:no/campaign — 위젯: 이 상품의 최근 공구 (공개 정보만)

import { CORS, handle, json, preflight } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { activeCampaignForProduct, publicView } from "@/lib/engine/campaigns";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ mall: string; no: string }> }) => {
  const { mall, no } = await params;
  const ctx = await getCtx();
  const c = Number.isInteger(Number(no)) ? await activeCampaignForProduct(ctx, mall, Number(no)) : null;
  // 공구가 없는 상품이 대부분이라 404를 쓰면 쇼핑몰 화면 콘솔에 오류가 찍힌다. 정상 응답으로 '없음'을 알린다 (심사 기준: 설치한 쇼핑몰에 영향 없음)
  if (!c) return json({ campaign: null }, 200, CORS);
  return json({ campaign: await publicView(ctx, c) }, 200, CORS);
}, CORS);

export const OPTIONS = preflight;
