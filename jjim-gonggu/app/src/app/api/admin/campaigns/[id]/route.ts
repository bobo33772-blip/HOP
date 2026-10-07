// GET /api/admin/campaigns/:id — 공구 상세: 리포트 · 문자 · 확인할 일

import { admin, json } from "@/lib/http";
import { getCtx } from "@/lib/server";
import { campaignDetail } from "@/lib/console-actions";

export const GET = admin(async (_req, { params }: { params: Promise<{ id: string }> }) => json(await campaignDetail(await getCtx(), (await params).id)));
