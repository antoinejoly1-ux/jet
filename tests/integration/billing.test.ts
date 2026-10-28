import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import type { Db } from "@/lib/db";
import {
  flights,
  holdingCompanies,
  invoiceLines,
  notifications,
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
import { approveReport, submitReport } from "@/lib/services/flight-reports";
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
async function approvedReport(minutes = "1:45", expenses: { category: "fuel"; amount: string }[] = []) {
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
  await approveReport(db, finance, report.id, { shareId });
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
    expect(preview.subtotalCents).toBe(245_000 + 148_960);

    const invoice = await issueInvoice(db, finance, reportId, new Date("2026-10-28T15:00:00Z"));
    expect(invoice).toMatchObject({
      number: "JTA-2026-0001",
      issuedOn: "2026-10-28",
      dueOn: "2026-11-12",
      subtotalCents: 393_960,
      gstCents: 19_698,
      qstCents: 39_298,
      totalCents: 452_956,
      holdingCompanyId: companyId,
    });
    expect(invoice.issuer).toMatchObject({ legalName: "Gestion Aviation JTA inc.", gstNumber: "741852963 RT0001" });
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
    expect(lines).toHaveLength(7);
    expect(lines.reduce((s, l) => s + l.amountCents, 0)).toBe(393_960);

    // The owner's ledger gets each line and the taxes, so their statement adds up to the invoice.
    const ledger = await db.select().from(transactions).where(eq(transactions.invoiceId, invoice.id));
    expect(ledger.reduce((s, x) => s + x.amountCents, 0)).toBe(452_956);
    // The owner is told, and can read it; nobody else's owner can.
    const [note] = await db.select().from(notifications).where(eq(notifications.type, "invoice.issued"));
    expect(note).toBeTruthy();
    expect((await getInvoiceDetail(db, anne, invoice.id)).lines).toHaveLength(7);
    const stranger = { id: crypto.randomUUID(), staffRole: null, ownerIds: [crypto.randomUUID()] } satisfies Actor;
    await expect(getInvoiceDetail(db, stranger, invoice.id)).rejects.toBeInstanceOf(ForbiddenError);

    // Gone from the list; the next one follows on.
    expect(await listToInvoice(db, finance)).toEqual([]);
    const next = await issueInvoice(db, finance, await approvedReport("1:00"), new Date("2026-11-02T15:00:00Z"));
    expect(next.number).toBe("JTA-2026-0002");
    const newYear = await issueInvoice(db, finance, await approvedReport("1:00"), new Date("2027-01-05T15:00:00Z"));
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
