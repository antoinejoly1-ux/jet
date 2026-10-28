import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { auditLog, notifications, ownerMembers, user } from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { getFlightRequest, listOpenFlightRequests, requestFlight } from "@/lib/services/flight-requests";
import { scheduleFlight } from "@/lib/services/flights";
import { getOwnerThread } from "@/lib/services/messages";
import { createOwner } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

const sent: Email[] = [];
vi.mock("@/lib/email/send", () => ({ sendEmail: async (e: Email) => void sent.push(e) }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let anne: Actor;
let viewer: Actor;
let ownerId: string;
let shareId: string;
let planeId: string;

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function staff(role: "admin" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function member(name: string, role: "owner" | "read_only", locale: "fr" | "en" = "fr") {
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name.toLowerCase()}@example.com`, emailVerified: true, locale })
    .returning();
  await db.insert(ownerMembers).values({ ownerId, userId: u!.id, role });
  return {
    id: u!.id,
    staffRole: null,
    ownerIds: [ownerId],
    actingOwnerIds: role === "read_only" ? [] : [ownerId],
  } satisfies Actor;
}

const request = (over: Record<string, unknown> = {}) => ({
  shareId,
  from: "cyhu",
  to: "KTEB",
  date: inDays(10),
  time: "08:30",
  passengers: "3",
  notes: "Traiteur pour trois",
  ...over,
});

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  sent.length = 0;
  admin = await staff("admin");
  dispatcher = await staff("dispatcher");
  planeId = (await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-12", status: "available" })).id;
  ownerId = (await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" })).id;
  shareId = (await addShare(db, admin, planeId, { ownerId, percent: 50, startsOn: "2025-01-01", annualHours: "40" }))
    .id;
  anne = await member("Anne", "owner", "en");
  viewer = await member("Lise", "read_only");
});

describe("flight requests", () => {
  it("an owner asks for a flight: a card in the thread, dispatch told, audited", async () => {
    const message = await requestFlight(db, anne, request(), "fr");
    const { messages } = await getOwnerThread(db, anne, ownerId);
    expect(messages[0]!.meta).toMatchObject({
      kind: "flight_request",
      status: "requested",
      registration: "C-GJTA",
      from: "CYHU",
      to: "KTEB",
      time: "08:30",
      passengers: 3,
    });
    expect(messages[0]!.body).toContain("CYHU → KTEB");
    const told = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, dispatcher.id), eq(notifications.type, "message.from_owner")));
    expect(told).toHaveLength(1);
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, message.id));
    expect(audit[0]).toMatchObject({ action: "flight.request", actorUserId: anne.id });
    expect((await listOpenFlightRequests(db, anne)).map((r) => r.id)).toEqual([message.id]);
  });

  it("refuses read-only logins, past dates, unknown airports and a return before the outbound", async () => {
    await expect(requestFlight(db, viewer, request())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestFlight(db, anne, request({ date: "2020-01-01" }))).rejects.toMatchObject({
      code: "date_in_past",
    });
    await expect(requestFlight(db, anne, request({ to: "ZZZZ" }))).rejects.toMatchObject({ code: "unknown_airport" });
    await expect(requestFlight(db, anne, request({ to: "CYHU" }))).rejects.toThrow();
    await expect(requestFlight(db, anne, request({ returnDate: inDays(2) }))).rejects.toThrow();
  });

  it("dispatch plans it: the request closes and the owner is told in their language", async () => {
    const message = await requestFlight(db, anne, request());
    const meta = await getFlightRequest(db, dispatcher, message.id);
    await expect(getFlightRequest(db, anne, message.id)).rejects.toBeInstanceOf(ForbiddenError);

    const flight = await scheduleFlight(
      db,
      dispatcher,
      {
        aircraftId: meta.aircraftId,
        shareId: meta.shareId,
        fromAirport: meta.from,
        toAirport: meta.to,
        departsAt: `${meta.date}T${meta.time}`,
        arrivesAt: "",
      },
      { requestId: message.id },
    );
    expect(await getFlightRequest(db, dispatcher, message.id)).toMatchObject({
      status: "scheduled",
      flightId: flight.id,
    });
    expect(await listOpenFlightRequests(db, anne)).toEqual([]);
    const confirmed = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, anne.id), eq(notifications.type, "flight.confirmed")));
    expect(confirmed[0]!.data).toMatchObject({ aircraft: "C-GJTA", route: "CYHU → KTEB" });
    expect(sent.find((e) => e.to === "anne@example.com")?.subject).toBe("Your flight CYHU → KTEB is scheduled");
  });
});
