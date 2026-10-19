import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";
import { DemoRoleBadge } from "../components/demo-role";
import RadarClient from "./radar-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "모니터링 · 찜꽁" };

export default async function RadarPage() {
  if (!(await getSession())) redirect("/");
  return (
    <>
      <RadarClient />
      {env().mock && <DemoRoleBadge role="seller" />}
    </>
  );
}
