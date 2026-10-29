import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { files, flights, ownerMembers, user } from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { addShare, createAircraft, listFleetCards, setAircraftPhoto } from "@/lib/services/aircraft";
import { getFlightDetail } from "@/lib/services/flight-detail";
import { submitReport } from "@/lib/services/flight-reports";
import { createOwner } from "@/lib/services/owners";
import { createTestDb } from "../support/db";

vi.mock("@/lib/email/send", () => ({ sendEmail: async (_e: Email) => undefined }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let dispatcher: Actor;
let finance: Actor;
let pilot: Actor;
let planeId: string;
let shareId: string;

async function staff(role: "admin" | "dispatcher" | "finance" | "pilot") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  dispatcher = await staff("dispatcher");
  finance = await staff("finance");
  pilot = await staff("pilot");
  planeId = (await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-12", status: "available" })).id;
  const anne = (await createOwner(db, admin, { type: "person", legalName: "Anne Roy", locale: "fr" })).id;
  const bruno = (await createOwner(db, admin, { type: "person", legalName: "Bruno Côté", locale: "fr" })).id;
  shareId = (await addShare(db, admin, planeId, { ownerId: anne, percent: 60, startsOn: "2025-01-01" })).id;
  await addShare(db, admin, planeId, { ownerId: bruno, percent: 40, startsOn: "2025-01-01" });
  const [u] = await db
    .insert(user)
    .values({ name: "Anne", email: "anne@example.com", emailVerified: true, image: "/avatars/anne.webp" })
    .returning();
  await db.insert(ownerMembers).values({ ownerId: anne, userId: u!.id, role: "owner" });
});

describe("fleet cards", () => {
  it("each aircraft with its owners' faces, largest share first", async () => {
    const [card] = await listFleetCards(db, dispatcher);
    expect(card!.holders.map((h) => [h.name, h.image])).toEqual([
      ["Anne Roy", "/avatars/anne.webp"],
      ["Bruno Côté", null],
    ]);
    expect(card!.assignedBp).toBe(10_000);
  });

  it("a photo must be an uploaded aircraft photo, set by someone who manages the fleet", async () => {
    const [photo] = await db
      .insert(files)
      .values({ storageKey: "photos/abc.webp", contentType: "image/webp", sizeBytes: 10, sha256: "0".repeat(64) })
      .returning();
    const [other] = await db
      .insert(files)
      .values({ storageKey: "invoices/abc.pdf", contentType: "application/pdf", sizeBytes: 10, sha256: "1".repeat(64) })
      .returning();
    await expect(setAircraftPhoto(db, dispatcher, planeId, photo!.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setAircraftPhoto(db, admin, planeId, other!.id)).rejects.toThrow("invalid_file");
    await setAircraftPhoto(db, admin, planeId, photo!.id);
    const [card] = await listFleetCards(db, dispatcher);
    expect(card!.photoFileId).toBe(photo!.id);
  });
});

describe("flight detail", () => {
  it("shows the route and the pilot's report; amounts only to finance", async () => {
    const [f] = await db
      .insert(flights)
      .values({
        aircraftId: planeId,
        shareId,
        fromAirport: "CYHU",
        toAirport: "KTEB",
        departsAt: new Date(Date.now() - 6 * 3_600_000),
        status: "scheduled",
      })
      .returning();
    await submitReport(db, pilot, {
      flightId: f!.id,
      flightTime: "1:30",
      expenses: [{ category: "fuel", amount: "800" }],
    });
    const forFinance = await getFlightDetail(db, finance, f!.id);
    expect(forFinance.route?.leg).toMatchObject({ from: { icao: "CYHU" }, to: { icao: "KTEB" }, progress: 1 });
    expect(forFinance.report).toMatchObject({ flightMinutes: 90, pilotName: "pilot", status: "submitted" });
    expect(forFinance.expenses[0]!.amountCents).toBe(80_000);
    const forDispatch = await getFlightDetail(db, dispatcher, f!.id);
    expect(forDispatch.expenses[0]!.amountCents).toBeNull();
    const [closed] = await db.select().from(flights).where(eq(flights.id, f!.id));
    expect(closed!.status).toBe("completed");
  });
});
