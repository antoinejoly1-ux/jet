import "server-only";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { aircraft, auditLog, holdingCompanies, owners, shares, user } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { aircraftInput, endShareInput, shareInput, type AircraftInput, type ShareInput } from "@/lib/validation/admin";
import { recordAudit } from "./audit";
import { assertHoldingCompany } from "./holding-companies";
import { ConflictError, NotFoundError } from "./errors";

const FULL = 10_000; // 100% in basis points

/** A share is active when it has no end date, or ends in the future. */
const activeShare = () => or(isNull(shares.endsOn), gt(shares.endsOn, sql`current_date`));

export async function listAircraft(db: Db, actor: Actor) {
  authorize(actor, "fleet:read");
  return db
    .select({
      id: aircraft.id,
      registration: aircraft.registration,
      model: aircraft.model,
      homeBase: aircraft.homeBase,
      status: aircraft.status,
      holdingCompanyName: holdingCompanies.legalName,
      assignedBp: sql<number>`coalesce(sum(${shares.percentageBp}) filter (where ${shares.endsOn} is null or ${shares.endsOn} > current_date), 0)::int`,
      owners: sql<number>`count(${shares.id}) filter (where ${shares.endsOn} is null or ${shares.endsOn} > current_date)::int`,
    })
    .from(aircraft)
    .leftJoin(shares, eq(shares.aircraftId, aircraft.id))
    .leftJoin(holdingCompanies, eq(holdingCompanies.id, aircraft.holdingCompanyId))
    .where(isNull(aircraft.deletedAt))
    .groupBy(aircraft.id, holdingCompanies.legalName)
    .orderBy(asc(aircraft.registration));
}

export async function getAircraft(db: Db, actor: Actor, id: string) {
  authorize(actor, "fleet:read");
  const [row] = await db
    .select({ plane: aircraft, holdingCompanyName: holdingCompanies.legalName })
    .from(aircraft)
    .leftJoin(holdingCompanies, eq(holdingCompanies.id, aircraft.holdingCompanyId))
    .where(and(eq(aircraft.id, id), isNull(aircraft.deletedAt)));
  if (!row) throw new NotFoundError("aircraft");
  const plane = { ...row.plane, holdingCompanyName: row.holdingCompanyName };
  const [planeShares, history] = await Promise.all([
    db
      .select({
        id: shares.id,
        ownerId: owners.id,
        ownerName: owners.legalName,
        percentageBp: shares.percentageBp,
        annualHoursMinutes: shares.annualHoursMinutes,
        startsOn: shares.startsOn,
        endsOn: shares.endsOn,
      })
      .from(shares)
      .innerJoin(owners, eq(owners.id, shares.ownerId))
      .where(eq(shares.aircraftId, id))
      .orderBy(asc(shares.endsOn), desc(shares.percentageBp)),
    db
      .select({ id: auditLog.id, action: auditLog.action, actorName: user.name, createdAt: auditLog.createdAt })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorUserId))
      .where(and(eq(auditLog.entityType, "aircraft"), eq(auditLog.entityId, id)))
      .orderBy(desc(auditLog.createdAt))
      .limit(20),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const assignedBp = planeShares.filter((s) => !s.endsOn || s.endsOn > today).reduce((n, s) => n + s.percentageBp, 0);
  return { aircraft: plane, shares: planeShares, assignedBp, history };
}

export async function createAircraft(db: Db, actor: Actor, raw: AircraftInput) {
  authorize(actor, "fleet:write");
  const input = aircraftInput.parse(raw);
  return db.transaction(async (tx) => {
    await assertRegistrationFree(tx, input.registration);
    await assertHoldingCompany(tx, input.holdingCompanyId);
    const [row] = await tx.insert(aircraft).values(input).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "aircraft.create",
      entityType: "aircraft",
      entityId: row.id,
      after: input,
    });
    return row;
  });
}

export async function updateAircraft(db: Db, actor: Actor, id: string, raw: AircraftInput) {
  authorize(actor, "fleet:write");
  const input = aircraftInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(aircraft)
      .where(and(eq(aircraft.id, id), isNull(aircraft.deletedAt)))
      .for("update");
    if (!before) throw new NotFoundError("aircraft");
    if (before.registration !== input.registration) await assertRegistrationFree(tx, input.registration);
    await assertHoldingCompany(tx, input.holdingCompanyId);
    const [row] = await tx.update(aircraft).set(input).where(eq(aircraft.id, id)).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "aircraft.update",
      entityType: "aircraft",
      entityId: id,
      before,
      after: input,
    });
    return row;
  });
}

async function assertRegistrationFree(tx: Tx, registration: string) {
  const taken = await tx
    .select({ id: aircraft.id })
    .from(aircraft)
    .where(eq(aircraft.registration, registration))
    .limit(1);
  if (taken.length > 0) throw new ConflictError("registration_taken");
}

/**
 * Gives an owner a share of an aircraft. Active shares on one aircraft can
 * never total more than 100%; the aircraft row is locked so two admins
 * adding shares at once can't both slip under the limit.
 */
export async function addShare(db: Db, actor: Actor, aircraftId: string, raw: ShareInput) {
  authorize(actor, "fleet:write");
  const input = shareInput.parse(raw);
  const percentageBp = Math.round(input.percent * 100);
  return db.transaction(async (tx) => {
    const [plane] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(and(eq(aircraft.id, aircraftId), isNull(aircraft.deletedAt)))
      .for("update");
    if (!plane) throw new NotFoundError("aircraft");
    const [owner] = await tx
      .select({ id: owners.id })
      .from(owners)
      .where(and(eq(owners.id, input.ownerId), isNull(owners.deletedAt)));
    if (!owner) throw new NotFoundError("owner");

    const [{ assigned }] = await tx
      .select({ assigned: sql<number>`coalesce(sum(${shares.percentageBp}), 0)::int` })
      .from(shares)
      .where(and(eq(shares.aircraftId, aircraftId), activeShare()));
    if (assigned + percentageBp > FULL) throw new ConflictError("shares_over_100");

    const duplicate = await tx
      .select({ id: shares.id })
      .from(shares)
      .where(and(eq(shares.aircraftId, aircraftId), eq(shares.ownerId, input.ownerId), activeShare()))
      .limit(1);
    if (duplicate.length > 0) throw new ConflictError("owner_already_has_share");

    const [row] = await tx
      .insert(shares)
      .values({
        aircraftId,
        ownerId: input.ownerId,
        percentageBp,
        annualHoursMinutes: input.annualHours !== undefined ? Math.round(input.annualHours * 60) : null,
        startsOn: input.startsOn,
      })
      .returning();
    const after = { shareId: row.id, ownerId: row.ownerId, percentageBp, startsOn: row.startsOn };
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "share.add",
      entityType: "aircraft",
      entityId: aircraftId,
      after,
    });
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "share.add",
      entityType: "owner",
      entityId: input.ownerId,
      after,
    });
    return row;
  });
}

/** Ends a share on a date. Shares are never deleted: flights and money point at them. */
export async function endShare(db: Db, actor: Actor, shareId: string, raw: { endsOn: string }) {
  authorize(actor, "fleet:write");
  const { endsOn } = endShareInput.parse(raw);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(shares).where(eq(shares.id, shareId)).for("update");
    if (!before) throw new NotFoundError("share");
    if (before.endsOn) throw new ConflictError("share_already_ended");
    if (endsOn < before.startsOn) throw new ConflictError("ends_before_start");
    await tx.update(shares).set({ endsOn }).where(eq(shares.id, shareId));
    const change = { shareId, endsOn };
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "share.end",
      entityType: "aircraft",
      entityId: before.aircraftId,
      after: change,
    });
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "share.end",
      entityType: "owner",
      entityId: before.ownerId,
      after: change,
    });
  });
}
