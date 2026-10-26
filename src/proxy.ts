import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Pages anyone can open. Everything else needs a session cookie. */
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/two-factor",
  "/invite",
  "/privacy",
];

/**
 * An optimistic check only: it sends visitors without a session cookie to
 * sign-in without a database call. Real authorization happens on the server
 * in every page, action and service (see lib/auth/policy.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();

  const url = new URL("/sign-in", request.url);
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|robots.txt|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
