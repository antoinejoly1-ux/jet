import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { ownerMembers, user } from "@/lib/db/schema";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { getAdminQueue } from "@/lib/services/dashboard";
import { requestFlight } from "@/lib/services/flight-requests";
import { createInvoice, markInvoicePaid } from "@/lib/services/invoices";
import { scheduleFlight } from "@/lib/services/flights";
import { replyAsStaff, sendOwnerMessage, conversationIdForOwner } from "@/lib/services/messages";
import { createOwner } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let finance: Actor;
let anne: Actor;
let ownerId: string;
let shareId: string;
let planeId: string;

async function staff(role: "admin" | "finance" | "dispatcher") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

const counts = async (actor: Actor) =>
  Object.fromEntries((await getAdminQueue(db, actor)).map((r) => [r.key, r.count]));
const local = (hoursFromNow: number) => {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const p = (k: string) => parts.find((x) => x.type === k)!.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
};

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  dispatcher = await staff("dispatcher");
  finance = await staff("finance");
  planeId = (await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-12", status: "available" })).id;
  ownerId = (await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" })).id;
  shareId = (await addShare(db, admin, planeId, { ownerId, percent: 50, startsOn: "2025-01-01", annualHours: "40" }))
    .id;
  const [u] = await db
    .insert(user)
    .values({ name: "Anne", email: "anne@example.com", emailVerified: true })
    .returning();
  await db.insert(ownerMembers).values({ ownerId, userId: u!.id });
  anne = { id: u!.id, staffRole: null, ownerIds: [ownerId] };
});

describe("À traiter", () => {
  it("counts what needs the team, and only what each role can act on", async () => {
    // A share with no hours yet is under 10% of its yearly hours.
    expect(await counts(dispatcher)).toEqual({ lowHours: 1 });

    await scheduleFlight(db, dispatcher, {
      aircraftId: planeId,
      shareId,
      fromAirport: "CYHU",
      toAirport: "KTEB",
      departsAt: local(-6),
      arrivesAt: local(-4),
    });
    await sendOwnerMessage(db, anne, ownerId, { body: "Bonjour" });
    const d = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    await requestFlight(db, anne, { shareId, from: "CYHU", to: "KBOS", date: d, passengers: "2" });

    expect(await counts(dispatcher)).toMatchObject({ flightsToClose: 1, flightRequests: 1, awaitingReply: 1 });
    // Owners never invited are only for those who invite: finance yes, dispatch no.
    await createOwner(db, admin, { type: "person", legalName: "Bruno", locale: "fr" });
    expect(await counts(finance)).toMatchObject({ ownersNeverInvited: 1 });
    expect(await counts(dispatcher)).not.toHaveProperty("ownersNeverInvited");

    // Answering takes the thread off the list.
    await replyAsStaff(db, dispatcher, (await conversationIdForOwner(db, dispatcher, ownerId))!, { body: "Oui" });
    expect(await counts(dispatcher)).not.toHaveProperty("awaitingReply");
  });

  it("counts invoices past their due date, for those who handle money", async () => {
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const invoice = (number: string, dueOn: string) =>
      createInvoice(db, finance, { shareId, number, issuedOn: day(-40), dueOn, total: "100,00", currency: "CAD" });
    await invoice("INV-1", day(-10));
    await invoice("INV-2", day(10));
    const paid = await invoice("INV-3", day(-10));
    await markInvoicePaid(db, finance, paid.id);
    expect(await counts(finance)).toMatchObject({ overdueInvoices: 1 });
    expect(await counts(dispatcher)).not.toHaveProperty("overdueInvoices");
  });

  it("is for staff only", async () => {
    await expect(getAdminQueue(db, anne)).rejects.toThrow();
  });
});
