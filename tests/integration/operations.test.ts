import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { aircraft, auditLog, flights, ownerMembers, syncRuns, user } from "@/lib/db/schema";
import { FakeSchedulingAdapter } from "@/lib/integrations/scheduling/fake";
import { addShare, createAircraft, endShare } from "@/lib/services/aircraft";
import { addBlock, getAvailability, listOwnerAircraft, removeBlock } from "@/lib/services/availability";
import { cancelFlight, completeFlight, listOwnerFlights, scheduleFlight, updateFlight } from "@/lib/services/flights";
import { addHours, listHours } from "@/lib/services/ledger";
import { planMaintenance, setMaintenanceStatus } from "@/lib/services/maintenance";
import { createOwner } from "@/lib/services/owners";
import { getIntegrationStatus, linkShare, syncScheduling } from "@/lib/services/scheduling-sync";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let finance: Actor;
let planeId: string;
let ownerA: { actor: Actor; ownerId: string; shareId: string };
let ownerB: { actor: Actor; ownerId: string; shareId: string };

async function staff(role: "admin" | "finance" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function ownerWithShare(name: string, aircraftId: string, percent: number) {
  const o = await createOwner(db, admin, { type: "person", legalName: name, locale: "fr" });
  const s = await addShare(db, admin, aircraftId, { ownerId: o.id, percent, startsOn: "2025-01-01" });
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@example.com`, emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: o.id, userId: u!.id });
  return { actor: { id: u!.id, staffRole: null, ownerIds: [o.id] } satisfies Actor, ownerId: o.id, shareId: s.id };
}

/** Flights default to one that has already flown, so it can be completed. */
const flight = (shareId: string | null, departsAt = "2026-10-10T08:30") => ({
  aircraftId: planeId,
  shareId: shareId ?? "",
  fromAirport: "cyul",
  toAirport: "KPBI",
  departsAt,
  arrivesAt: "",
});

const balance = async (shareId: string) => (await listHours(db, finance, shareId)).balanceMinutes;

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  dispatcher = await staff("dispatcher");
  finance = await staff("finance");
  const plane = await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-24", status: "available" });
  planeId = plane.id;
  ownerA = await ownerWithShare("Anne", planeId, 50);
  ownerB = await ownerWithShare("Bruno", planeId, 25);
  await addHours(db, finance, ownerA.shareId, { kind: "purchase", hours: "50" });
});

describe("flights and hours", () => {
  it("schedules in Montreal time, then completing deducts flight time once", async () => {
    const f = await scheduleFlight(db, dispatcher, flight(ownerA.shareId));
    expect(f.departsAt.toISOString()).toBe("2026-10-10T12:30:00.000Z");
    expect(f.fromAirport).toBe("CYUL");
    expect(await balance(ownerA.shareId)).toBe(3000);

    const done = await completeFlight(db, dispatcher, f.id, { flightTime: "2:15", arrivesAt: "" });
    expect(done.status).toBe("completed");
    expect(done.flightMinutes).toBe(135);
    expect(done.arrivesAt!.toISOString()).toBe("2026-10-10T14:45:00.000Z");
    expect(await balance(ownerA.shareId)).toBe(3000 - 135);

    await expect(completeFlight(db, dispatcher, f.id, { flightTime: "1:00", arrivesAt: "" })).rejects.toMatchObject({
      code: "flight_not_scheduled",
    });
    await expect(updateFlight(db, dispatcher, f.id, flight(ownerA.shareId))).rejects.toMatchObject({
      code: "flight_not_scheduled",
    });
    expect(await balance(ownerA.shareId)).toBe(3000 - 135);
  });

  it("cancelling a completed flight gives the hours back with a reversing entry", async () => {
    const f = await scheduleFlight(db, dispatcher, flight(ownerA.shareId));
    await completeFlight(db, dispatcher, f.id, { flightTime: "1.5", arrivesAt: "" });
    await cancelFlight(db, dispatcher, f.id, "Saisie en double");
    expect(await balance(ownerA.shareId)).toBe(3000);

    const { entries } = await listHours(db, finance, ownerA.shareId);
    expect(entries.map((e) => [e.kind, e.minutes]).sort()).toEqual([
      ["adjustment", 90],
      ["flight", -90],
      ["purchase", 3000],
    ]);
    await expect(cancelFlight(db, dispatcher, f.id, "")).rejects.toMatchObject({ code: "flight_already_cancelled" });
  });

  it("cancelling a scheduled flight touches no hours; positioning flights have no share", async () => {
    const f = await scheduleFlight(db, dispatcher, flight(ownerA.shareId));
    await cancelFlight(db, dispatcher, f.id, "");
    const positioning = await scheduleFlight(db, dispatcher, flight(null));
    await completeFlight(db, dispatcher, positioning.id, { flightTime: "0:45", arrivesAt: "" });
    expect(await balance(ownerA.shareId)).toBe(3000);
  });

  it("rejects a share from another aircraft, an ended share, and bad input", async () => {
    const other = await createAircraft(db, admin, { registration: "C-FOTH", model: "CJ4", status: "available" });
    await expect(
      scheduleFlight(db, dispatcher, { ...flight(ownerA.shareId), aircraftId: other.id }),
    ).rejects.toMatchObject({ code: "share_not_on_aircraft" });
    await endShare(db, admin, ownerB.shareId, { endsOn: "2026-06-30" });
    await expect(scheduleFlight(db, dispatcher, flight(ownerB.shareId))).rejects.toMatchObject({ code: "share_ended" });
    await expect(scheduleFlight(db, dispatcher, flight(ownerA.shareId, "2026-13-01T08:00"))).rejects.toThrow();
    const f = await scheduleFlight(db, dispatcher, flight(ownerA.shareId));
    await expect(completeFlight(db, dispatcher, f.id, { flightTime: "abc", arrivesAt: "" })).rejects.toThrow();
  });

  it("won't complete a flight that hasn't departed", async () => {
    const f = await scheduleFlight(db, dispatcher, flight(ownerA.shareId, "2030-01-10T09:00"));
    await expect(completeFlight(db, dispatcher, f.id, { flightTime: "1:00", arrivesAt: "" })).rejects.toMatchObject({
      code: "flight_not_departed",
    });
  });

  it("writes an audit entry with each change", async () => {
    const f = await scheduleFlight(db, dispatcher, flight(ownerA.shareId));
    await completeFlight(db, dispatcher, f.id, { flightTime: "1:00", arrivesAt: "" });
    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, f.id))).map((a) => a.action);
    expect(actions.sort()).toEqual(["flight.complete", "flight.schedule"]);
  });

  it("lets only operations staff write, and owners read only their own flights", async () => {
    await expect(scheduleFlight(db, ownerA.actor, flight(ownerA.shareId))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(scheduleFlight(db, finance, flight(ownerA.shareId))).resolves.toBeTruthy();

    await scheduleFlight(db, dispatcher, flight(ownerB.shareId, "2030-01-10T09:00"));
    await scheduleFlight(db, dispatcher, flight(ownerA.shareId, "2030-01-12T09:00"));
    const mine = await listOwnerFlights(db, ownerA.actor);
    // Anne's flights (the past one finance scheduled, the 2030 one), never Bruno's.
    expect(mine.upcoming.map((f) => f.departsAt.toISOString())).toEqual(["2030-01-12T14:00:00.000Z"]);
    expect(mine.past.map((f) => f.shareId)).toEqual([ownerA.shareId]);
  });
});

describe("maintenance", () => {
  it("moves the aircraft in and out of maintenance and refuses invalid transitions", async () => {
    const job = await planMaintenance(db, dispatcher, {
      aircraftId: planeId,
      type: "inspection",
      title: "Inspection de 600 heures",
      startsAt: "2026-11-20T08:00",
      endsAt: "2026-11-23T17:00",
    });
    const status = async () => (await db.select().from(aircraft).where(eq(aircraft.id, planeId)))[0]!.status;
    expect(await status()).toBe("available");

    await setMaintenanceStatus(db, dispatcher, job.id, "in_progress");
    expect(await status()).toBe("maintenance");
    await expect(setMaintenanceStatus(db, dispatcher, job.id, "planned")).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await setMaintenanceStatus(db, dispatcher, job.id, "done");
    expect(await status()).toBe("available");
    await expect(setMaintenanceStatus(db, dispatcher, job.id, "cancelled")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
});

describe("availability", () => {
  const from = new Date("2026-11-01T04:00:00Z");
  const to = new Date("2026-12-01T05:00:00Z");

  it("shows owners their own flights and only 'booked' for co-owners'", async () => {
    await scheduleFlight(db, dispatcher, flight(ownerA.shareId, "2026-11-10T08:30"));
    await scheduleFlight(db, dispatcher, flight(ownerB.shareId, "2026-11-12T08:30"));
    await planMaintenance(db, dispatcher, {
      aircraftId: planeId,
      type: "inspection",
      title: "Inspection secrète",
      startsAt: "2026-11-20T08:00",
      endsAt: "2026-11-21T17:00",
    });

    const forA = await getAvailability(db, ownerA.actor, planeId, from, to);
    expect(forA.periods.map((p) => [p.kind, p.mine, p.label])).toEqual([
      ["flight", true, "CYUL → KPBI"],
      ["booked", false, null],
      ["maintenance", false, null],
    ]);
    const forStaff = await getAvailability(db, dispatcher, planeId, from, to);
    expect(forStaff.periods.map((p) => p.ownerName)).toEqual(["Anne", "Bruno", null]);
    expect(forStaff.periods[2]!.label).toBe("Inspection secrète");
  });

  it("refuses owners without a share in the aircraft", async () => {
    const other = await createAircraft(db, admin, { registration: "C-FOTH", model: "CJ4", status: "available" });
    await expect(getAvailability(db, ownerA.actor, other.id, from, to)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listOwnerAircraft(db, ownerA.actor)).map((a) => a.registration)).toEqual(["C-GJTA"]);
  });

  it("adds and removes manual blocks", async () => {
    const block = await addBlock(db, dispatcher, planeId, {
      startsAt: "2026-11-05T00:00",
      endsAt: "2026-11-07T00:00",
      kind: "booked",
    });
    const before = await getAvailability(db, dispatcher, planeId, from, to);
    expect(before.periods).toHaveLength(1);
    expect(before.periods[0]!.blockId).toBe(block.id);
    await removeBlock(db, dispatcher, block.id);
    expect((await getAvailability(db, dispatcher, planeId, from, to)).periods).toHaveLength(0);
    await expect(
      addBlock(db, ownerA.actor, planeId, { startsAt: "2026-11-05T00:00", endsAt: "2026-11-06T00:00", kind: "booked" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("scheduling sync", () => {
  const ext = (over: Partial<Parameters<FakeSchedulingAdapter["data"]["flights"]["push"]>[0]> = {}) => ({
    id: "F-1",
    registration: "c-gjta",
    shareRef: "ANNE-1",
    fromAirport: "CYUL",
    toAirport: "KTEB",
    departsAt: new Date("2026-11-15T13:00:00Z"),
    arrivesAt: null,
    flightMinutes: null,
    status: "scheduled" as const,
    ...over,
  });

  beforeEach(async () => {
    await linkShare(db, admin, ownerA.shareId, "fake", "ANNE-1");
  });

  it("is idempotent: running twice creates once and deducts hours once", async () => {
    const adapter = new FakeSchedulingAdapter({
      flights: [ext({ status: "completed", flightMinutes: 100, arrivesAt: new Date("2026-11-15T14:40:00Z") })],
      maintenance: [
        {
          id: "M-1",
          registration: "C-GJTA",
          type: "inspection",
          title: "Phase 1",
          startsAt: new Date("2026-11-25T12:00:00Z"),
          endsAt: null,
          status: "in_progress",
        },
      ],
      blocks: [
        {
          id: "B-1",
          registration: "C-GJTA",
          startsAt: new Date("2026-11-02T12:00:00Z"),
          endsAt: new Date("2026-11-03T12:00:00Z"),
          kind: "booked",
        },
      ],
    });
    const first = await syncScheduling(db, admin, adapter);
    expect(first.counts).toEqual({ created: 3, updated: 0, unchanged: 0, failed: 0 });
    const second = await syncScheduling(db, null, adapter);
    expect(second.counts).toEqual({ created: 0, updated: 0, unchanged: 3, failed: 0 });

    expect(await db.select().from(flights)).toHaveLength(1);
    expect(await balance(ownerA.shareId)).toBe(3000 - 100);
    expect((await db.select().from(aircraft).where(eq(aircraft.id, planeId)))[0]!.status).toBe("maintenance");
    // The second run asks only for changes since the first one started.
    expect(adapter.calls[0]).toBeNull();
    expect(adapter.calls[1]).toBeInstanceOf(Date);
    expect(await db.select().from(syncRuns)).toHaveLength(2);
  });

  it("follows the vendor's changes with the same hour rules as a manual change", async () => {
    const adapter = new FakeSchedulingAdapter({ flights: [ext()], maintenance: [], blocks: [] });
    await syncScheduling(db, null, adapter);
    expect(await balance(ownerA.shareId)).toBe(3000);

    adapter.data.flights = [ext({ status: "completed", flightMinutes: 120 })];
    expect((await syncScheduling(db, null, adapter)).counts.updated).toBe(1);
    expect(await balance(ownerA.shareId)).toBe(3000 - 120);

    // The vendor corrects the flight time: the difference is adjusted, nothing is edited.
    adapter.data.flights = [ext({ status: "completed", flightMinutes: 90 })];
    await syncScheduling(db, null, adapter);
    expect(await balance(ownerA.shareId)).toBe(3000 - 90);

    adapter.data.flights = [ext({ status: "cancelled", flightMinutes: 90 })];
    await syncScheduling(db, null, adapter);
    expect(await balance(ownerA.shareId)).toBe(3000);
    const kinds = (await listHours(db, finance, ownerA.shareId)).entries.map((e) => e.minutes).sort((a, b) => a - b);
    expect(kinds).toEqual([-120, 30, 90, 3000]);
  });

  it("reports records it can't place without stopping the others", async () => {
    const adapter = new FakeSchedulingAdapter({
      flights: [
        ext({ id: "F-unknown-plane", registration: "N123AB" }),
        ext({ id: "F-unknown-share", shareRef: "NOPE" }),
        ext({ id: "F-no-block", status: "completed" }),
        ext({ id: "F-ok" }),
      ],
      maintenance: [],
      blocks: [],
    });
    const result = await syncScheduling(db, null, adapter);
    expect(result.counts).toEqual({ created: 1, updated: 0, unchanged: 0, failed: 3 });
    expect(result.errors.map((e) => e.code)).toEqual(["unknown_aircraft", "unknown_share", "missing_flight_time"]);

    const status = await getIntegrationStatus(db, admin);
    expect(status.integrations[0]).toMatchObject({ provider: "fake", status: "connected" });
    expect(status.recentRuns[0]!.counts).toMatchObject({ failed: 3 });
  });

  it("records a failed fetch and keeps the last good sync time", async () => {
    const adapter = new FakeSchedulingAdapter();
    adapter.fetchChanges = async () => {
      throw new Error("vendor down");
    };
    const result = await syncScheduling(db, null, adapter);
    expect(result.errors[0]!.code).toBe("fetch_failed");
    const status = await getIntegrationStatus(db, admin);
    expect(status.integrations[0]).toMatchObject({ status: "error", lastSyncedAt: null });
  });

  it("is admin-only when run by a person", async () => {
    await expect(syncScheduling(db, dispatcher, new FakeSchedulingAdapter())).rejects.toBeInstanceOf(ForbiddenError);
  });
});
