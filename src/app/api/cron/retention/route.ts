import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { runRetention } from "@/lib/services/privacy";

/** Daily: deletes what has served its purpose (see RETENTION in lib/services/privacy.ts). */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return NextResponse.json(await runRetention(db));
}
