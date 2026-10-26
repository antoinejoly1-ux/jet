/**
 * Flights. A flight is scheduled, then completed or cancelled. Completing it
 * deducts its block time from the share's hours in the same transaction;
 * cancelling a completed flight gives those hours back with a reversing
 * entry, so the hour ledger stays append-only.
 */
import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { aircraft, flights, hourLedger, owners, shares } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import {
  completeFlightInput,
  flightInput,
  type CompleteFlightInput,
  type FlightInput,
} from "@/lib/validation/operations";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

type Flight = typeof flights.$inferSelect;

const columns = {
  id: flights.id,
  aircraftId: flights.aircraftId,
  registration: aircraft.registration,
  shareId: flights.shareId,
  ownerName: owners.legalName,
  fromAirport: flights.fromAirport,
  toAirport: flights.toAirport,
  departsAt: flights.departsAt,
  arrivesAt: flights.arrivesAt,
  blockMinutes: flights.blockMinutes,
  status: flights.status,
  source: flights.source,
};

const base = (db: Db) =>
  db
    .select(columns)
    .from(flights)
    .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
    .leftJoin(shares, eq(shares.id, flights.shareId))
    .leftJoin(owners, eq(owners.id, shares.ownerId));

/** Flights in a time window for the back office, earliest first. */
export async function listFlights(
  db: Db,
  actor: Actor,
  opts: { from: Date; to: Date; aircraftId?: string; status?: string },
) {
  authorize(actor, "fleet:read");
  const filters: SQL[] = [gte(flights.departsAt, opts.from), lt(flights.departsAt, opts.to)];
  if (opts.aircraftId) filters.push(eq(flights.aircraftId, opts.aircraftId));
  if (opts.status === "scheduled" || opts.status === "completed" || opts.status === "cancelled")
    filters.push(eq(flights.status, opts.status));
  return base(db)
    .where(and(...filters))
    .orderBy(asc(flights.departsAt))
    .limit(1000);
}

export async function getFlight(db: Db, actor: Actor, id: string) {
  authorize(actor, "fleet:read");
  const [row] = await base(db).where(eq(flights.id, id));
  if (!row) throw new NotFoundError("flight");
  return row;
}

/** The signed-in owner's own flights (on their shares): upcoming soonest first, past latest first. */
export async function listOwnerFlights(db: Db, actor: Actor) {
  if (actor.ownerIds.length === 0) return { upcoming: [], past: [] };
  authorize(actor, "fleet:read", { ownerIds: actor.ownerIds });
  const mine = and(inArray(shares.ownerId, [...actor.ownerIds]), isNull(aircraft.deletedAt));
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    base(db)
      .where(and(mine, gte(flights.departsAt, now)))
      .orderBy(asc(flights.departsAt)),
    base(db)
      .where(and(mine, lt(flights.departsAt, now)))
      .orderBy(desc(flights.departsAt))
      .limit(200),
  ]);
  return { upcoming, past };
}

/** Checks the aircraft exists and, if given, that the share is an active share in it. */
async function assertAircraftAndShare(tx: Tx, aircraftId: string, shareId: string | null, at: Date) {
  const [plane] = await tx
    .select({ id: aircraft.id })
    .from(aircraft)
    .where(and(eq(aircraft.id, aircraftId), isNull(aircraft.deletedAt)));
  if (!plane) throw new NotFoundError("aircraft");
  if (!shareId) return;
  const [share] = await tx
    .select({ aircraftId: shares.aircraftId, endsOn: shares.endsOn })
    .from(shares)
    .where(eq(shares.id, shareId));
  if (!share) throw new NotFoundError("share");
  if (share.aircraftId !== aircraftId) throw new ConflictError("share_not_on_aircraft");
  if (share.endsOn && share.endsOn <= at.toISOString().slice(0, 10)) throw new ConflictError("share_ended");
}

export async function scheduleFlight(db: Db, actor: Actor, raw: FlightInput) {
  authorize(actor, "operations:write");
  const input = flightInput.parse(raw);
  return db.transaction(async (tx) => {
    await assertAircraftAndShare(tx, input.aircraftId, input.shareId, input.departsAt);
    const [row] = await tx.insert(flights).values(input).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "flight.schedule",
      entityType: "flight",
      entityId: row.id,
      after: input,
    });
    return row;
  });
}

/** Changes a scheduled flight. Completed and cancelled flights are history and can't be edited. */
export async function updateFlight(db: Db, actor: Actor, id: string, raw: FlightInput) {
  authorize(actor, "operations:write");
  const input = flightInput.parse(raw);
  return db.transaction(async (tx) => {
    const before = await lockFlight(tx, id);
    if (before.status !== "scheduled") throw new ConflictError("flight_not_scheduled");
    await assertAircraftAndShare(tx, input.aircraftId, input.shareId, input.departsAt);
    const [row] = await tx.update(flights).set(input).where(eq(flights.id, id)).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "flight.update",
      entityType: "flight",
      entityId: id,
      before,
      after: input,
    });
    return row;
  });
}

export async function completeFlight(db: Db, actor: Actor, id: string, raw: CompleteFlightInput) {
  authorize(actor, "operations:write");
  const input = completeFlightInput.parse(raw);
  return db.transaction(async (tx) => {
    const flight = await lockFlight(tx, id);
    // Guards against completing the wrong row; the scheduling sync trusts the vendor instead.
    if (flight.status === "scheduled" && flight.departsAt > new Date()) throw new ConflictError("flight_not_departed");
    const row = await applyCompletion(tx, flight, input.blockTime, input.arrivesAt, actor.id);
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "flight.complete",
      entityType: "flight",
      entityId: id,
      after: { blockMinutes: input.blockTime },
    });
    return row;
  });
}

export async function cancelFlight(db: Db, actor: Actor, id: string, reason: string) {
  authorize(actor, "operations:write");
  return db.transaction(async (tx) => {
    const flight = await lockFlight(tx, id);
    const row = await applyCancellation(tx, flight, reason, actor.id);
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "flight.cancel",
      entityType: "flight",
      entityId: id,
      before: { status: flight.status, blockMinutes: flight.blockMinutes },
      after: { reason: reason.trim() || null },
    });
    return row;
  });
}

export async function lockFlight(tx: Tx, id: string): Promise<Flight> {
  const [flight] = await tx.select().from(flights).where(eq(flights.id, id)).for("update");
  if (!flight) throw new NotFoundError("flight");
  return flight;
}

/**
 * Marks a locked, scheduled flight completed and deducts its block time from
 * the share's hours. Shared by the dispatcher's form and the scheduling sync.
 */
export async function applyCompletion(
  tx: Tx,
  flight: Flight,
  blockMinutes: number,
  arrivesAt: Date | null,
  actorUserId: string | null,
): Promise<Flight> {
  if (flight.status !== "scheduled") throw new ConflictError("flight_not_scheduled");
  const arrival = arrivesAt ?? flight.arrivesAt ?? new Date(flight.departsAt.getTime() + blockMinutes * 60_000);
  if (arrival <= flight.departsAt) throw new ConflictError("arrival_before_departure");
  const [row] = await tx
    .update(flights)
    .set({ status: "completed", blockMinutes, arrivesAt: arrival })
    .where(eq(flights.id, flight.id))
    .returning();
  if (flight.shareId)
    await tx.insert(hourLedger).values({
      shareId: flight.shareId,
      kind: "flight",
      minutes: -blockMinutes,
      flightId: flight.id,
      createdByUserId: actorUserId,
    });
  return row!;
}

/** Cancels a locked flight. If it was completed, its hours go back to the share as an adjustment. */
export async function applyCancellation(
  tx: Tx,
  flight: Flight,
  reason: string,
  actorUserId: string | null,
): Promise<Flight> {
  if (flight.status === "cancelled") throw new ConflictError("flight_already_cancelled");
  if (flight.status === "completed" && flight.shareId) {
    const used = await tx
      .select({ minutes: hourLedger.minutes })
      .from(hourLedger)
      .where(eq(hourLedger.flightId, flight.id));
    const net = used.reduce((n, e) => n + e.minutes, 0);
    if (net !== 0)
      await tx.insert(hourLedger).values({
        shareId: flight.shareId,
        kind: "adjustment",
        minutes: -net,
        flightId: flight.id,
        note: reason.trim() || null,
        createdByUserId: actorUserId,
      });
  }
  const [row] = await tx.update(flights).set({ status: "cancelled" }).where(eq(flights.id, flight.id)).returning();
  return row!;
}

/** Active shares, for the "whose hours" picker. Dispatchers need it without finance access. */
export async function listFlightShareOptions(db: Db, actor: Actor) {
  authorize(actor, "fleet:read");
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select({
      id: shares.id,
      aircraftId: shares.aircraftId,
      ownerName: owners.legalName,
      percentageBp: shares.percentageBp,
    })
    .from(shares)
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .where(and(isNull(owners.deletedAt), or(isNull(shares.endsOn), gt(shares.endsOn, today))))
    .orderBy(asc(owners.legalName));
}
