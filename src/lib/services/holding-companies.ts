/**
 * Holding companies: each aircraft is owned by one, and its owners are the
 * company's shareholders. Univair manages them; invoices and the yearly P&L
 * belong to them. Staff manage them like owners.
 */
import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { aircraft, auditLog, holdingCompanies, owners, shares, user } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { holdingCompanyInput, type HoldingCompanyInput } from "@/lib/validation/admin";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

const activeShare = () => or(isNull(shares.endsOn), gt(shares.endsOn, sql`current_date`));

/** Every active holding company with the aircraft it owns. */
export async function listHoldingCompanies(db: Db, actor: Actor) {
  authorize(actor, "owners:read");
  return db
    .select({
      id: holdingCompanies.id,
      legalName: holdingCompanies.legalName,
      registrationNumber: holdingCompanies.registrationNumber,
      email: holdingCompanies.email,
      aircraft: sql<
        string[]
      >`coalesce(array_agg(${aircraft.registration} order by ${aircraft.registration}) filter (where ${aircraft.id} is not null), '{}')`,
    })
    .from(holdingCompanies)
    .leftJoin(aircraft, and(eq(aircraft.holdingCompanyId, holdingCompanies.id), isNull(aircraft.deletedAt)))
    .where(isNull(holdingCompanies.deletedAt))
    .groupBy(holdingCompanies.id)
    .orderBy(asc(holdingCompanies.legalName));
}

/** For pickers: id and name only. */
export async function listHoldingCompanyOptions(db: Db, actor: Actor) {
  authorize(actor, "fleet:read");
  return db
    .select({ id: holdingCompanies.id, legalName: holdingCompanies.legalName })
    .from(holdingCompanies)
    .where(isNull(holdingCompanies.deletedAt))
    .orderBy(asc(holdingCompanies.legalName));
}

/** One company with its aircraft, its shareholders (active shares on those aircraft) and recent history. */
export async function getHoldingCompany(db: Db, actor: Actor, id: string) {
  authorize(actor, "owners:read");
  const [company] = await db
    .select()
    .from(holdingCompanies)
    .where(and(eq(holdingCompanies.id, id), isNull(holdingCompanies.deletedAt)));
  if (!company) throw new NotFoundError("holding_company");
  const planes = await db
    .select({ id: aircraft.id, registration: aircraft.registration, model: aircraft.model, status: aircraft.status })
    .from(aircraft)
    .where(and(eq(aircraft.holdingCompanyId, id), isNull(aircraft.deletedAt)))
    .orderBy(asc(aircraft.registration));
  const [shareholders, history] = await Promise.all([
    planes.length === 0
      ? []
      : db
          .select({
            shareId: shares.id,
            ownerId: owners.id,
            ownerName: owners.legalName,
            registration: aircraft.registration,
            percentageBp: shares.percentageBp,
          })
          .from(shares)
          .innerJoin(owners, eq(owners.id, shares.ownerId))
          .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
          .where(
            and(
              inArray(
                shares.aircraftId,
                planes.map((p) => p.id),
              ),
              activeShare(),
            ),
          )
          .orderBy(asc(aircraft.registration), desc(shares.percentageBp)),
    db
      .select({ id: auditLog.id, action: auditLog.action, actorName: user.name, createdAt: auditLog.createdAt })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorUserId))
      .where(and(eq(auditLog.entityType, "holding_company"), eq(auditLog.entityId, id)))
      .orderBy(desc(auditLog.createdAt))
      .limit(20),
  ]);
  return { company, aircraft: planes, shareholders, history };
}

export async function createHoldingCompany(db: Db, actor: Actor, raw: HoldingCompanyInput) {
  authorize(actor, "owners:write");
  const input = holdingCompanyInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(holdingCompanies).values(input).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "holding_company.create",
      entityType: "holding_company",
      entityId: row!.id,
      after: input,
    });
    return row!;
  });
}

export async function updateHoldingCompany(db: Db, actor: Actor, id: string, raw: HoldingCompanyInput) {
  authorize(actor, "owners:write");
  const input = holdingCompanyInput.parse(raw);
  return db.transaction(async (tx) => {
    const before = await lock(tx, id);
    const [row] = await tx.update(holdingCompanies).set(input).where(eq(holdingCompanies.id, id)).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "holding_company.update",
      entityType: "holding_company",
      entityId: id,
      before,
      after: input,
    });
    return row!;
  });
}

/** Archives a company. Refused while it still owns an aircraft: move the aircraft first. */
export async function archiveHoldingCompany(db: Db, actor: Actor, id: string) {
  authorize(actor, "owners:write");
  await db.transaction(async (tx) => {
    await lock(tx, id);
    const [owned] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(and(eq(aircraft.holdingCompanyId, id), isNull(aircraft.deletedAt)))
      .limit(1);
    if (owned) throw new ConflictError("holding_company_has_aircraft");
    await tx.update(holdingCompanies).set({ deletedAt: new Date() }).where(eq(holdingCompanies.id, id));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "holding_company.archive",
      entityType: "holding_company",
      entityId: id,
    });
  });
}

async function lock(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(holdingCompanies)
    .where(and(eq(holdingCompanies.id, id), isNull(holdingCompanies.deletedAt)))
    .for("update");
  if (!row) throw new NotFoundError("holding_company");
  return row;
}

/** Checks a company exists and is active before an aircraft is attached to it. */
export async function assertHoldingCompany(tx: Tx, id: string | null) {
  if (!id) return;
  const [row] = await tx
    .select({ id: holdingCompanies.id })
    .from(holdingCompanies)
    .where(and(eq(holdingCompanies.id, id), isNull(holdingCompanies.deletedAt)));
  if (!row) throw new NotFoundError("holding_company");
}
