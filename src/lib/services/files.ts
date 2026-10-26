import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { files, imports, invoices, shares } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { storage } from "@/lib/storage";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

const MB = 1024 * 1024;

/** What each kind of upload accepts. Anything else is refused before a URL is signed. */
export const UPLOAD_RULES = {
  invoice: { types: ["application/pdf", "image/png", "image/jpeg"], maxBytes: 25 * MB },
  import: { types: ["text/csv", "application/vnd.ms-excel", "text/plain"], maxBytes: 10 * MB },
} as const;
export type UploadPurpose = keyof typeof UPLOAD_RULES;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "text/csv": "csv",
  "application/vnd.ms-excel": "csv",
  "text/plain": "csv",
};

const uploadRequest = z.object({
  purpose: z.enum(["invoice", "import"]),
  filename: z.string().trim().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type UploadRequest = z.input<typeof uploadRequest>;

/**
 * Step 1 of an upload: checks the declared file and returns a short-lived URL
 * the browser PUTs it to. Keys are random and never contain names or emails.
 */
export async function requestUpload(actor: Actor, raw: UploadRequest) {
  authorize(actor, "finance:write");
  const input = uploadRequest.parse(raw);
  const rules = UPLOAD_RULES[input.purpose];
  if (!(rules.types as readonly string[]).includes(input.contentType)) throw new ConflictError("file_type_not_allowed");
  if (input.sizeBytes > rules.maxBytes) throw new ConflictError("file_too_large");

  const key = `${input.purpose}s/${uuidv7()}.${EXTENSIONS[input.contentType]}`;
  const ticket = await storage().presignUpload(key, {
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sha256Base64: Buffer.from(input.sha256, "hex").toString("base64"),
  });
  return { key, ticket };
}

/**
 * Step 2: confirms the object really arrived with the declared size, then
 * records it. Returns other files with the same content, so the UI can warn
 * about duplicates (the same invoice uploaded twice).
 */
export async function completeUpload(db: Db, actor: Actor, raw: UploadRequest & { key: string }) {
  authorize(actor, "finance:write");
  const input = uploadRequest.extend({ key: z.string() }).parse(raw);
  if (!input.key.startsWith(`${input.purpose}s/`)) throw new ConflictError("invalid_key");
  const stored = await storage().head(input.key);
  if (!stored) throw new ConflictError("upload_missing");
  if (stored.sizeBytes !== input.sizeBytes) throw new ConflictError("upload_size_mismatch");

  return db.transaction(async (tx) => {
    const [file] = await tx
      .insert(files)
      .values({
        storageKey: input.key,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        originalName: input.filename,
        uploadedByUserId: actor.id,
      })
      .returning();
    const duplicates = await tx
      .select({ id: files.id, originalName: files.originalName })
      .from(files)
      .where(and(eq(files.sha256, input.sha256), ne(files.id, file.id)));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "file.upload",
      entityType: "file",
      entityId: file.id,
      after: { name: input.filename, purpose: input.purpose },
    });
    return { file, duplicates };
  });
}

/**
 * A signed link to a file, after checking who may see it: an invoice's file
 * is visible to staff with finance access and to that share's owner.
 */
export async function fileDownloadUrl(db: Db, actor: Actor, fileId: string, opts: { inline?: boolean } = {}) {
  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) throw new NotFoundError("file");

  const [invoice] = await db
    .select({ ownerId: shares.ownerId })
    .from(invoices)
    .innerJoin(shares, eq(shares.id, invoices.shareId))
    .where(eq(invoices.fileId, fileId))
    .limit(1);
  if (invoice) authorize(actor, "finance:read", { ownerIds: [invoice.ownerId] });
  else {
    const [imp] = await db.select({ id: imports.id }).from(imports).where(eq(imports.fileId, fileId)).limit(1);
    authorize(actor, imp ? "finance:write" : "finance:read");
  }

  return storage().presignDownload(file.storageKey, {
    filename: file.originalName ?? `${file.id}.${file.storageKey.split(".").pop()}`,
    contentType: file.contentType,
    inline: opts.inline,
  });
}
