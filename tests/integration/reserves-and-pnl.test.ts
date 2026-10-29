import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import { flights, invoices, ownerMembers, reserveLedger, transactions, user } from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { addShare, createAircraft } from "@/lib/services/aircraft";
import { issueInvoice } from "@/lib/services/billing";
import { approveReport, submitReport } from "@/lib/services/flight-reports";
import { createHoldingCompany } from "@/lib/services/holding-companies";
import { voidInvoice } from "@/lib/services/invoices";
import { createOwner } from "@/lib/services/owners";
import { addCompanyExpense, getCompanyPnl, listOwnerCompanies, reverseCompanyExpense } from "@/lib/services/pnl";
import { setRate } from "@/lib/services/rates";
import { getAircraftReserves, listOwnerReserves, payFromReserve, setReserveTarget } from "@/lib/services/reserves";
import { createTestDb } from "../support/db";

vi.mock("@/lib/email/send", () => ({ sendEmail: async (_e: Email) => undefined }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let finance: Actor;
let dispatcher: Actor;
let pilot: Actor;
let anne: Actor;
let bruno: Actor;
let planeId: string;
let shareId: string;
let companyId: string;
const year = new Date().getFullYear();

async function staff(role: "admin" | "finance" | "dispatcher" | "pilot") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function ownerLogin(ownerId: string, email: string): Promise<Actor> {
  const [u] = await db.insert(user).values({ name: email, email, emailVerified: true }).returning();
  await db.insert(ownerMembers).values({ ownerId, userId: u!.id, role: "owner" });
  return { id: u!.id, staffRole: null, ownerIds: [ownerId] };
}

/** Flies 2 h, with $500 of fuel bought on the way (covered by the rate's fuel part), and invoices it. */
async function invoicedFlight() {
  const [f] = await db
    .insert(flights)
    .values({
      aircraftId: planeId,
      shareId,
      fromAirport: "CYHU",
      toAirport: "KTEB",
      departsAt: new Date(Date.now() - 5 * 3_600_000),
      status: "scheduled",
    })
    .returning();
  const report = await submitReport(db, pilot, {
    flightId: f!.id,
    flightTime: "2:00",
    expenses: [{ category: "fuel", amount: "500" }],
  });
  await approveReport(db, finance, report.id, { shareId });
  return issueInvoice(db, finance, report.id);
}

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  admin = await staff("admin");
  finance = await staff("finance");
  dispatcher = await staff("dispatcher");
  pilot = await staff("pilot");
  companyId = (await createHoldingCompany(db, admin, { legalName: "Gestion Aviation JTA inc." })).id;
  planeId = (
    await createAircraft(db, admin, {
      registration: "C-GJTA",
      model: "PC-12",
      status: "available",
      holdingCompanyId: companyId,
    })
  ).id;
  const anneId = (await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" })).id;
  const brunoId = (await createOwner(db, admin, { type: "person", legalName: "Bruno", locale: "fr" })).id;
  shareId = (await addShare(db, admin, planeId, { ownerId: anneId, percent: 25, startsOn: "2025-01-01" })).id;
  anne = await ownerLogin(anneId, "anne@example.com");
  bruno = await ownerLogin(brunoId, "bruno@example.com");
  await setRate(db, finance, planeId, {
    effectiveFrom: "2025-01-01",
    fuel: "750",
    engine: "230",
    propeller: "85",
    airframe: "120",
    avionics: "35",
    pilot: "180",
  });
});

describe("maintenance reserves", () => {
  it("each invoiced hour sets money aside per component; work paid from a reserve takes from it", async () => {
    await invoicedFlight();
    const before = await getAircraftReserves(db, finance, planeId);
    expect(before.components.map((c) => [c.component, c.balanceCents])).toEqual([
      ["engine", 46_000],
      ["propeller", 17_000],
      ["airframe", 24_000],
      ["avionics", 7_000],
    ]);
    await setReserveTarget(db, finance, planeId, { component: "propeller", target: "340", label: "Révision" });
    await payFromReserve(db, finance, planeId, {
      component: "engine",
      amount: "60",
      occurredOn: `${year}-03-01`,
      note: "Inspection",
    });
    const after = await getAircraftReserves(db, finance, planeId);
    expect(after.components.find((c) => c.component === "engine")!.balanceCents).toBe(40_000);
    expect(after.components.find((c) => c.component === "propeller")!.covered).toBeCloseTo(0.5);
    expect(after.history).toHaveLength(1);
  });

  it("refuses to pay more than a reserve holds, unless finance says to anyway", async () => {
    await invoicedFlight(); // engine reserve: $460
    const work = { component: "engine" as const, amount: "1 000", occurredOn: `${year}-03-01`, note: "Démarreur" };
    await expect(payFromReserve(db, finance, planeId, work)).rejects.toThrow("reserve_insufficient");
    await payFromReserve(db, finance, planeId, { ...work, override: "on" });
    const after = await getAircraftReserves(db, finance, planeId);
    expect(after.components.find((c) => c.component === "engine")!.balanceCents).toBe(46_000 - 100_000);
  });

  it("owners see their aircraft's reserves and their part; dispatch and other owners can't change or see them", async () => {
    await invoicedFlight();
    const [mine] = await listOwnerReserves(db, anne);
    expect(mine).toMatchObject({ registration: "C-GJTA", totalCents: 94_000, mineCents: 23_500 });
    expect(await listOwnerReserves(db, bruno)).toEqual([]);
    await expect(getAircraftReserves(db, dispatcher, planeId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      payFromReserve(db, dispatcher, planeId, {
        component: "engine",
        amount: "1",
        occurredOn: "2026-01-01",
        note: "x y",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("voiding a generated invoice gives back its reserves and ledger lines, and the flight can be invoiced again", async () => {
    const invoice = await invoicedFlight();
    await voidInvoice(db, finance, invoice.id, "Mauvais propriétaire", new Date(`${year}-12-15T15:00:00Z`));
    // Every reversal, ledger and reserves alike, is dated the day of the void.
    const reversals = await db.select().from(reserveLedger).where(eq(reserveLedger.kind, "adjustment"));
    expect(new Set(reversals.map((r) => r.occurredOn))).toEqual(new Set([`${year}-12-15`]));
    const reserves = await getAircraftReserves(db, finance, planeId);
    expect(reserves.components.every((c) => c.balanceCents === 0)).toBe(true);
    const ledger = await db.select().from(transactions).where(eq(transactions.invoiceId, invoice.id));
    expect(ledger.reduce((s, x) => s + x.amountCents, 0)).toBe(0);
    expect(new Set(ledger.filter((x) => x.reversesId).map((x) => x.occurredOn))).toEqual(new Set([`${year}-12-15`]));
    // Nothing was deleted: both the entries and their reversals are there.
    expect((await db.select().from(reserveLedger)).length).toBe(8);
  });
});

describe("company results", () => {
  it("revenue by kind from its invoices, expenses from reports, the company and the reserves", async () => {
    await invoicedFlight();
    await addCompanyExpense(db, finance, companyId, {
      occurredOn: `${year}-02-01`,
      category: "insurance",
      amount: "1 000",
    });
    const hangar = await addCompanyExpense(db, finance, companyId, {
      occurredOn: `${year}-02-01`,
      category: "hangar",
      amount: "300",
    });
    await reverseCompanyExpense(db, finance, companyId, hangar.id);
    await expect(reverseCompanyExpense(db, finance, companyId, hangar.id)).rejects.toThrow("already_reversed");
    await payFromReserve(db, finance, planeId, {
      component: "engine",
      amount: "200",
      occurredOn: `${year}-03-01`,
      note: "Inspection",
    });

    const pnl = await getCompanyPnl(db, finance, companyId, year);
    expect(Object.fromEntries(pnl.revenue.map((r) => [r.key, r.cents]))).toEqual({
      fuel: 150_000,
      pilot: 36_000,
      reserves: 94_000,
      // The fuel receipt is in the hourly rate: a company cost, not rebilled.
      rebilled: 0,
      uploaded: 0,
    });
    expect(Object.fromEntries(pnl.expenses.map((e) => [e.key, e.cents]))).toEqual({
      insurance: 100_000,
      fuel: 50_000,
      maintenance_reserves: 20_000,
    });
    expect(pnl.resultCents).toBe(280_000 - 170_000);
    expect(pnl.reserves).toEqual({ setAsideCents: 94_000, spentCents: 20_000, balanceCents: 74_000 });
  });

  it("counts invoices uploaded before the portal by their total", async () => {
    await db.insert(invoices).values({
      shareId,
      number: "INV-1",
      issuedOn: `${year}-01-15`,
      totalCents: 123_400,
    });
    const pnl = await getCompanyPnl(db, finance, companyId, year);
    expect(pnl.revenue.find((r) => r.key === "uploaded")!.cents).toBe(123_400);
    // No before-tax amount on that upload: the line says the taxes are in it.
    expect(pnl.uploadedIncludesTaxes).toBe(true);
  });

  it("counts an upload before taxes when its subtotal is known", async () => {
    await db.insert(invoices).values({
      shareId,
      number: "INV-2",
      issuedOn: `${year}-01-15`,
      totalCents: 114_975,
      subtotalCents: 100_000,
    });
    const pnl = await getCompanyPnl(db, finance, companyId, year);
    expect(pnl.revenue.find((r) => r.key === "uploaded")!.cents).toBe(100_000);
    expect(pnl.uploadedIncludesTaxes).toBe(false);
  });

  it("its owners and managers see it; other owners, dispatch and pilots don't", async () => {
    expect((await listOwnerCompanies(db, anne)).map((c) => c.id)).toEqual([companyId]);
    await expect(getCompanyPnl(db, anne, companyId, year)).resolves.toBeTruthy();
    const manager = { id: crypto.randomUUID(), staffRole: null, ownerIds: [], managedCompanyIds: [companyId] };
    await expect(getCompanyPnl(db, manager, companyId, year)).resolves.toBeTruthy();
    for (const who of [bruno, dispatcher, pilot])
      await expect(getCompanyPnl(db, who, companyId, year)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      addCompanyExpense(db, anne, companyId, { occurredOn: `${year}-01-01`, category: "other", amount: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
