import "server-only";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { aircraft, auditLog, invitations, ownerMembers, owners, shares, user } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { ownerInput, type OwnerInput } from "@/lib/validation/admin";
import { recordAudit } from "./audit";
import { NotFoundError, ConflictError } from "./errors";

/** Every active owner with the aircraft they hold shares in. Staff only. */
export async function listOwners(db: Db, actor: Actor, opts: { q?: string } = {}) {
  authorize(actor, "owners:read");
  const q = opts.q?.trim();
  return db
    .select({
      id: owners.id,
      legalName: owners.legalName,
      type: owners.type,
      email: owners.email,
      aircraft: sql<string[]>`coalesce(array_agg(${aircraft.registration} order by ${aircraft.registration})
        filter (where ${aircraft.id} is not null and (${shares.endsOn} is null or ${shares.endsOn} > current_date)), '{}')`,
      members: sql<number>`(select count(*)::int from owner_members m where m.owner_id = ${owners.id})`,
    })
    .from(owners)
    .leftJoin(shares, eq(shares.ownerId, owners.id))
    .leftJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(
      and(
        isNull(owners.deletedAt),
        q
          ? or(ilike(owners.legalName, `%${q}%`), ilike(owners.email, `%${q}%`), ilike(aircraft.registration, `%${q}%`))
          : undefined,
      ),
    )
    .groupBy(owners.id)
    .orderBy(asc(owners.legalName));
}

/** One owner with everything the detail page shows. */
export async function getOwner(db: Db, actor: Actor, id: string) {
  authorize(actor, "owners:read");
  const [owner] = await db
    .select()
    .from(owners)
    .where(and(eq(owners.id, id), isNull(owners.deletedAt)));
  if (!owner) throw new NotFoundError("owner");

  const [ownerShares, members, pendingInvitations, history] = await Promise.all([
    db
      .select({
        id: shares.id,
        aircraftId: aircraft.id,
        registration: aircraft.registration,
        model: aircraft.model,
        percentageBp: shares.percentageBp,
        annualHoursMinutes: shares.annualHoursMinutes,
        startsOn: shares.startsOn,
        endsOn: shares.endsOn,
      })
      .from(shares)
      .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
      .where(eq(shares.ownerId, id))
      .orderBy(asc(shares.endsOn), asc(aircraft.registration)),
    db
      .select({
        id: ownerMembers.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: ownerMembers.role,
        canSeeFinances: ownerMembers.canSeeFinances,
        since: ownerMembers.createdAt,
      })
      .from(ownerMembers)
      .innerJoin(user, eq(user.id, ownerMembers.userId))
      .where(eq(ownerMembers.ownerId, id))
      .orderBy(asc(user.name)),
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(and(eq(invitations.ownerId, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .orderBy(desc(invitations.createdAt)),
    db
      .select({ id: auditLog.id, action: auditLog.action, actorName: user.name, createdAt: auditLog.createdAt })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorUserId))
      .where(and(eq(auditLog.entityType, "owner"), eq(auditLog.entityId, id)))
      .orderBy(desc(auditLog.createdAt))
      .limit(20),
  ]);

  return { owner, shares: ownerShares, members, pendingInvitations, history };
}

export async function createOwner(db: Db, actor: Actor, raw: OwnerInput) {
  authorize(actor, "owners:write");
  const input = ownerInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(owners).values(input).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "owner.create",
      entityType: "owner",
      entityId: row.id,
      after: input,
    });
    return row;
  });
}

export async function updateOwner(db: Db, actor: Actor, id: string, raw: OwnerInput) {
  authorize(actor, "owners:write");
  const input = ownerInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(owners)
      .where(and(eq(owners.id, id), isNull(owners.deletedAt)))
      .for("update");
    if (!before) throw new NotFoundError("owner");
    const [row] = await tx.update(owners).set(input).where(eq(owners.id, id)).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "owner.update",
      entityType: "owner",
      entityId: id,
      before: pick(before, Object.keys(input)),
      after: input,
    });
    return row;
  });
}

/** Archives an owner. Refused while they still hold an active share. */
export async function archiveOwner(db: Db, actor: Actor, id: string) {
  authorize(actor, "owners:write");
  await db.transaction(async (tx) => {
    const active = await tx
      .select({ id: shares.id })
      .from(shares)
      .where(and(eq(shares.ownerId, id), isNull(shares.endsOn)))
      .limit(1);
    if (active.length > 0) throw new ConflictError("owner_has_active_shares");
    const [row] = await tx
      .update(owners)
      .set({ deletedAt: new Date() })
      .where(and(eq(owners.id, id), isNull(owners.deletedAt)))
      .returning({ id: owners.id });
    if (!row) throw new NotFoundError("owner");
    await tx.delete(ownerMembers).where(eq(ownerMembers.ownerId, id));
    await recordAudit(tx, { actorUserId: actor.id, action: "owner.archive", entityType: "owner", entityId: id });
  });
}

export const memberAccessInput = z.object({
  role: z.enum(["owner", "assistant", "read_only"]),
  canSeeFinances: z.boolean(),
});
export type MemberAccessInput = z.input<typeof memberAccessInput>;

/** Changes what one login may do for an owner. Owners always see finances, so the flag only applies to others. */
export async function updateOwnerMember(
  db: Db,
  actor: Actor,
  ownerId: string,
  memberId: string,
  raw: MemberAccessInput,
) {
  authorize(actor, "owners:write");
  const input = memberAccessInput.parse(raw);
  const next = { role: input.role, canSeeFinances: input.role !== "owner" && input.canSeeFinances };
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ role: ownerMembers.role, canSeeFinances: ownerMembers.canSeeFinances, userId: ownerMembers.userId })
      .from(ownerMembers)
      .where(and(eq(ownerMembers.id, memberId), eq(ownerMembers.ownerId, ownerId)))
      .for("update");
    if (!before) throw new NotFoundError("member");
    await tx.update(ownerMembers).set(next).where(eq(ownerMembers.id, memberId));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "owner.member_update",
      entityType: "owner",
      entityId: ownerId,
      before,
      after: { userId: before.userId, ...next },
    });
  });
}

/** Removes one login's access to an owner (the account itself is kept). */
export async function removeOwnerMember(db: Db, actor: Actor, ownerId: string, memberId: string) {
  authorize(actor, "owners:write");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(ownerMembers)
      .where(and(eq(ownerMembers.id, memberId), eq(ownerMembers.ownerId, ownerId)))
      .returning();
    if (!row) throw new NotFoundError("member");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "owner.member_remove",
      entityType: "owner",
      entityId: ownerId,
      before: { userId: row.userId, role: row.role },
    });
  });
}

function pick<T extends object>(obj: T, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, (obj as Record<string, unknown>)[k]]));
}
