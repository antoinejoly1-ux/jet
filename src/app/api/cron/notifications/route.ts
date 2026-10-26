import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { sendDueMessageEmails } from "@/lib/services/delayed-emails";

/** Every few minutes: emails owners about replies they haven't read in the app. */
export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return NextResponse.json(await sendDueMessageEmails(db));
}
