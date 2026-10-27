/**
 * API keys for other apps (accounting, Zapier, Make). A key is shown once,
 * stored only as a SHA-256 hash, carries an explicit list of scopes, and can
 * be revoked. Requests made with it act with exactly those scopes.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { apiKeys, rateLimit, user } from "@/lib/db/schema";
import { API_SCOPES, authorize, type Actor } from "@/lib/auth/policy";
import { sha256Hex } from "@/lib/crypto";
import { recordAudit } from "./audit";
import { ConflictError } from "./errors";

export const apiKeyInput = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
});
export type ApiKeyInput = z.input<typeof apiKeyInput>;

/** Requests allowed per key per minute. */
export const API_RATE_PER_MINUTE = 120;

export async function createApiKey(db: Db, actor: Actor, raw: ApiKeyInput) {
  authorize(actor, "integrations:manage");
  const input = apiKeyInput.parse(raw);
  const prefix = `jet_${randomBytes(4).toString("hex")}`;
  const key = `${prefix}_${randomBytes(24).toString("base64url")}`;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(apiKeys)
      .values({ name: input.name, prefix, keyHash: sha256Hex(key), scopes: input.scopes, createdByUserId: actor.id })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "api_key.create",
      entityType: "api_key",
      entityId: created!.id,
      after: { name: input.name, prefix, scopes: input.scopes },
    });
    return created!;
  });
  // The only time the full key exists outside the caller's hands.
  return { id: row.id, key };
}

export async function listApiKeys(db: Db, actor: Actor) {
  authorize(actor, "integrations:manage");
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
      createdByName: user.name,
    })
    .from(apiKeys)
    .leftJoin(user, eq(user.id, apiKeys.createdByUserId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(db: Db, actor: Actor, id: string) {
  authorize(actor, "integrations:manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    if (!row) throw new ConflictError("api_key_revoked");
    await recordAudit(tx, { actorUserId: actor.id, action: "api_key.revoke", entityType: "api_key", entityId: id });
  });
}

export type ApiAuth =
  | { ok: true; actor: Actor; keyId: string }
  | { ok: false; status: 401 | 429; code: "missing_key" | "invalid_key" | "rate_limited" };

/**
 * Checks "Authorization: Bearer jet_…". The returned actor acts as the key's
 * creator for the audit log, with only the key's scopes.
 */
export async function authenticateApiKey(db: Db, header: string | null, now = Date.now()): Promise<ApiAuth> {
  const key = header?.match(/^Bearer\s+(jet_[a-f0-9]{8}_[\w-]{20,})$/)?.[1];
  if (!header) return { ok: false, status: 401, code: "missing_key" };
  if (!key) return { ok: false, status: 401, code: "invalid_key" };
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, sha256Hex(key)), isNull(apiKeys.revokedAt)));
  if (!row || !row.createdByUserId) return { ok: false, status: 401, code: "invalid_key" };

  // A fixed one-minute window per key, counted in the shared rate-limit table.
  const window = Math.floor(now / 60_000);
  const [counter] = await db
    .insert(rateLimit)
    .values({ key: `api:${row.id}:${window}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: { count: sql`${rateLimit.count} + 1`, lastRequest: now },
    })
    .returning({ count: rateLimit.count });
  if ((counter?.count ?? 0) > API_RATE_PER_MINUTE) return { ok: false, status: 429, code: "rate_limited" };

  // Last-used is shown in Settings; a minute's precision is plenty and spares a write per request.
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > 60_000)
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(apiKeys.id, row.id));
  if (window % 10 === 0)
    await db
      .delete(rateLimit)
      .where(and(sql`${rateLimit.key} like 'api:%'`, lt(rateLimit.lastRequest, now - 3_600_000)));

  return {
    ok: true,
    keyId: row.id,
    actor: { id: row.createdByUserId, staffRole: null, ownerIds: [], apiScopes: row.scopes as Actor["apiScopes"] },
  };
}
