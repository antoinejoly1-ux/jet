import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { SIDE_COOKIE } from "@/lib/side";

/** Where everyone lands after signing in: the side they last used, or the waiting screen. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!viewer) return to("/sign-in");
  if (viewer.staffRole) return to((await cookies()).get(SIDE_COOKIE)?.value === "client" ? "/" : "/admin");
  if (viewer.ownerIds.length === 0) return to("/pending");
  return to("/");
}
