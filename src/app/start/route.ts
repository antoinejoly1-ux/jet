import { NextResponse, type NextRequest } from "next/server";
import { getViewer, landingPath, needsWelcome } from "@/lib/auth/session";

/** Where everyone lands after signing in: the side they last used, or the waiting screen. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!viewer) return to("/sign-in");
  if (needsWelcome(viewer)) return to("/welcome");
  return to(await landingPath(viewer));
}
