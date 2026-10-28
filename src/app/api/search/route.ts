import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { orNotFound } from "@/lib/route-errors";
import { searchAdmin } from "@/lib/services/search";

/** ⌘K results for the back office. Staff only. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return new Response(null, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  return orNotFound(async () =>
    NextResponse.json(await searchAdmin(db, viewer, q), { headers: { "Cache-Control": "no-store" } }),
  );
}
