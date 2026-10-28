import "server-only";
import { env } from "@/lib/env";
import { localStorageDriver } from "./local";
import { s3StorageDriver } from "./s3";
import type { StorageDriver } from "./shared";

/**
 * Where files live. Browsers upload straight to storage with a short-lived
 * signed URL (so large PDFs never pass through the app server, which has a
 * small request limit on Vercel), and downloads are signed URLs too.
 *
 * Production uses a private S3 bucket in ca-central-1; development, tests and
 * staging use the same signed-URL flow with the bytes in a folder or the database.
 */
let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  driver ??= env.STORAGE_DRIVER === "s3" ? s3StorageDriver() : localStorageDriver();
  return driver;
}

export type { StorageDriver, UploadTicket } from "./shared";
