// GET  /api/public/malls/:mall/products/:no/alerts — 위젯: 이 상품의 공구를 기다리는 사람 수 (숫자만)
// POST /api/public/malls/:mall/products/:no/alerts — '공구 열리면 알림 받기' 신청 (로그인 회원, 같은 회원은 한 번만)

import { CORS, handle, json, limitPledge, preflight, readJson } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { publicAlertView, requestAlert } from "@/lib/engine/alerts";

type P = { params: Promise<{ mall: string; no: string }> };

export const GET = handle(async (_req: Request, { params }: P) => {
  const { mall, no } = await params;
  return json(await publicAlertView(await getCtx(), mall, no), 200, CORS);
}, CORS);

export const POST = handle(async (req: Request, { params }: P) => {
  limitPledge(req);
  const { mall, no } = await params;
  return json(await requestAlert(await getCtx(), mall, no, await readJson(req)), 200, CORS);
}, CORS);

export const OPTIONS = preflight;
