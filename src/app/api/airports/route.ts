import { NextResponse, type NextRequest } from "next/server";
import { searchAirports } from "@/lib/airports";
import { getViewer } from "@/lib/auth/session";

/** Airport suggestions for the flight forms: ?q=montreal → [{ icao, name, city }]. Signed-in only. */
export async function GET(request: NextRequest) {
  if (!(await getViewer())) return new Response(null, { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = searchAirports(q.slice(0, 60)).map(({ icao, name, city }) => ({ icao, name, city }));
  return NextResponse.json(results, { headers: { "Cache-Control": "private, max-age=3600" } });
}
