import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { ownerMembers, user } from "@/lib/db/schema";
import type { LivePosition, TrackingProvider } from "@/lib/integrations/tracking";
import { demoProvider } from "@/lib/integrations/tracking/demo";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { scheduleFlight } from "@/lib/services/flights";
import { createOwner } from "@/lib/services/owners";
import { getAircraftLive, getFleetLive, REFRESH_MS } from "@/lib/services/tracking";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let anne: Actor;
let bruno: Actor;
let outsider: Actor;
let planeId: string;
let anneShare: string;
let brunoShare: string;

const NOW = new Date("2026-10-27T14:00:00Z");

/** A provider that counts its calls and answers with whatever the test sets. */
function fakeProvider(answer: (id: string) => LivePosition | null) {
  const calls: number[] = [];
  const provider: TrackingProvider = {
    name: "opensky",
    async positions(targets) {
      calls.push(targets.length);
      const out = new Map<string, LivePosition>();
      for (const target of targets) {
        const p = answer(target.aircraftId);
        if (p) out.set(target.aircraftId, p);
      }
      return out;
    },
  };
  return { provider, calls };
}

const airborne = (over: Partial<LivePosition> = {}): LivePosition => ({
  lat: 40.5,
  lon: -75.8,
  altitudeFt: 26000,
  groundSpeedKt: 280,
  headingDeg: 200,
  onGround: false,
  seenAt: NOW,
  callsign: "CGJTA",
  origin: "CYHU",
  destination: "KPBI",
  eta: new Date("2026-10-27T16:00:00Z"),
  ...over,
});

async function ownerLogin(name: string, shareOf: string) {
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@example.com`, emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: shareOf, userId: u!.id });
  return { id: u!.id, staffRole: null, ownerIds: [shareOf] } satisfies Actor;
}

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  const [a] = await db
    .insert(user)
    .values({ name: "admin", email: "admin@jet.test", emailVerified: true, staffRole: "admin" })
    .returning();
  admin = { id: a!.id, staffRole: "admin", ownerIds: [] };
  planeId = (
    await createAircraft(db, admin, {
      registration: "C-GJTA",
      model: "Pilatus PC-12 NGX",
      status: "available",
      homeBase: "CYHU",
      icaoHex: "c05a1b",
    })
  ).id;
  const anneOwner = await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" });
  const brunoOwner = await createOwner(db, admin, { type: "person", legalName: "Bruno", locale: "fr" });
  anneShare = (await addShare(db, admin, planeId, { ownerId: anneOwner.id, percent: 50, startsOn: "2025-01-01" })).id;
  brunoShare = (await addShare(db, admin, planeId, { ownerId: brunoOwner.id, percent: 50, startsOn: "2025-01-01" })).id;
  anne = await ownerLogin("Anne", anneOwner.id);
  bruno = await ownerLogin("Bruno", brunoOwner.id);
  const other = await createOwner(db, admin, { type: "person", legalName: "Other", locale: "fr" });
  outsider = await ownerLogin("Outsider", other.id);
});

const fly = (shareId: string | null) =>
  scheduleFlight(db, admin, {
    aircraftId: planeId,
    shareId: shareId ?? "",
    fromAirport: "CYHU",
    toAirport: "KPBI",
    // Montreal time: 08:00 is 12:00 UTC, two hours before NOW.
    departsAt: "2026-10-27T08:00",
    arrivesAt: "2026-10-27T12:00",
  });

describe("live position", () => {
  it("shows owners their own flight with its route, and only to holders", async () => {
    await fly(anneShare);
    const { provider } = fakeProvider(() => airborne());
    const live = await getAircraftLive(db, anne, planeId, { now: NOW, provider });
    expect(live).toMatchObject({
      state: "in_flight",
      flightOf: "mine",
      leg: { from: { icao: "CYHU" }, to: { icao: "KPBI" } },
      position: { altitudeFt: 26000 },
      stale: false,
    });
    expect(live.leg!.progress).toBeGreaterThan(0.2);
    expect(live.leg!.progress).toBeLessThan(0.4);
    await expect(getAircraftLive(db, outsider, planeId, { now: NOW, provider })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides the route of a co-owner's flight but not the position", async () => {
    await fly(anneShare);
    const { provider } = fakeProvider(() => airborne());
    const forBruno = await getAircraftLive(db, bruno, planeId, { now: NOW, provider });
    expect(forBruno).toMatchObject({ state: "in_flight", flightOf: "co_owner", coOwnerName: "Anne", leg: null });
    expect(forBruno.position).not.toBeNull();
  });

  it("names a charter as such to owners while staff see the route", async () => {
    await fly(null);
    const { provider } = fakeProvider(() => airborne());
    expect(await getAircraftLive(db, anne, planeId, { now: NOW, provider })).toMatchObject({
      flightOf: "charter",
      leg: null,
    });
    expect(await getAircraftLive(db, admin, planeId, { now: NOW, provider })).toMatchObject({
      flightOf: "charter",
      leg: { to: { icao: "KPBI" } },
    });
  });

  it("asks the provider once per refresh window, for the whole fleet", async () => {
    await createAircraft(db, admin, { registration: "C-GJTB", model: "King Air 350", status: "available" });
    const { provider, calls } = fakeProvider(() => null);
    await getAircraftLive(db, anne, planeId, { now: NOW, provider });
    await getAircraftLive(db, bruno, planeId, { now: new Date(NOW.getTime() + 5_000), provider });
    await getFleetLive(db, admin, { now: new Date(NOW.getTime() + 10_000), provider });
    expect(calls).toEqual([2]);
    await getFleetLive(db, admin, { now: new Date(NOW.getTime() + REFRESH_MS), provider });
    expect(calls).toEqual([2, 2]);
  });

  it("keeps the last known position when the provider goes quiet, and flags a lost signal", async () => {
    const { provider } = fakeProvider(() => airborne({ seenAt: NOW }));
    await getAircraftLive(db, anne, planeId, { now: NOW, provider });
    const silent = fakeProvider(() => null).provider;
    const later = await getAircraftLive(db, anne, planeId, {
      now: new Date(NOW.getTime() + 20 * 60_000),
      provider: silent,
    });
    expect(later).toMatchObject({ state: "in_flight", stale: true, position: { lat: 40.5 } });
  });

  it("puts an aircraft on the ground at the nearest airport, else at home", async () => {
    const parked = fakeProvider(() => airborne({ lat: 45.518, lon: -73.417, onGround: true, altitudeFt: 0 }));
    expect(await getAircraftLive(db, anne, planeId, { now: NOW, provider: parked.provider })).toMatchObject({
      state: "on_ground",
      place: { icao: "CYHU" },
      leg: null,
    });
  });

  it("flies the schedule with the demo provider", async () => {
    await fly(anneShare);
    const live = await getAircraftLive(db, anne, planeId, { now: NOW, provider: demoProvider });
    expect(live).toMatchObject({ state: "in_flight", source: "demo", leg: { to: { icao: "KPBI" } } });
    expect(live.leg!.progress).toBeCloseTo(0.5, 1);
  });
});
