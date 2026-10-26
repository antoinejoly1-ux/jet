import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { localPath, verifyLocalUrl } from "@/lib/storage/local";
import { contentDisposition } from "@/lib/storage/shared";

/**
 * Stands in for S3 in development and tests: accepts uploads and serves
 * downloads only through URLs signed by the local storage driver.
 */
function disabled() {
  return env.STORAGE_DRIVER !== "local";
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

  const target = localPath(grant.key);
  await pipeline(Readable.fromWeb(request.body as unknown as WebReadableStream), createWriteStream(target));
  const { size } = await stat(target);
  if (size !== grant.size) {
    await unlink(target);
    return new NextResponse("Size does not match", { status: 400 });
  }
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest) {
  if (disabled()) return new NextResponse(null, { status: 404 });
  const grant = verifyLocalUrl(request.nextUrl.searchParams);
  if (!grant || grant.op !== "get") return new NextResponse("Invalid or expired link", { status: 403 });
  const file = localPath(grant.key);
  try {
    const { size } = await stat(file);
    return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        "Content-Type": grant.type,
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(grant.name ?? "file", grant.inline),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
