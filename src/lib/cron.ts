import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Scheduled jobs call /api/cron/* with "Authorization: Bearer $CRON_SECRET"
 * (Vercel Cron sends it automatically). Returns a response to send back when
 * the caller isn't allowed, or null to go ahead.
 */
export function authorizeCron(request: NextRequest): NextResponse | null {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
