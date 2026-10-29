import "server-only";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { localPath } from "./local";

/**
 * Where the signed-URL route keeps bytes when S3 isn't used: a local folder
 * (development, tests) or the database (staging deployments on Vercel, whose
 * disk doesn't last between requests).
 */
export interface Blobs {
  put(key: string, contentType: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
}

const folder: Blobs = {
  async put(key, _type, bytes) {
    await mkdir(path.dirname(localPath(key)), { recursive: true });
    await writeFile(localPath(key), bytes);
  },
  async get(key) {
    try {
      return await readFile(localPath(key));
    } catch {
      return null;
    }
  },
  async size(key) {
    try {
      return (await stat(localPath(key))).size;
    } catch {
      return null;
    }
  },
  async remove(key) {
    await unlink(localPath(key)).catch(() => undefined);
  },
};

// The database client is loaded lazily so the folder backend never needs it.
const database: Blobs = {
  async put(key, contentType, bytes) {
    const { db, schema } = await import("@/lib/db");
    localPath(key);
    await db
      .insert(schema.storedFiles)
      .values({ key, contentType, bytes })
      .onConflictDoUpdate({ target: schema.storedFiles.key, set: { contentType, bytes } });
  },
  async get(key) {
    const { db, schema } = await import("@/lib/db");
    const [row] = await db
      .select({ bytes: schema.storedFiles.bytes })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.key, key));
    return row?.bytes ?? null;
  },
  async size(key) {
    const { db, schema } = await import("@/lib/db");
    const [row] = await db
      .select({ n: sql<number>`octet_length(${schema.storedFiles.bytes})`.mapWith(Number) })
      .from(schema.storedFiles)
      .where(eq(schema.storedFiles.key, key));
    return row?.n ?? null;
  },
  async remove(key) {
    const { db, schema } = await import("@/lib/db");
    await db.delete(schema.storedFiles).where(eq(schema.storedFiles.key, key));
  },
};

export const blobs = (): Blobs => (env.STORAGE_DRIVER === "database" ? database : folder);

/** Both backends, for tests. */
export const backends = { folder, database };
