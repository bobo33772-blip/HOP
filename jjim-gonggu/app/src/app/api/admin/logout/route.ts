import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function POST() {
  const res = NextResponse.redirect(new URL("/admin", env().APP_BASE_URL), 303);
  res.cookies.delete("jg_admin");
  return res;
}
