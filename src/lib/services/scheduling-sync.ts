/**
 * Pulls flights, maintenance and blocks from the scheduling software. Safe to
 * run any number of times: records are matched by the vendor's id, unchanged
 * ones are left alone, and hours follow the same rules as a manual change
 * (completing deducts, cancelling gives back, a corrected block time is a
 * reversing adjustment). Each record commits on its own, so one bad record
 * is reported without blocking the rest.
 */
import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import {
  aircraft,
  availabilityBlocks,
  externalRefs,
  flights,
  hourLedger,
  integrations,
  maintenanceEvents,
  notifications,
  shares,
  syncRuns,
  user,
} from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import type {
  ExternalBlock,
  ExternalFlight,
  ExternalMaintenance,
  SchedulingAdapter,
} from "@/lib/integrations/scheduling/types";
import { recordAudit } from "./audit";
import { ConflictError } from "./errors";
import { applyCancellation, applyCompletion } from "./flights";
import { alertIfHoursLow } from "./hour-alerts";
import { syncAircraftStatus } from "./maintenance";
import { sendPendingEmails, type PendingEmail } from "./owner-notifications";

type Outcome = "created" | "updated" | "unchanged";
export type SyncCounts = Record<"created" | "updated" | "unchanged" | "failed", number>;
export type SyncError = { entity: "flight" | "maintenance" | "block"; externalId: string; code: string };
export type SyncResult = { runId: string; counts: SyncCounts; errors: SyncError[] };

class SkipRecord extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** Runs one pull. `actor` is null when a scheduled job runs it. */
export async function syncScheduling(db: Db, actor: Actor | null, adapter: SchedulingAdapter): Promise<SyncResult> {
  if (actor) authorize(actor, "integrations:manage");
  const provider = adapter.provider;
  const startedAt = new Date();
  const [integration] = await db
    .insert(integrations)
    .values({ provider, status: "connected" })
    .onConflictDoUpdate({ target: integrations.provider, set: { updatedAt: startedAt } })
    .returning();
  const [run] = await db.insert(syncRuns).values({ provider, direction: "pull", startedAt }).returning();

  const counts: SyncCounts = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  const errors: SyncError[] = [];
  const finish = async (status: "connected" | "error") => {
    await db.update(syncRuns).set({ finishedAt: new Date(), counts, errors }).where(eq(syncRuns.id, run!.id));
    if (errors.length) {
      // Admins and finance hear about records that couldn't be placed, or a vendor that didn't answer.
      const people = await db
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.staffRole, ["admin", "finance"]));
      if (people.length)
        await db.insert(notifications).values(
          people.map((p) => ({
            userId: p.id,
            type: "sync.failed",
            data: { provider, failed: String(errors.length) },
          })),
        );
    }
    await db
      .update(integrations)
      .set({ status, ...(status === "connected" ? { lastSyncedAt: startedAt } : {}) })
      .where(eq(integrations.provider, provider));
    return { runId: run!.id, counts, errors };
  };

  let changes;
  try {
    changes = await adapter.fetchChanges(integration!.lastSyncedAt);
  } catch (err) {
    console.error(`[sync] ${provider} fetch failed`, err);
    errors.push({ entity: "flight", externalId: "*", code: "fetch_failed" });
    return finish("error");
  }

  const planes = await db
    .select({ id: aircraft.id, registration: aircraft.registration })
    .from(aircraft)
    .where(isNull(aircraft.deletedAt));
  const aircraftByReg = new Map(planes.map((p) => [p.registration.toUpperCase(), p.id]));
  const aircraftId = (registration: string) => {
    const id = aircraftByReg.get(registration.trim().toUpperCase());
    if (!id) throw new SkipRecord("unknown_aircraft");
    return id;
  };
  const ctx: Ctx = { provider, actorUserId: actor?.id ?? null, aircraftId, emails: [] };

  const each = async <T extends { id: string }>(
    entity: SyncError["entity"],
    records: T[],
    apply: (tx: Tx, record: T) => Promise<Outcome>,
  ) => {
    for (const record of records) {
      const queued = ctx.emails.length;
      try {
        counts[await db.transaction((tx) => apply(tx, record))]++;
      } catch (err) {
        ctx.emails.length = queued; // the record rolled back, so its emails don't go out
        if (!(err instanceof SkipRecord || err instanceof ConflictError)) throw err;
        counts.failed++;
        errors.push({ entity, externalId: record.id, code: err.code });
      }
    }
  };
  await each("flight", changes.flights, (tx, f) => upsertFlight(tx, f, ctx));
  await each("maintenance", changes.maintenance, (tx, m) => upsertMaintenance(tx, m, ctx));
  await each("block", changes.blocks, (tx, b) => upsertBlock(tx, b, ctx));
  await sendPendingEmails(db, ctx.emails);
  return finish("connected");
}

type Ctx = {
  provider: string;
  actorUserId: string | null;
  aircraftId: (registration: string) => string;
  /** Emails to send once records have committed. */
  emails: PendingEmail[];
};

/** Vendor ids are namespaced so two providers can never collide. */
const key = (ctx: Ctx, id: string) => `${ctx.provider}:${id}`;

async function shareFor(tx: Tx, ctx: Ctx, shareRef: string | null, planeId: string) {
  if (!shareRef) return null;
  const [ref] = await tx
    .select({ shareId: shares.id, aircraftId: shares.aircraftId })
    .from(externalRefs)
    .innerJoin(shares, eq(shares.id, externalRefs.localId))
    .where(
      and(
        eq(externalRefs.entityType, "share"),
        eq(externalRefs.provider, ctx.provider),
        eq(externalRefs.externalId, shareRef),
      ),
    );
  if (!ref) throw new SkipRecord("unknown_share");
  if (ref.aircraftId !== planeId) throw new SkipRecord("share_not_on_aircraft");
  return ref.shareId;
}

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

async function upsertFlight(tx: Tx, f: ExternalFlight, ctx: Ctx): Promise<Outcome> {
  const planeId = ctx.aircraftId(f.registration);
  const shareId = await shareFor(tx, ctx, f.shareRef, planeId);
  const externalId = key(ctx, f.id);
  const fields = {
    aircraftId: planeId,
    shareId,
    fromAirport: f.fromAirport.toUpperCase(),
    toAirport: f.toAirport.toUpperCase(),
    departsAt: f.departsAt,
  };
  if (f.status === "completed" && !f.blockMinutes) throw new SkipRecord("missing_block_time");

  let [local] = await tx.select().from(flights).where(eq(flights.externalId, externalId)).for("update");
  let outcome: Outcome = "unchanged";
  if (!local) {
    [local] = await tx
      .insert(flights)
      .values({ ...fields, arrivesAt: f.arrivesAt, source: "sync", externalId, status: "scheduled" })
      .returning();
    outcome = "created";
  } else if (local.status === "scheduled") {
    const changed =
      local.aircraftId !== fields.aircraftId ||
      local.shareId !== fields.shareId ||
      local.fromAirport !== fields.fromAirport ||
      local.toAirport !== fields.toAirport ||
      !sameTime(local.departsAt, fields.departsAt) ||
      !sameTime(local.arrivesAt, f.arrivesAt);
    if (changed) {
      [local] = await tx
        .update(flights)
        .set({ ...fields, arrivesAt: f.arrivesAt })
        .where(eq(flights.id, local.id))
        .returning();
      outcome = "updated";
    }
  } else if (local.status === "cancelled") {
    // Cancelled is final here; a flight that comes back is a new flight in the vendor's system.
    if (f.status !== "cancelled") throw new SkipRecord("flight_cancelled_locally");
    return "unchanged";
  }
  local = local!;

  if (local.status === "scheduled" && f.status === "completed") {
    local = await applyCompletion(tx, local, f.blockMinutes!, f.arrivesAt, ctx.actorUserId);
    if (local.shareId) ctx.emails.push(...(await alertIfHoursLow(tx, local.shareId, f.blockMinutes!)));
    outcome = outcome === "created" ? "created" : "updated";
  } else if (local.status === "completed" && f.status === "completed" && local.blockMinutes !== f.blockMinutes) {
    await correctBlockTime(tx, local, f.blockMinutes!, ctx.actorUserId);
    outcome = "updated";
  } else if (local.status === "completed" && f.status === "scheduled") {
    throw new SkipRecord("flight_already_completed");
  } else if (f.status === "cancelled" && local.status !== "cancelled") {
    await applyCancellation(tx, local, "", ctx.actorUserId);
    outcome = outcome === "created" ? "created" : "updated";
  }

  if (outcome !== "unchanged")
    await recordAudit(tx, {
      actorUserId: ctx.actorUserId,
      action: `sync.flight.${outcome}`,
      entityType: "flight",
      entityId: local.id,
      after: { provider: ctx.provider, externalId: f.id, status: f.status, blockMinutes: f.blockMinutes },
    });
  return outcome;
}

/** The vendor changed a completed flight's block time: adjust the hours by the difference. */
async function correctBlockTime(
  tx: Tx,
  flight: typeof flights.$inferSelect,
  blockMinutes: number,
  actorUserId: string | null,
) {
  if (flight.shareId)
    await tx.insert(hourLedger).values({
      shareId: flight.shareId,
      kind: "adjustment",
      minutes: (flight.blockMinutes ?? 0) - blockMinutes,
      flightId: flight.id,
      note: "block_time_corrected",
      createdByUserId: actorUserId,
    });
  await tx.update(flights).set({ blockMinutes }).where(eq(flights.id, flight.id));
}

async function upsertMaintenance(tx: Tx, m: ExternalMaintenance, ctx: Ctx): Promise<Outcome> {
  const planeId = ctx.aircraftId(m.registration);
  const externalId = key(ctx, m.id);
  const fields = {
    aircraftId: planeId,
    type: m.type,
    title: m.title,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    status: m.status,
  };
  const [local] = await tx
    .select()
    .from(maintenanceEvents)
    .where(eq(maintenanceEvents.externalId, externalId))
    .for("update");
  let id: string;
  let outcome: Outcome;
  if (!local) {
    const [row] = await tx
      .insert(maintenanceEvents)
      .values({ ...fields, source: "sync", externalId })
      .returning();
    id = row!.id;
    outcome = "created";
  } else {
    const changed =
      local.aircraftId !== planeId ||
      local.type !== m.type ||
      local.title !== m.title ||
      local.status !== m.status ||
      !sameTime(local.startsAt, m.startsAt) ||
      !sameTime(local.endsAt, m.endsAt);
    if (!changed) return "unchanged";
    await tx.update(maintenanceEvents).set(fields).where(eq(maintenanceEvents.id, local.id));
    id = local.id;
    outcome = "updated";
    // A job moved to another aircraft releases the first one too.
    if (local.aircraftId !== planeId) await syncAircraftStatus(tx, local.aircraftId);
  }
  await syncAircraftStatus(tx, planeId);
  await recordAudit(tx, {
    actorUserId: ctx.actorUserId,
    action: `sync.maintenance.${outcome}`,
    entityType: "maintenance",
    entityId: id,
    after: { provider: ctx.provider, externalId: m.id, status: m.status },
  });
  return outcome;
}

async function upsertBlock(tx: Tx, b: ExternalBlock, ctx: Ctx): Promise<Outcome> {
  const planeId = ctx.aircraftId(b.registration);
  if (b.endsAt <= b.startsAt) throw new SkipRecord("invalid_range");
  const externalId = key(ctx, b.id);
  const fields = { aircraftId: planeId, startsAt: b.startsAt, endsAt: b.endsAt, kind: b.kind };
  const [local] = await tx
    .select()
    .from(availabilityBlocks)
    .where(eq(availabilityBlocks.externalId, externalId))
    .for("update");
  let id: string;
  let outcome: Outcome;
  if (!local) {
    const [row] = await tx
      .insert(availabilityBlocks)
      .values({ ...fields, source: "sync", externalId })
      .returning();
    id = row!.id;
    outcome = "created";
  } else {
    const changed =
      local.aircraftId !== planeId ||
      local.kind !== b.kind ||
      !sameTime(local.startsAt, b.startsAt) ||
      !sameTime(local.endsAt, b.endsAt);
    if (!changed) return "unchanged";
    await tx.update(availabilityBlocks).set(fields).where(eq(availabilityBlocks.id, local.id));
    id = local.id;
    outcome = "updated";
  }
  await recordAudit(tx, {
    actorUserId: ctx.actorUserId,
    action: `sync.block.${outcome}`,
    entityType: "aircraft",
    entityId: planeId,
    after: { provider: ctx.provider, externalId: b.id, blockId: id },
  });
  return outcome;
}

/** Links a share to the vendor's id for it, so synced flights find whose hours to use. */
export async function linkShare(db: Db, actor: Actor, shareId: string, provider: string, externalId: string) {
  authorize(actor, "integrations:manage");
  return db.transaction(async (tx) => {
    await tx
      .insert(externalRefs)
      .values({ entityType: "share", localId: shareId, provider, externalId: externalId.trim() })
      .onConflictDoUpdate({
        target: [externalRefs.entityType, externalRefs.localId, externalRefs.provider],
        set: { externalId: externalId.trim() },
      });
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "integration.link_share",
      entityType: "share",
      entityId: shareId,
      after: { provider, externalId },
    });
  });
}

/** Connection status and the latest runs, for Settings → Integrations. */
export async function getIntegrationStatus(db: Db, actor: Actor) {
  authorize(actor, "integrations:manage");
  const [all, runs] = await Promise.all([
    db.select().from(integrations),
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(10),
  ]);
  return {
    integrations: all.map(({ encryptedCredentials: _secret, ...rest }) => rest),
    recentRuns: runs,
  };
}
