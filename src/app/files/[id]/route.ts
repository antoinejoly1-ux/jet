import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError } from "@/lib/auth/policy";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { fileDownloadUrl } from "@/lib/services/files";

/**
 * The only way to open a stored file: checks who is asking, then redirects to
 * a signed link that expires in 5 minutes. ?inline=1 shows it in the browser.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/files/[id]">) {
  const viewer = await getViewer();
  if (!viewer)
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));
  const { id } = await params;
  try {
    const url = await fileDownloadUrl(db, viewer, id, { inline: request.nextUrl.searchParams.get("inline") === "1" });
    return NextResponse.redirect(new URL(url, request.url), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) return new NextResponse(null, { status: 404 });
    throw err;
  }
}
