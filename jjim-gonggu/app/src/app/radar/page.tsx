import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import RadarClient from "./radar-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "수요 레이더 · 찜꽁" };

export default async function RadarPage() {
  if (!(await getSession())) redirect("/");
  return <RadarClient />;
}
