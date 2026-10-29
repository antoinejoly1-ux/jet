import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { avatarStorageKey } from "@/lib/services/profile";
import { storage } from "@/lib/storage";

/**
 * A person's profile photo, for signed-in people only: a short redirect to a
 * signed storage URL. The page's URL carries the file id, so the browser may
 * reuse the answer for a few minutes without asking again.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await getViewer())) return new Response(null, { status: 401 });
  const { userId } = await params;
  const file = /^[0-9a-f-]{36}$/.test(userId) ? await avatarStorageKey(db, userId) : null;
  if (!file) return new Response(null, { status: 404 });
  const url = await storage().presignDownload(file.key, {
    filename: "avatar",
    contentType: file.contentType,
    inline: true,
  });
  // Local storage answers with a path; S3 with a full URL.
  return NextResponse.redirect(new URL(url, request.url), {
    status: 302,
    headers: { "Cache-Control": "private, max-age=240" },
  });
}
