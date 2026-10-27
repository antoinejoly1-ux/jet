/**
 * When an aircraft is free. Nothing is stored as "available": it's whatever
 * isn't taken by a flight, a maintenance window or a manual block. Owners see
 * their own flights in detail, a co-owner's as "booked" with the co-owner's
 * name (co-owners know each other), and charter flights only as "booked".
 */
import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, availabilityBlocks, flights, maintenanceEvents, owners, shares } from "@/lib/db/schema";
import { authorize, isStaff, type Actor } from "@/lib/auth/policy";
import type { Period } from "@/lib/availability-days";
import { blockInput, type BlockInput } from "@/lib/validation/operations";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

const HOUR = 3_600_000;
/** How long a flight with no arrival time is assumed to take. */
const DEFAULT_FLIGHT_MS = 2 * HOUR;

/** Every owner with an active share in this aircraft: the scope for owner reads. */
async function holderOwnerIds(db: Db, aircraftId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .selectDistinct({ ownerId: shares.ownerId })
    .from(shares)
    .where(and(eq(shares.aircraftId, aircraftId), or(isNull(shares.endsOn), gt(shares.endsOn, today))));
  return rows.map((r) => r.ownerId);
}

/**
 * The aircraft's taken periods overlapping [from, to). `ownerView` shows what
 * an owner sees even to staff (the Client side, including "view as owner").
 */
export async function getAvailability(
  db: Db,
  actor: Actor,
  aircraftId: string,
  from: Date,
  to: Date,
  { ownerView = false } = {},
) {
  authorize(actor, "fleet:read", { ownerIds: await holderOwnerIds(db, aircraftId) });
  const [plane] = await db
    .select({ id: aircraft.id, registration: aircraft.registration, model: aircraft.model, status: aircraft.status })
    .from(aircraft)
    .where(and(eq(aircraft.id, aircraftId), isNull(aircraft.deletedAt)));
  if (!plane) throw new NotFoundError("aircraft");

  // Look back far enough to catch a long flight or job that started before the window.
  const lookBack = new Date(from.getTime() - 31 * 24 * HOUR);
  const [flightRows, jobs, blocks] = await Promise.all([
    db
      .select({
        id: flights.id,
        fromAirport: flights.fromAirport,
        toAirport: flights.toAirport,
        departsAt: flights.departsAt,
        arrivesAt: flights.arrivesAt,
        flightMinutes: flights.flightMinutes,
        ownerId: shares.ownerId,
        ownerName: owners.legalName,
      })
      .from(flights)
      .leftJoin(shares, eq(shares.id, flights.shareId))
      .leftJoin(owners, eq(owners.id, shares.ownerId))
      .where(
        and(
          eq(flights.aircraftId, aircraftId),
          ne(flights.status, "cancelled"),
          gt(flights.departsAt, lookBack),
          lt(flights.departsAt, to),
        ),
      ),
    db
      .select({
        id: maintenanceEvents.id,
        title: maintenanceEvents.title,
        startsAt: maintenanceEvents.startsAt,
        endsAt: maintenanceEvents.endsAt,
        status: maintenanceEvents.status,
      })
      .from(maintenanceEvents)
      .where(
        and(
          eq(maintenanceEvents.aircraftId, aircraftId),
          inArray(maintenanceEvents.status, ["planned", "in_progress", "done"]),
          lt(maintenanceEvents.startsAt, to),
          or(isNull(maintenanceEvents.endsAt), gt(maintenanceEvents.endsAt, from)),
        ),
      ),
    db
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.aircraftId, aircraftId),
          ne(availabilityBlocks.kind, "available"),
          lt(availabilityBlocks.startsAt, to),
          gt(availabilityBlocks.endsAt, from),
        ),
      )
      .orderBy(asc(availabilityBlocks.startsAt)),
  ]);

  const staff = isStaff(actor) && !ownerView;
  const periods: Period[] = [];
  for (const f of flightRows) {
    const endsAt =
      f.arrivesAt ?? new Date(f.departsAt.getTime() + (f.flightMinutes ? f.flightMinutes * 60_000 : DEFAULT_FLIGHT_MS));
    if (endsAt <= from) continue;
    const mine = !!f.ownerId && actor.ownerIds.includes(f.ownerId);
    periods.push(
      staff || mine
        ? {
            kind: "flight",
            startsAt: f.departsAt,
            endsAt,
            mine,
            label: `${f.fromAirport} → ${f.toAirport}`,
            ownerName: staff ? f.ownerName : null,
          }
        : { kind: "booked", startsAt: f.departsAt, endsAt, mine: false, label: null, ownerName: f.ownerName },
    );
  }
  for (const j of jobs) {
    // An open job with no end yet keeps the aircraft unavailable through the window.
    const endsAt = j.endsAt ?? (j.status === "in_progress" ? to : new Date(j.startsAt!.getTime() + 24 * HOUR));
    if (endsAt <= from) continue;
    periods.push({
      kind: "maintenance",
      startsAt: j.startsAt!,
      endsAt,
      mine: false,
      label: staff ? j.title : null,
      ownerName: null,
    });
  }
  for (const b of blocks)
    periods.push({
      kind: b.kind === "maintenance" ? "maintenance" : "booked",
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      mine: false,
      label: null,
      ownerName: null,
      blockId: staff && b.source === "manual" ? b.id : undefined,
    });
  periods.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { aircraft: plane, periods };
}

/**
 * The aircraft the signed-in owner holds a share in, with their share and
 * maintenance windows. Owners see only when the aircraft is in maintenance,
 * never what the work is.
 */
export async function listOwnerAircraft(db: Db, actor: Actor) {
  if (actor.ownerIds.length === 0) return [];
  authorize(actor, "fleet:read", { ownerIds: actor.ownerIds });
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: aircraft.id,
      registration: aircraft.registration,
      model: aircraft.model,
      serialNumber: aircraft.serialNumber,
      homeBase: aircraft.homeBase,
      status: aircraft.status,
      shareId: shares.id,
      percentageBp: shares.percentageBp,
      annualHoursMinutes: shares.annualHoursMinutes,
      startsOn: shares.startsOn,
      ownerName: owners.legalName,
    })
    .from(shares)
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .where(
      and(
        inArray(shares.ownerId, [...actor.ownerIds]),
        isNull(aircraft.deletedAt),
        or(isNull(shares.endsOn), gt(shares.endsOn, today)),
      ),
    )
    .orderBy(asc(aircraft.registration));
  if (rows.length === 0) return [];

  const jobs = await db
    .select({
      id: maintenanceEvents.id,
      aircraftId: maintenanceEvents.aircraftId,
      startsAt: maintenanceEvents.startsAt,
      endsAt: maintenanceEvents.endsAt,
      status: maintenanceEvents.status,
    })
    .from(maintenanceEvents)
    .where(
      and(
        inArray(
          maintenanceEvents.aircraftId,
          rows.map((r) => r.id),
        ),
        ne(maintenanceEvents.status, "cancelled"),
        isNotNull(maintenanceEvents.startsAt),
      ),
    )
    .orderBy(desc(maintenanceEvents.startsAt));

  return rows.map((r) => ({
    ...r,
    maintenance: jobs
      .filter((j) => j.aircraftId === r.id)
      .slice(0, 10)
      .map((j) => ({ ...j, startsAt: j.startsAt! })),
  }));
}

/** Blocks a period by hand (e.g. the aircraft is lent out, or a known outage). */
export async function addBlock(db: Db, actor: Actor, aircraftId: string, raw: BlockInput) {
  authorize(actor, "operations:write");
  const input = blockInput.parse(raw);
  return db.transaction(async (tx) => {
    const [plane] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(and(eq(aircraft.id, aircraftId), isNull(aircraft.deletedAt)));
    if (!plane) throw new NotFoundError("aircraft");
    const [row] = await tx
      .insert(availabilityBlocks)
      .values({ aircraftId, ...input })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "availability.block",
      entityType: "aircraft",
      entityId: aircraftId,
      after: { blockId: row!.id, ...input },
    });
    return row!;
  });
}

/** Removes a manual block. Blocks that came from the scheduling software are changed there. */
export async function removeBlock(db: Db, actor: Actor, id: string) {
  authorize(actor, "operations:write");
  return db.transaction(async (tx) => {
    const [block] = await tx.select().from(availabilityBlocks).where(eq(availabilityBlocks.id, id)).for("update");
    if (!block) throw new NotFoundError("block");
    if (block.source !== "manual") throw new ConflictError("block_is_synced");
    await tx.delete(availabilityBlocks).where(eq(availabilityBlocks.id, id));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "availability.unblock",
      entityType: "aircraft",
      entityId: block.aircraftId,
      before: block,
    });
  });
}
