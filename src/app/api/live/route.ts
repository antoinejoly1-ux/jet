import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { orNotFound } from "@/lib/route-errors";
import { getFleetLive } from "@/lib/services/tracking";

/** The whole fleet, live, for the back office map's polling. Staff only. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 401 });
  return orNotFound(async () =>
    NextResponse.json(await getFleetLive(db, viewer), { headers: { "Cache-Control": "no-store" } }),
  );
}
