import "server-only";
import type { DbOrTx } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Appends to the audit log. Pass the same transaction as the change it
 * describes, so the change and its audit entry commit or roll back together.
 */
export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipAddress: normalizeIp(entry.ipAddress),
    userAgent: entry.userAgent ?? null,
  });
}

/** Keeps the first address of a forwarded chain; drops anything that isn't an IP. */
function normalizeIp(ip: string | null | undefined): string | null {
  const first = ip?.split(",")[0]?.trim();
  if (!first) return null;
  return /^[0-9a-fA-F:.]+$/.test(first) ? first : null;
}
