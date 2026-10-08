import { json, seller } from "@/lib/http";
import { getCtx } from "@/lib/server";

export const GET = seller(async () => json({ now: (await getCtx()).clock.now() }));
