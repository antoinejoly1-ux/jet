import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { blobs } from "@/lib/storage/blobs";
import { verifyLocalUrl } from "@/lib/storage/local";
import { contentDisposition } from "@/lib/storage/shared";

/**
 * Stands in for S3 in development, tests and staging: accepts uploads and
 * serves downloads only through URLs signed by the local storage driver.
 */
function disabled() {
  return env.STORAGE_DRIVER === "s3";
}

export async function PUT(request: NextRequest) {
  if (disabled()) return new NextResponse(null, { status: 404 });
  const grant = verifyLocalUrl(request.nextUrl.searchParams);
  if (!grant || grant.op !== "put" || !request.body)
    return new NextResponse("Invalid or expired link", { status: 403 });
  if (request.headers.get("content-type") !== grant.type)
    return new NextResponse("Wrong content type", { status: 400 });
  if (Number(request.headers.get("content-length") ?? grant.size) > (grant.size ?? 0)) {
    return new NextResponse("Too large", { status: 413 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length !== grant.size) return new NextResponse("Size does not match", { status: 400 });
  await blobs().put(grant.key, grant.type, bytes);
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  if (disabled()) return new NextResponse(null, { status: 404 });
  const grant = verifyLocalUrl(request.nextUrl.searchParams);
  if (!grant || grant.op !== "get") return new NextResponse("Invalid or expired link", { status: 403 });
  const bytes = await blobs().get(grant.key);
  if (!bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": grant.type,
      "Content-Length": String(bytes.length),
      "Content-Disposition": contentDisposition(grant.name ?? "file", grant.inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
