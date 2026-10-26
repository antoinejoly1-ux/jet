import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { flightsCsv } from "@/lib/exports";
import { orNotFound } from "@/lib/route-errors";
import { listFlights } from "@/lib/services/flights";

const DAY = 86_400_000;

/** Upcoming: the next 90 days. Past: the last 365 days. */
export async function GET(request: NextRequest) {
  const viewer = await requireStaff();
  const sp = request.nextUrl.searchParams;
  const now = Date.now();
  const past = sp.get("view") === "past";
  return orNotFound(async () => {
    const rows = await listFlights(db, viewer, {
      from: new Date(past ? now - 365 * DAY : now - DAY),
      to: new Date(past ? now : now + 90 * DAY),
      aircraftId: sp.get("aircraft") || undefined,
    });
    return csvResponse(await flightsCsv(rows, { withOwner: true }), `flights-${past ? "past" : "upcoming"}.csv`);
  });
}
