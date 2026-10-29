import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import {
  flights,
  holdingCompanies,
  invoiceLines,
  notifications,
  auditLog,
  invoices,
  ownerMembers,
  transactions,
  user,
} from "@/lib/db/schema";
import type { Email } from "@/lib/email/send";
import { addShare, createAircraft, updateAircraft } from "@/lib/services/aircraft";
import {
  addManager,
  defaultPrefix,
  getInvoiceDetail,
  issueInvoice,
  listToInvoice,
  previewInvoice,
  taxesFor,
  updateBillingProfile,
} from "@/lib/services/billing";
import { getOwnerFinances } from "@/lib/services/budgets";
import { approveReport, submitReport } from "@/lib/services/flight-reports";
import { createInvoice, listInvoicesPage, markInvoicePaid, voidInvoice } from "@/lib/services/invoices";
import { createHoldingCompany } from "@/lib/services/holding-companies";
import { createOwner } from "@/lib/services/owners";
import { setRate } from "@/lib/services/rates";
import { createTestDb } from "../support/db";

const sent: Email[] = [];
vi.mock("@/lib/email/send", () => ({ sendEmail: async (e: Email) => void sent.push(e) }));

const t = createTestDb();
const db = t.db as unknown as Db;
let admin: Actor;
let finance: Actor;
let pilot: Actor;
let anne: Actor;
let planeId: string;
let shareId: string;
let ownerId: string;
let companyId: string;
let otherCompanyId: string;

async function staff(role: "admin" | "finance" | "pilot") {
  const [u] = await db
    .insert(user)
    .values({ name: role, email: `${role}@jet.test`, emailVerified: true, staffRole: role })
    .returning();
  return { id: u!.id, staffRole: role, ownerIds: [] } satisfies Actor;
}

async function person(email: string) {
  const [u] = await db.insert(user).values({ name: email, email, emailVerified: true }).returning();
  return u!;
}

/** A flight flown hours ago, reported and approved: ready to invoice. */
type Expense = { category: "fuel" | "handling" | "airport_fees"; amount: string; currency?: "CAD" | "USD" };
async function approvedReport(minutes = "1:45", expenses: Expense[] = [], usdRate?: string) {
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
  const report = await submitReport(db, pilot, { flightId: f!.id, flightTime: minutes, expenses });
  await approveReport(db, finance, report.id, { shareId, usdRate });
  return report.id;
}

beforeAll(t.setup);
afterAll(t.close);
beforeEach(async () => {
  await t.reset();
  sent.length = 0;
  admin = await staff("admin");
  finance = await staff("finance");
  pilot = await staff("pilot");
  companyId = (await createHoldingCompany(db, admin, { legalName: "Gestion Aviation JTA inc." })).id;
  otherCompanyId = (await createHoldingCompany(db, admin, { legalName: "Altitude PC-12 S.E.C." })).id;
  planeId = (
    await createAircraft(db, admin, {
      registration: "C-GJTA",
      model: "PC-12",
      status: "available",
      holdingCompanyId: companyId,
    })
  ).id;
  ownerId = (await createOwner(db, admin, { type: "person", legalName: "Anne", locale: "fr" })).id;
  shareId = (await addShare(db, admin, planeId, { ownerId, percent: 50, startsOn: "2025-01-01" })).id;
  const anneUser = await person("anne@example.com");
  await db.insert(ownerMembers).values({ ownerId, userId: anneUser.id, role: "owner" });
  anne = { id: anneUser.id, staffRole: null, ownerIds: [ownerId] };
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

describe("taxes and numbering", () => {
  it("charges GST and QST only when the company is registered for each", () => {
    expect(taxesFor(100_000, { gstNumber: "1", qstNumber: "2" })).toEqual({
      gstCents: 5_000,
      qstCents: 9_975,
      totalCents: 114_975,
    });
    expect(taxesFor(100_000, { gstNumber: "1", qstNumber: null })).toMatchObject({ qstCents: 0, totalCents: 105_000 });
    expect(taxesFor(100_000, { gstNumber: null, qstNumber: null }).totalCents).toBe(100_000);
  });

  it("suggests a prefix from the legal name", () => {
    expect(defaultPrefix("Gestion Aviation JTA inc.")).toBe("GAJ");
    expect(defaultPrefix("Altitude PC-12 S.E.C.")).toBe("AP");
    expect(defaultPrefix("Ltée")).toBe("INV");
  });
});

describe("issuing an invoice from a flight report", () => {
  it("lines at the rate plus expenses at cost, taxes, numbered per company, statement and owner updated", async () => {
    await updateBillingProfile(db, finance, companyId, {
      gstNumber: "741852963 RT0001",
      qstNumber: "1234567890 TQ0001",
      invoicePrefix: "jta",
      paymentTermsDays: "15",
    });
    const reportId = await approvedReport("1:45", [{ category: "fuel", amount: "1 489,60" }]);
    expect((await listToInvoice(db, finance)).map((r) => r.id)).toEqual([reportId]);

    const preview = await previewInvoice(db, finance, reportId);
    // Fuel is in the hourly rate: the pilot's fuel receipt is shown as included, not billed again.
    expect(preview.subtotalCents).toBe(245_000);
    expect(preview.lines.filter((l) => l.kind === "included")).toEqual([
      expect.objectContaining({ part: "fuel", amountCents: 0 }),
    ]);

    const invoice = await issueInvoice(db, finance, reportId, { now: new Date("2026-10-28T15:00:00Z") });
    expect(invoice).toMatchObject({
      number: "JTA-2026-0001",
      issuedOn: "2026-10-28",
      dueOn: "2026-11-12",
      subtotalCents: 245_000,
      gstCents: 12_250,
      qstCents: 24_439,
      totalCents: 281_689,
      holdingCompanyId: companyId,
    });
    expect(invoice.issuer).toMatchObject({ legalName: "Gestion Aviation JTA inc.", gstNumber: "741852963 RT0001" });
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
    expect(lines).toHaveLength(7);
    expect(lines.reduce((s, l) => s + l.amountCents, 0)).toBe(245_000);

    // The owner's ledger gets each line and the taxes, so their statement adds up to the invoice.
    const ledger = await db.select().from(transactions).where(eq(transactions.invoiceId, invoice.id));
    expect(ledger.reduce((s, x) => s + x.amountCents, 0)).toBe(281_689);
    // Labelled in the owner's language when issued, never with raw keys.
    expect(ledger.map((x) => x.description).sort()).toEqual(
      [
        "JTA-2026-0001 · Carburant",
        "JTA-2026-0001 · Pilote",
        "JTA-2026-0001 · Réserve avionique",
        "JTA-2026-0001 · Réserve cellule et cabine",
        "JTA-2026-0001 · Réserve hélice",
        "JTA-2026-0001 · Réserve moteur",
        "JTA-2026-0001 · TPS/TVQ",
      ].sort(),
    );
    // The owner is told, and can read it; nobody else's owner can.
    const [note] = await db.select().from(notifications).where(eq(notifications.type, "invoice.issued"));
    expect(note).toBeTruthy();
    expect((await getInvoiceDetail(db, anne, invoice.id)).lines).toHaveLength(7);
    const stranger = { id: crypto.randomUUID(), staffRole: null, ownerIds: [crypto.randomUUID()] } satisfies Actor;
    await expect(getInvoiceDetail(db, stranger, invoice.id)).rejects.toBeInstanceOf(ForbiddenError);

    // Gone from the list; the next one follows on.
    expect(await listToInvoice(db, finance)).toEqual([]);
    const next = await issueInvoice(db, finance, await approvedReport("1:00"), {
      now: new Date("2026-11-02T15:00:00Z"),
    });
    expect(next.number).toBe("JTA-2026-0002");
    const newYear = await issueInvoice(db, finance, await approvedReport("1:00"), {
      now: new Date("2027-01-05T15:00:00Z"),
    });
    expect(newYear.number).toBe("JTA-2027-0001");
  });

  it("an unregistered company invoices without taxes", async () => {
    const invoice = await issueInvoice(db, finance, await approvedReport("1:00"));
    expect(invoice).toMatchObject({ gstCents: 0, qstCents: 0, totalCents: 140_000 });
    expect(invoice.number).toMatch(/^GAJ-\d{4}-0001$/);
  });

  it("refuses a report twice, one not approved, an aircraft without a company or a rate", async () => {
    const reportId = await approvedReport();
    await issueInvoice(db, finance, reportId);
    await expect(issueInvoice(db, finance, reportId)).rejects.toThrow("report_already_invoiced");

    await updateAircraft(db, admin, planeId, {
      registration: "C-GJTA",
      model: "PC-12",
      status: "available",
      holdingCompanyId: "",
    });
    await expect(issueInvoice(db, finance, await approvedReport())).rejects.toThrow("no_holding_company");
  });

  it("a company's manager issues its invoices, not another company's; owners and pilots can't", async () => {
    const sophie = await person("sophie@example.com");
    await addManager(db, finance, companyId, { email: "sophie@example.com" });
    const manager = { id: sophie.id, staffRole: null, ownerIds: [], managedCompanyIds: [companyId] } satisfies Actor;
    const outsider = { ...manager, managedCompanyIds: [otherCompanyId] } satisfies Actor;

    const reportId = await approvedReport();
    expect(await listToInvoice(db, outsider)).toEqual([]);
    await expect(issueInvoice(db, outsider, reportId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(issueInvoice(db, anne, reportId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(issueInvoice(db, pilot, reportId)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listToInvoice(db, manager)).map((r) => r.id)).toEqual([reportId]);
    const invoice = await issueInvoice(db, manager, reportId);
    expect((await getInvoiceDetail(db, manager, invoice.id)).invoice.number).toBe(invoice.number);
    await expect(getInvoiceDetail(db, outsider, invoice.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("billing profiles: finance only, prefixes unique", async () => {
    await expect(
      updateBillingProfile(db, admin, companyId, { paymentTermsDays: "30", invoicePrefix: "JTA" }),
    ).resolves.toBeTruthy();
    await expect(
      updateBillingProfile(db, finance, otherCompanyId, { paymentTermsDays: "30", invoicePrefix: "JTA" }),
    ).rejects.toThrow("prefix_taken");
    const [company] = await db.select().from(holdingCompanies).where(eq(holdingCompanies.id, companyId));
    expect(company!.invoicePrefix).toBe("JTA");
    await expect(addManager(db, finance, companyId, { email: "nobody@example.com" })).rejects.toThrow(
      "no_account_for_email",
    );
  });
});

describe("what an invoice bills", () => {
  it("rebills fuel receipts at cost when the rate has no fuel part", async () => {
    await setRate(db, finance, planeId, {
      effectiveFrom: "2025-01-01",
      fuel: "0",
      engine: "230",
      propeller: "85",
      airframe: "120",
      avionics: "35",
      pilot: "180",
    });
    const reportId = await approvedReport("1:00", [{ category: "fuel", amount: "500" }]);
    const preview = await previewInvoice(db, finance, reportId);
    expect(preview.lines.find((l) => l.part === "fuel")).toMatchObject({ kind: "expense", amountCents: 50_000 });
    expect(preview.subtotalCents).toBe(65_000 + 50_000);
  });

  it("US-dollar receipts are converted at the rate finance enters on approval, never added as CAD", async () => {
    const [f] = await db
      .insert(flights)
      .values({
        aircraftId: planeId,
        shareId,
        fromAirport: "KTEB",
        toAirport: "CYHU",
        departsAt: new Date(Date.now() - 5 * 3_600_000),
        status: "scheduled",
      })
      .returning();
    const report = await submitReport(db, pilot, {
      flightId: f!.id,
      flightTime: "1:00",
      expenses: [
        { category: "handling", amount: "100", currency: "USD" },
        { category: "airport_fees", amount: "50" },
      ],
    });
    await expect(approveReport(db, finance, report.id, { shareId })).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ["usdRate"] })],
    });
    await approveReport(db, finance, report.id, { shareId, usdRate: "1,3850" });
    const preview = await previewInvoice(db, finance, report.id);
    const expenses = preview.lines.filter((l) => l.kind === "expense").map((l) => l.amountCents);
    expect(expenses.sort((a, b) => a - b)).toEqual([5_000, 13_850]);
    expect(preview.lines.find((l) => l.part === "handling")!.description).toMatch(/1,385/);
  });

  it("finance can issue an international flight zero-rated: no taxes, stored and audited", async () => {
    await updateBillingProfile(db, finance, companyId, {
      gstNumber: "741852963 RT0001",
      qstNumber: "1234567890 TQ0001",
      paymentTermsDays: "30",
    });
    const invoice = await issueInvoice(db, finance, await approvedReport("1:00"), { zeroRated: true });
    expect(invoice).toMatchObject({ zeroRated: true, gstCents: 0, qstCents: 0, totalCents: 140_000 });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "invoice.issue"));
    expect(audit!.after).toMatchObject({ zeroRated: true });
    const taxed = await issueInvoice(db, finance, await approvedReport("1:00"));
    expect(taxed.zeroRated).toBe(false);
    expect(taxed.gstCents).toBe(7_000);
  });
});

describe("one source for a flight's costs", () => {
  const costsOf = async (invoiceIds: string[]) =>
    (await db.select().from(transactions).where(eq(transactions.shareId, shareId)))
      .filter((x) => x.invoiceId && invoiceIds.includes(x.invoiceId))
      .reduce((s, x) => s + x.amountCents, 0);

  it("the owner's ledger carries a flight once, through its live invoice, across void and reissue", async () => {
    const reportId = await approvedReport("1:00", [{ category: "airport_fees", amount: "200" }]);
    const first = await issueInvoice(db, finance, reportId);
    const ledger = await db.select().from(transactions).where(eq(transactions.shareId, shareId));
    // Every cost on the share is this invoice's, and they add up to it: nothing else books the flight.
    expect(ledger.every((x) => x.invoiceId === first.id)).toBe(true);
    expect(ledger.reduce((s, x) => s + x.amountCents, 0)).toBe(first.totalCents);

    // An uploaded invoice for the same flight would book it twice: refused.
    await expect(
      createInvoice(db, finance, {
        shareId,
        flightId: first.flightId!,
        number: "INV-DOUBLE",
        issuedOn: "2026-10-01",
        total: "100",
      }),
    ).rejects.toThrow("flight_already_invoiced");

    // Voided then reissued: the first nets to zero, the share carries the new one only.
    await voidInvoice(db, finance, first.id, "Mauvais taux");
    const second = await issueInvoice(db, finance, reportId);
    expect(await costsOf([first.id])).toBe(0);
    expect(await costsOf([first.id, second.id])).toBe(second.totalCents);
    // The voided invoice still shows the flight it billed.
    expect((await getInvoiceDetail(db, finance, first.id)).report).toMatchObject({ toAirport: "KTEB" });

    // The owner's figures: « Facturé » counts the live invoice; « Dépensé » the same flight's costs once.
    const [fin] = await getOwnerFinances(db, anne, Number(second.issuedOn.slice(0, 4)));
    expect(fin!.totals.billedCents).toBe(second.totalCents);
    expect(fin!.totals.notInvoicedCents).toBe(0);
  });

  it("payments are recorded with their day and reference; a paid invoice can't be voided", async () => {
    const invoice = await issueInvoice(db, finance, await approvedReport("1:00"), {
      now: new Date("2026-10-01T15:00:00Z"),
    });
    await expect(
      markInvoicePaid(db, finance, invoice.id, { paidOn: "2026-10-30" }, new Date("2026-10-28T15:00:00Z")),
    ).rejects.toThrow("paid_in_future");
    await markInvoicePaid(db, finance, invoice.id, { paidOn: "2026-10-20", reference: "Virement 4471" });
    const [row] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(row).toMatchObject({ status: "paid", paidOn: "2026-10-20", paymentReference: "Virement 4471" });
    await expect(voidInvoice(db, finance, invoice.id, "Erreur de taux")).rejects.toThrow("invoice_paid");
  });

  it("the back office sees what's owed and what's late", async () => {
    const late = await issueInvoice(db, finance, await approvedReport("1:00"), {
      now: new Date("2025-01-10T15:00:00Z"),
    });
    const current = await issueInvoice(db, finance, await approvedReport("1:00"));
    const page = await listInvoicesPage(db, finance);
    expect(page).toMatchObject({
      receivableCents: late.totalCents + current.totalCents,
      overdueCents: late.totalCents,
      overdueCount: 1,
      pages: 1,
    });
    expect(page.rows.find((r) => r.id === late.id)!.overdue).toBe(true);
    expect((await listInvoicesPage(db, finance, { status: "overdue" })).rows.map((r) => r.id)).toEqual([late.id]);
  });
});
