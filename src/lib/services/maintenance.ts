/**
 * Maintenance events. Planned → in progress → done, or cancelled. Starting
 * work puts the aircraft in maintenance; finishing or cancelling the last
 * open job makes it available again. Planned windows block availability.
 */
import "server-only";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { aircraft, maintenanceEvents, shares } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { maintenanceInput, type MaintenanceInput } from "@/lib/validation/operations";
import { OPERATOR_TIME_ZONE } from "@/lib/time";
import { recordAudit } from "./audit";
import { notifyOwnerMembers, sendPendingEmails, type PendingEmail } from "./owner-notifications";
import { ConflictError, NotFoundError } from "./errors";

export type MaintenanceStatus = (typeof maintenanceEvents.$inferSelect)["status"];

/** Which status each status may move to. */
export const NEXT_STATUS: Record<MaintenanceStatus, readonly MaintenanceStatus[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

const columns = {
  id: maintenanceEvents.id,
  aircraftId: maintenanceEvents.aircraftId,
  registration: aircraft.registration,
  type: maintenanceEvents.type,
  title: maintenanceEvents.title,
  dueOn: maintenanceEvents.dueOn,
  startsAt: maintenanceEvents.startsAt,
  endsAt: maintenanceEvents.endsAt,
  status: maintenanceEvents.status,
  notes: maintenanceEvents.notes,
  source: maintenanceEvents.source,
};

const soonestFirst = sql`coalesce(${maintenanceEvents.startsAt}, ${maintenanceEvents.dueOn}::timestamptz) asc nulls last`;

/** Open jobs first (soonest first), then the latest finished ones. */
export async function listMaintenance(db: Db, actor: Actor, opts: { aircraftId?: string } = {}) {
  authorize(actor, "fleet:read");
  const scope = and(
    isNull(aircraft.deletedAt),
    opts.aircraftId ? eq(maintenanceEvents.aircraftId, opts.aircraftId) : undefined,
  );
  const q = () =>
    db.select(columns).from(maintenanceEvents).innerJoin(aircraft, eq(aircraft.id, maintenanceEvents.aircraftId));
  const [open, closed] = await Promise.all([
    q()
      .where(and(scope, inArray(maintenanceEvents.status, ["planned", "in_progress"])))
      .orderBy(soonestFirst),
    q()
      .where(and(scope, inArray(maintenanceEvents.status, ["done", "cancelled"])))
      .orderBy(desc(maintenanceEvents.updatedAt))
      .limit(50),
  ]);
  return { open, closed };
}

export async function getMaintenance(db: Db, actor: Actor, id: string) {
  authorize(actor, "fleet:read");
  const [row] = await db
    .select(columns)
    .from(maintenanceEvents)
    .innerJoin(aircraft, eq(aircraft.id, maintenanceEvents.aircraftId))
    .where(eq(maintenanceEvents.id, id));
  if (!row) throw new NotFoundError("maintenance");
  return row;
}

export async function planMaintenance(db: Db, actor: Actor, raw: MaintenanceInput) {
  authorize(actor, "operations:write");
  const input = maintenanceInput.parse(raw);
  const { row, emails } = await db.transaction(async (tx) => {
    const [plane] = await tx
      .select({ id: aircraft.id, registration: aircraft.registration })
      .from(aircraft)
      .where(and(eq(aircraft.id, input.aircraftId), isNull(aircraft.deletedAt)));
    if (!plane) throw new NotFoundError("aircraft");
    const [row] = await tx.insert(maintenanceEvents).values(input).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "maintenance.plan",
      entityType: "maintenance",
      entityId: row.id,
      after: input,
    });
    // Owners hear about work that will take their aircraft out of service.
    const emails: PendingEmail[] = [];
    if (input.startsAt) {
      const holders = await tx
        .selectDistinct({ ownerId: shares.ownerId })
        .from(shares)
        .where(and(eq(shares.aircraftId, input.aircraftId), activeShare()));
      const when = new Intl.DateTimeFormat("fr-CA", {
        timeZone: OPERATOR_TIME_ZONE,
        dateStyle: "long",
      }).format(input.startsAt);
      for (const h of holders)
        emails.push(
          ...(await notifyOwnerMembers(
            tx,
            h.ownerId,
            "maintenance.planned",
            { aircraft: plane.registration, title: input.title, when },
            { template: "maintenancePlanned", path: "/aircraft" },
          )),
        );
    }
    return { row, emails };
  });
  await sendPendingEmails(db, emails);
  return row;
}

const activeShare = () => or(isNull(shares.endsOn), gt(shares.endsOn, sql`current_date`));

/** Edits an open job. The aircraft can't change; finished jobs are history. */
export async function updateMaintenance(db: Db, actor: Actor, id: string, raw: MaintenanceInput) {
  authorize(actor, "operations:write");
  const input = maintenanceInput.parse(raw);
  return db.transaction(async (tx) => {
    const before = await lock(tx, id);
    if (before.status === "done" || before.status === "cancelled") throw new ConflictError("maintenance_closed");
    if (before.aircraftId !== input.aircraftId) throw new ConflictError("maintenance_aircraft_fixed");
    const [row] = await tx.update(maintenanceEvents).set(input).where(eq(maintenanceEvents.id, id)).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "maintenance.update",
      entityType: "maintenance",
      entityId: id,
      before,
      after: input,
    });
    return row;
  });
}

export async function setMaintenanceStatus(db: Db, actor: Actor, id: string, status: MaintenanceStatus) {
  authorize(actor, "operations:write");
  return db.transaction(async (tx) => {
    const before = await lock(tx, id);
    const row = await applyMaintenanceStatus(tx, before, status);
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "maintenance.status",
      entityType: "maintenance",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
    return row;
  });
}

async function lock(tx: Tx, id: string) {
  const [row] = await tx.select().from(maintenanceEvents).where(eq(maintenanceEvents.id, id)).for("update");
  if (!row) throw new NotFoundError("maintenance");
  return row;
}

/**
 * Moves a locked job to a new status and keeps the aircraft's status in step.
 * Shared by the back office and the scheduling sync.
 */
export async function applyMaintenanceStatus(
  tx: Tx,
  event: typeof maintenanceEvents.$inferSelect,
  status: MaintenanceStatus,
) {
  if (!NEXT_STATUS[event.status].includes(status)) throw new ConflictError("invalid_transition");
  const now = new Date();
  const [row] = await tx
    .update(maintenanceEvents)
    .set({
      status,
      // Record when work actually started and ended, unless the planner already said.
      startsAt: status === "in_progress" && !event.startsAt ? now : event.startsAt,
      endsAt: status === "done" && (!event.endsAt || event.endsAt > now) ? now : event.endsAt,
    })
    .where(eq(maintenanceEvents.id, event.id))
    .returning();
  await syncAircraftStatus(tx, event.aircraftId);
  return row!;
}

/** In maintenance while any job is in progress; back to available when the last one closes. */
export async function syncAircraftStatus(tx: Tx, aircraftId: string) {
  const [plane] = await tx
    .select({ status: aircraft.status })
    .from(aircraft)
    .where(eq(aircraft.id, aircraftId))
    .for("update");
  if (!plane || plane.status === "inactive") return;
  const [open] = await tx
    .select({ id: maintenanceEvents.id })
    .from(maintenanceEvents)
    .where(and(eq(maintenanceEvents.aircraftId, aircraftId), eq(maintenanceEvents.status, "in_progress")))
    .limit(1);
  if (open && plane.status !== "maintenance")
    await tx.update(aircraft).set({ status: "maintenance" }).where(eq(aircraft.id, aircraftId));
  if (!open && plane.status === "maintenance")
    await tx.update(aircraft).set({ status: "available" }).where(eq(aircraft.id, aircraftId));
}
