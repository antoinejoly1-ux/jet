import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError } from "@/lib/auth/policy";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aircraftPhotoDownload } from "@/lib/services/aircraft";
import { NotFoundError } from "@/lib/services/errors";

/** An aircraft's own photo, for the team and its owners: a redirect to a short-lived signed link. */
export async function GET(request: NextRequest, { params }: RouteContext<"/aircraft-photos/[id]">) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  try {
    const url = await aircraftPhotoDownload(db, viewer, id);
    // The versioned URL (?v=<file id>) changes with the photo, so the browser may keep it a while.
    return NextResponse.redirect(new URL(url, request.url), { headers: { "Cache-Control": "private, max-age=240" } });
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) return new NextResponse(null, { status: 404 });
    throw err;
  }
}
