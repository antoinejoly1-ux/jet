import "server-only";
import { and, asc, count, desc, eq, isNotNull, like, lt, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { auditLog, session, user } from "@/lib/db/schema";
import type { StaffRole } from "@/lib/db/schema/_shared";
import { authorize, type Actor } from "@/lib/auth/policy";
import { staffRoleInput } from "@/lib/validation/admin";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

export async function listStaff(db: Db, actor: Actor) {
  authorize(actor, "team:manage");
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      staffRole: user.staffRole,
      twoFactorEnabled: user.twoFactorEnabled,
      lastSignInAt:
        sql`(select max(${session.createdAt}) from ${session} where ${session.userId} = ${user.id})`.mapWith((v) =>
          v ? new Date(v as string) : null,
        ),
    })
    .from(user)
    .where(isNotNull(user.staffRole))
    .orderBy(asc(user.name));
}

/**
 * Changes a team member's role, or removes them from the team ("none").
 * Removing access also signs them out everywhere. The last admin can't be
 * demoted, so the team can never lock itself out.
 */
export async function setStaffRole(db: Db, actor: Actor, userId: string, raw: { role: string }) {
  authorize(actor, "team:manage");
  const { role } = staffRoleInput.parse(raw);
  const next: StaffRole | null = role === "none" ? null : role;

  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: user.id, staffRole: user.staffRole })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (!target?.staffRole) throw new NotFoundError("staff");
    if (target.staffRole === next) return;

    if (target.staffRole === "admin" && next !== "admin") {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(user)
        .where(and(eq(user.staffRole, "admin"), ne(user.id, userId)));
      if (n === 0) throw new ConflictError("last_admin");
    }

    await tx.update(user).set({ staffRole: next }).where(eq(user.id, userId));
    if (next === null) await tx.delete(session).where(eq(session.userId, userId));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: next === null ? "team.remove" : "team.set_role",
      entityType: "user",
      entityId: userId,
      before: { staffRole: target.staffRole },
      after: { staffRole: next },
    });
  });
}

export const AUDIT_PAGE_SIZE = 50;

/** The audit log, newest first, filterable by action prefix ("owner.", "auth."). Admins only. */
export async function listAudit(db: Db, actor: Actor, opts: { action?: string; before?: string } = {}) {
  authorize(actor, "audit:read");
  const filters: SQL[] = [];
  if (opts.action) filters.push(like(auditLog.action, `${opts.action.replace(/[%_]/g, "")}%`));
  if (opts.before) filters.push(lt(auditLog.createdAt, new Date(opts.before)));
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(AUDIT_PAGE_SIZE + 1);
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}
