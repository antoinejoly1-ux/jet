import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { orNotFound } from "@/lib/route-errors";
import { adminShortcuts, searchAdmin } from "@/lib/services/search";

/** ⌘K results for the back office, or (`?shortcuts`) the pages and actions this role can use. Staff only. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 401 });
  if (request.nextUrl.searchParams.has("shortcuts"))
    return orNotFound(async () =>
      NextResponse.json(adminShortcuts(viewer), { headers: { "Cache-Control": "no-store" } }),
    );
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return orNotFound(async () =>
    NextResponse.json(await searchAdmin(db, viewer, q), { headers: { "Cache-Control": "no-store" } }),
  );
}
