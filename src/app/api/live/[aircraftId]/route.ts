import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { orNotFound } from "@/lib/route-errors";
import { getAircraftLive } from "@/lib/services/tracking";

/**
 * Where an aircraft is now, for the live map's polling (every 15 s). Signed-in
 * users only; owners get their own aircraft only. `?side=client` answers as
 * the owner side would, for staff looking at the Client side.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ aircraftId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 401 });
  const { aircraftId } = await params;
  const ownerView = Boolean(viewer.viewingAs) || request.nextUrl.searchParams.get("side") === "client";
  return orNotFound(async () =>
    NextResponse.json(await getAircraftLive(db, viewer, aircraftId, { ownerView }), {
      headers: { "Cache-Control": "no-store" },
    }),
  );
}
