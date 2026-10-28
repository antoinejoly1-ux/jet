import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { env } from "@/lib/env";
import { DOWNLOAD_TTL_SECONDS, UPLOAD_TTL_SECONDS, type StorageDriver } from "./shared";

/**
 * Development, test and staging storage: the same signed-URL flow as S3,
 * served by /api/storage/local, with the bytes in a local folder or in the
 * database (see blobs.ts). Never used in production.
 */
export const LOCAL_ROUTE = "/api/storage/local";

export function localRoot(): string {
  return path.resolve(env.LOCAL_STORAGE_DIR);
}

/** Resolves a key inside the storage folder, refusing anything that escapes it. */
export function localPath(key: string): string {
  if (!/^[a-z0-9-]+\/[0-9a-f-]+\.[a-z0-9]+$/.test(key)) throw new Error("Invalid storage key");
  return path.join(localRoot(), key);
}

type Grant = {
  op: "put" | "get";
  key: string;
  exp: number;
  type: string;
  size?: number;
  name?: string;
  inline?: boolean;
};

function signature(grant: Grant): string {
  const payload = [
    grant.op,
    grant.key,
    grant.exp,
    grant.type,
    grant.size ?? "",
    grant.name ?? "",
    grant.inline ? 1 : 0,
  ].join("|");
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(payload).digest("base64url");
}

function signedUrl(grant: Grant): string {
  const params = new URLSearchParams({ op: grant.op, key: grant.key, exp: String(grant.exp), type: grant.type });
  if (grant.size !== undefined) params.set("size", String(grant.size));
  if (grant.name) params.set("name", grant.name);
  if (grant.inline) params.set("inline", "1");
  params.set("sig", signature(grant));
  return `${LOCAL_ROUTE}?${params.toString()}`;
}

/** Checks a signed local URL. Returns the grant when valid and unexpired. */
export function verifyLocalUrl(params: URLSearchParams, now = Date.now()): Grant | null {
  const op = params.get("op");
  if (op !== "put" && op !== "get") return null;
  const grant: Grant = {
    op,
    key: params.get("key") ?? "",
    exp: Number(params.get("exp")),
    type: params.get("type") ?? "",
    size: params.has("size") ? Number(params.get("size")) : undefined,
    name: params.get("name") ?? undefined,
    inline: params.get("inline") === "1",
  };
  const given = Buffer.from(params.get("sig") ?? "");
  const expected = Buffer.from(signature(grant));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!(grant.exp > now)) return null;
  return grant;
}

export function localStorageDriver(): StorageDriver {
  return {
    async presignUpload(key, file) {
      localPath(key);
      const exp = Date.now() + UPLOAD_TTL_SECONDS * 1000;
      return {
        url: signedUrl({ op: "put", key, exp, type: file.contentType, size: file.sizeBytes }),
        method: "PUT",
        headers: { "Content-Type": file.contentType },
      };
    },
    async presignDownload(key, { filename, contentType, inline }) {
      const exp = Date.now() + DOWNLOAD_TTL_SECONDS * 1000;
      return signedUrl({ op: "get", key, exp, type: contentType, name: filename, inline });
    },
    async head(key) {
      const { blobs } = await import("./blobs");
      const size = await blobs().size(key);
      return size == null ? null : { sizeBytes: size };
    },
  };
}
