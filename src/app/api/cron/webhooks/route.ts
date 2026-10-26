import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { processWebhooks } from "@/lib/services/webhooks";

/** Every few minutes: fans out new events and delivers due webhooks. */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return NextResponse.json(await processWebhooks(db));
}
