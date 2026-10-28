import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { auditLog, files, flights, hourLedger, user } from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { ConflictError } from "@/lib/services/errors";
import { fileDownloadUrl } from "@/lib/services/files";
import {
  approveReport,
  countReportsWaiting,
  getReportForReview,
  listPilotFlights,
  listReportsForReview,
  returnReport,
  submitReport,
} from "@/lib/services/flight-reports";
import { createOwner } from "@/lib/services/owners";
import { chargesFor, hourlyTotal, rateOn, setRate } from "@/lib/services/rates";
import { createTestDb } from "../support/db";

vi.mock("@/lib/email/send", () => ({ sendEmail: async (_e: Email) => undefined }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let finance: Actor;
let dispatcher: Actor;
let pilot: Actor;
let otherPilot: Actor;
let owner: Actor;
let planeId: string;
let shareId: string;
let otherShareId: string;
let ownerId: string;

async function staff(role: "admin" | "finance" | "dispatcher" | "pilot", name: string = role) {
  const [u] = await db
    .insert(user)
    .values({ name, email: `${name}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function flight(hoursAgo: number, status: "scheduled" | "completed" = "scheduled", minutes?: number) {
  const departsAt = new Date(Date.now() - hoursAgo * 3_600_000);
  const [f] = await db
    .insert(flights)
    .values({
      aircraftId: planeId,
      shareId,
      fromAirport: "CYHU",
      toAirport: "KTEB",
      departsAt,
      status,
      flightMinutes: minutes ?? null,
      arrivesAt: minutes ? new Date(departsAt.getTime() + minutes * 60_000) : null,
    })
    .returning();
  return f!;
}

async function receiptOf(actor: Actor) {
  const [f] = await db
    .insert(files)
    .values({
      storageKey: `receipts/${crypto.randomUUID()}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 1000,
      sha256: "0".repeat(64),
      uploadedByUserId: actor.id,
    })
    .returning();
  return f!.id;
}

const hoursOf = async (id: string) =>
  (await db.select().from(hourLedger).where(eq(hourLedger.shareId, id))).reduce((n, e) => n + e.minutes, 0);

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  finance = await staff("finance");
  dispatcher = await staff("dispatcher");
  pilot = await staff("pilot", "marc");
  otherPilot = await staff("pilot", "luc");
  planeId = (await createAircraft(db, admin, { registration: "C-GJTA", model: "PC-12", status: "available" })).id;
  ownerId = (await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" })).id;
  const other = (await createOwner(db, admin, { type: "person", legalName: "Bruno", locale: "fr" })).id;
  shareId = (await addShare(db, admin, planeId, { ownerId, percent: 50, startsOn: "2025-01-01", annualHours: "40" }))
    .id;
  otherShareId = (await addShare(db, admin, planeId, { ownerId: other, percent: 50, startsOn: "2025-01-01" })).id;
  owner = { id: crypto.randomUUID(), staffRole: null, ownerIds: [ownerId] };
});

describe("hourly rates", () => {
  it("adds up fuel, reserves and pilot; each part rounds on its own so lines match the total", async () => {
    const rate = await setRate(db, finance, planeId, {
      effectiveFrom: "2026-01-01",
      fuel: "750,00",
      engine: "230",
      propeller: "85",
      airframe: "120",
      avionics: "35",
      pilot: "180",
    });
    expect(hourlyTotal(rate)).toBe(140_000);
    const { lines, totalCents } = chargesFor(rate, 105); // 1 h 45
    expect(lines.find((l) => l.part === "fuel")!.cents).toBe(131_250);
    expect(totalCents).toBe(lines.reduce((s, l) => s + l.cents, 0));
    expect(totalCents).toBe(245_000);
  });

  it("applies the rate in force on the flight's day; the same date corrects it", async () => {
    const parts = { fuel: "700", engine: "0", propeller: "0", airframe: "0", avionics: "0", pilot: "0" };
    await setRate(db, finance, planeId, { effectiveFrom: "2026-01-01", ...parts });
    await setRate(db, finance, planeId, { effectiveFrom: "2026-06-01", ...parts, fuel: "800" });
    await setRate(db, finance, planeId, { effectiveFrom: "2026-06-01", ...parts, fuel: "810" });
    expect((await rateOn(db, planeId, "2026-03-15"))!.fuelCentsPerHour).toBe(70_000);
    expect((await rateOn(db, planeId, "2026-06-01"))!.fuelCentsPerHour).toBe(81_000);
    expect(await rateOn(db, planeId, "2025-12-31")).toBeNull();
  });

  it("only finance sets rates, and an empty rate is refused", async () => {
    const zero = {
      effectiveFrom: "2026-01-01",
      fuel: "0",
      engine: "0",
      propeller: "0",
      airframe: "0",
      avionics: "0",
      pilot: "0",
    };
    await expect(setRate(db, dispatcher, planeId, { ...zero, fuel: "1" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setRate(db, pilot, planeId, { ...zero, fuel: "1" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setRate(db, finance, planeId, zero)).rejects.toThrow("rate_empty");
  });
});

describe("flight reports", () => {
  it("a pilot files a report: the flight closes, hours come off the share, finance sees it waiting", async () => {
    const f = await flight(5);
    const receipt = await receiptOf(pilot);
    const { toReport } = await listPilotFlights(db, pilot);
    expect(toReport.map((r) => r.id)).toContain(f.id);
    // A pilot never sees owners or money.
    expect(Object.keys(toReport[0]!)).not.toContain("ownerName");

    await submitReport(db, pilot, {
      flightId: f.id,
      flightTime: "1 h 45",
      fuelLitres: "640",
      expenses: [
        { category: "fuel", amount: "1 489,60", paidBy: "company_card", receiptFileId: receipt },
        { category: "per_diem", amount: "75", paidBy: "pilot" },
      ],
    });
    const [closed] = await db.select().from(flights).where(eq(flights.id, f.id));
    expect(closed).toMatchObject({ status: "completed", flightMinutes: 105 });
    expect(await hoursOf(shareId)).toBe(-105);
    expect((await listPilotFlights(db, pilot)).toReport.map((r) => r.id)).not.toContain(f.id);
    expect(await countReportsWaiting(db, finance)).toBe(1);
    expect(await countReportsWaiting(db, dispatcher)).toBe(0);

    const { waiting } = await listReportsForReview(db, finance);
    expect(waiting[0]).toMatchObject({ ownerName: "Anne", expensesCents: 156_460, expenseCount: 2, pilotName: "marc" });
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "flight_report.submit"));
    expect(audit).toHaveLength(1);
  });

  it("refuses a flight that hasn't left, a cancelled one, and someone else's receipt", async () => {
    const future = await flight(-3);
    await expect(submitReport(db, pilot, { flightId: future.id, flightTime: "1:00" })).rejects.toThrow(
      "flight_not_departed",
    );
    const f = await flight(5);
    const foreign = await receiptOf(otherPilot);
    await expect(
      submitReport(db, pilot, {
        flightId: f.id,
        flightTime: "1:00",
        expenses: [{ category: "fuel", amount: "10", receiptFileId: foreign }],
      }),
    ).rejects.toThrow("invalid_receipt");
    // Nothing half-done: the flight is still open.
    const [still] = await db.select().from(flights).where(eq(flights.id, f.id));
    expect(still!.status).toBe("scheduled");
  });

  it("only pilots file reports", async () => {
    const f = await flight(5);
    await expect(submitReport(db, dispatcher, { flightId: f.id, flightTime: "1:00" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listPilotFlights(db, owner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listReportsForReview(db, pilot)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a flight dispatch already closed is corrected by the report: hours adjust by the difference", async () => {
    const f = await flight(6, "completed", 120);
    await db.insert(hourLedger).values({ shareId, kind: "flight", minutes: -120, flightId: f.id });
    await submitReport(db, pilot, { flightId: f.id, flightTime: "1:40" });
    expect(await hoursOf(shareId)).toBe(-100);
    const [row] = await db.select().from(flights).where(eq(flights.id, f.id));
    expect(row!.flightMinutes).toBe(100);
  });

  it("finance sends it back; the pilot fixes it; finance approves it for whoever really flew", async () => {
    await setRate(db, finance, planeId, {
      effectiveFrom: "2025-01-01",
      fuel: "750",
      engine: "230",
      propeller: "85",
      airframe: "120",
      avionics: "35",
      pilot: "180",
    });
    const f = await flight(5);
    const report = await submitReport(db, pilot, { flightId: f.id, flightTime: "2:00" });
    await returnReport(db, finance, report.id, { note: "Il manque le reçu du carburant." });
    const back = await listPilotFlights(db, pilot);
    expect(back.toReport.find((r) => r.id === f.id)).toMatchObject({
      reportStatus: "returned",
      reviewNote: "Il manque le reçu du carburant.",
    });
    // Another pilot can't take over the report while it's still with this one.
    await submitReport(db, pilot, { flightId: f.id, flightTime: "2:00" });
    await expect(submitReport(db, otherPilot, { flightId: f.id, flightTime: "2:00" })).rejects.toThrow(
      "report_already_filed",
    );
    expect(await hoursOf(shareId)).toBe(-120);

    const review = await getReportForReview(db, finance, report.id);
    expect(review.charges!.totalCents).toBe(280_000);
    expect(review.shareOptions.map((s) => s.ownerName).sort()).toEqual(["Anne", "Bruno"]);

    await expect(approveReport(db, dispatcher, report.id, { shareId: otherShareId })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const approved = await approveReport(db, finance, report.id, { shareId: otherShareId });
    expect(approved).toMatchObject({ status: "approved", shareId: otherShareId, reviewedByUserId: finance.id });
    await expect(submitReport(db, pilot, { flightId: f.id, flightTime: "3:00" })).rejects.toThrow("report_approved");
    await expect(returnReport(db, finance, report.id, { note: "x" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("a share from another aircraft can't be billed", async () => {
    const plane2 = (await createAircraft(db, admin, { registration: "C-FJTB", model: "PC-12", status: "available" }))
      .id;
    const elsewhere = (await addShare(db, admin, plane2, { ownerId, percent: 10, startsOn: "2025-01-01" })).id;
    const f = await flight(5);
    const report = await submitReport(db, pilot, { flightId: f.id, flightTime: "1:00" });
    await expect(approveReport(db, finance, report.id, { shareId: elsewhere })).rejects.toThrow(
      "share_not_on_aircraft",
    );
  });

  it("receipts: finance and the filing pilot may open them, not another pilot or an owner", async () => {
    const f = await flight(5);
    const receipt = await receiptOf(pilot);
    await submitReport(db, pilot, {
      flightId: f.id,
      flightTime: "1:00",
      expenses: [{ category: "handling", amount: "425", receiptFileId: receipt }],
    });
    await expect(fileDownloadUrl(db, finance, receipt)).resolves.toBeTruthy();
    await expect(fileDownloadUrl(db, pilot, receipt)).resolves.toBeTruthy();
    await expect(fileDownloadUrl(db, otherPilot, receipt)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(fileDownloadUrl(db, owner, receipt)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
