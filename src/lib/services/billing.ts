/**
 * The holding company's invoice to an owner, from an approved flight report:
 * the flight time at each part of the aircraft's rate, the expenses rebilled
 * at cost, then GST and QST when the company is registered for them. Numbers
 * run per company and per year (PREFIX-2026-0001) without gaps. Once issued,
 * an invoice's lines and issuer never change; a mistake is voided and reissued.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx, Tx } from "@/lib/db";
import {
  aircraft,
  budgetCategories,
  files,
  flightReportExpenses,
  flightReports,
  flights,
  holdingCompanies,
  holdingCompanyManagers,
  invoiceLines,
  invoices,
  owners,
  shares,
  transactions,
  user,
  type InvoiceIssuer,
} from "@/lib/db/schema";
import { authorize, authorizeInvoicing, can, type Actor } from "@/lib/auth/policy";
import { formatMoney } from "@/lib/format";
import { zonedDay } from "@/lib/time";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";
import { emit } from "./outbox";
import { notifyOwnerMembers, sendPendingEmails } from "./owner-notifications";
import { chargesFor, fuelIncludedInRate, rateOn } from "./rates";

export { fuelIncludedInRate };
import { creditReserves } from "./reserves";

/** Quebec sales taxes on a taxable supply: GST 5 %, QST 9.975 %, each on the subtotal. */
export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export function taxesFor(subtotalCents: number, company: { gstNumber: string | null; qstNumber: string | null }) {
  const gstCents = company.gstNumber ? Math.round(subtotalCents * GST_RATE) : 0;
  const qstCents = company.qstNumber ? Math.round(subtotalCents * QST_RATE) : 0;
  return { gstCents, qstCents, totalCents: subtotalCents + gstCents + qstCents };
}

/** "UNI-2026-0007": the company's prefix, the year, then a counter that starts over each year. */
export const invoiceNumber = (prefix: string, year: number, seq: number) =>
  `${prefix}-${year}-${String(seq).padStart(4, "0")}`;

/** A prefix from the legal name when none was set: "Gestion Aviation JTA inc." → "GAJ". */
export function defaultPrefix(legalName: string) {
  const skip = ["INC", "LTEE", "LTD", "SENC", "CORP", "CIE", "DE", "DU", "DES", "LA", "LE", "LES"];
  const words = legalName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    // Initials like S.E.C. and numbers like "12" don't name the company.
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !skip.includes(w));
  const initials = words.map((w) => w[0]).join("");
  return (initials.length >= 2 ? initials : (words[0] ?? "INV")).slice(0, 4);
}

type Line = {
  kind: "hours" | "expense" | "included";
  part: string;
  description: string | null;
  minutes: number | null;
  unitCents: number | null;
  amountCents: number;
};

type Locale = "fr" | "en";
const MESSAGES = { fr, en } as const;

/** Labels written into the owner's ledger, in the owner's language, fixed at issue time. */
export function ledgerLabel(locale: Locale, line: { kind: string; part: string } | "taxes") {
  const m = MESSAGES[locale];
  if (line === "taxes") return m.invoiceDetail.ledgerTaxes;
  if (line.kind === "hours") return m.rates.parts[line.part as keyof typeof m.rates.parts] ?? line.part;
  const category = m.pilot.form.categories[line.part as keyof typeof m.pilot.form.categories] ?? line.part;
  return `${category} (${m.invoiceDetail.atCost})`;
}

/** An expense in CAD: fixed at approval; a CAD expense not yet approved is its own amount. */
export const expenseCadCents = (e: { amountCents: number; currency: string; amountCadCents: number | null }) =>
  e.amountCadCents ?? (e.currency === "CAD" ? e.amountCents : null);

/** Everything an invoice for this report would say, without saving anything. */
async function draftFor(db: DbOrTx, reportId: string, { zeroRated = false } = {}) {
  const [row] = await db
    .select({
      report: flightReports,
      flight: flights,
      registration: aircraft.registration,
      company: holdingCompanies,
      ownerId: shares.ownerId,
      ownerName: owners.legalName,
      ownerLocale: owners.locale,
    })
    .from(flightReports)
    .innerJoin(flights, eq(flights.id, flightReports.flightId))
    .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
    .leftJoin(holdingCompanies, eq(holdingCompanies.id, aircraft.holdingCompanyId))
    .leftJoin(shares, eq(shares.id, flightReports.shareId))
    .leftJoin(owners, eq(owners.id, shares.ownerId))
    .where(eq(flightReports.id, reportId));
  if (!row) throw new NotFoundError("flight_report");
  const day = zonedDay(row.flight.departsAt);
  const locale: Locale = row.ownerLocale === "en" ? "en" : "fr";
  const [rate, expenses] = await Promise.all([
    rateOn(db, row.flight.aircraftId, day),
    db
      .select({
        id: flightReportExpenses.id,
        category: flightReportExpenses.category,
        amountCents: flightReportExpenses.amountCents,
        currency: flightReportExpenses.currency,
        amountCadCents: flightReportExpenses.amountCadCents,
        paidBy: flightReportExpenses.paidBy,
        note: flightReportExpenses.note,
        receiptFileId: flightReportExpenses.receiptFileId,
        receiptType: files.contentType,
      })
      .from(flightReportExpenses)
      .leftJoin(files, eq(files.id, flightReportExpenses.receiptFileId))
      .where(eq(flightReportExpenses.reportId, reportId))
      .orderBy(asc(flightReportExpenses.createdAt)),
  ]);
  const lines: Line[] = [];
  if (rate)
    for (const l of chargesFor(rate, row.report.flightMinutes).lines)
      if (l.cents > 0)
        lines.push({
          kind: "hours",
          part: l.part,
          description: null,
          minutes: row.report.flightMinutes,
          unitCents: l.perHourCents,
          amountCents: l.cents,
        });
  const fuelIncluded = fuelIncludedInRate(rate);
  let needsFxRate = false;
  for (const e of expenses) {
    if (e.category === "fuel" && fuelIncluded) {
      lines.push({
        kind: "included",
        part: e.category,
        description: e.note,
        minutes: null,
        unitCents: null,
        amountCents: 0,
      });
      continue;
    }
    const cad = expenseCadCents(e);
    if (cad === null) needsFxRate = true;
    const converted =
      e.currency !== "CAD" && cad !== null && row.report.usdCadRate
        ? `${formatMoney(e.amountCents, e.currency, locale)} × ${Number(row.report.usdCadRate).toLocaleString(locale === "en" ? "en-CA" : "fr-CA", { maximumFractionDigits: 6 })}`
        : null;
    lines.push({
      kind: "expense",
      part: e.category,
      description: [e.note, converted].filter(Boolean).join(" · ") || null,
      minutes: null,
      unitCents: null,
      amountCents: cad ?? 0,
    });
  }
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const taxes =
    row.company && !zeroRated
      ? taxesFor(subtotalCents, row.company)
      : { gstCents: 0, qstCents: 0, totalCents: subtotalCents };
  return { ...row, day, locale, rate, expenses, fuelIncluded, needsFxRate, lines, subtotalCents, ...taxes };
}

/** What a report's invoice would look like, for whoever may issue it. */
export async function previewInvoice(db: Db, actor: Actor, reportId: string) {
  const draft = await draftFor(db, reportId);
  if (!draft.company) throw new ConflictError("no_holding_company");
  authorizeInvoicing(actor, draft.company.id);
  return draft;
}

/** Approved reports not invoiced yet: all of them for finance, their companies' for a manager. */
export async function listToInvoice(db: Db, actor: Actor) {
  const companies = can(actor, "finance:read") ? null : (actor.managedCompanyIds ?? []);
  if (companies && companies.length === 0) return [];
  const filters: SQL[] = [eq(flightReports.status, "approved"), isNull(flightReports.invoiceId)];
  if (companies) filters.push(inArray(aircraft.holdingCompanyId, [...companies]));
  return db
    .select({
      id: flightReports.id,
      flightMinutes: flightReports.flightMinutes,
      departsAt: flights.departsAt,
      fromAirport: flights.fromAirport,
      toAirport: flights.toAirport,
      registration: aircraft.registration,
      companyName: holdingCompanies.legalName,
      ownerName: owners.legalName,
    })
    .from(flightReports)
    .innerJoin(flights, eq(flights.id, flightReports.flightId))
    .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
    .leftJoin(holdingCompanies, eq(holdingCompanies.id, aircraft.holdingCompanyId))
    .leftJoin(shares, eq(shares.id, flightReports.shareId))
    .leftJoin(owners, eq(owners.id, shares.ownerId))
    .where(and(...filters))
    .orderBy(asc(flights.departsAt));
}

/** Budget category for each line, so the owner's statement and budget see the invoice. */
async function categoryIds(tx: Tx) {
  const rows = await tx.select({ id: budgetCategories.id, name: budgetCategories.nameEn }).from(budgetCategories);
  const by = (name: string) => rows.find((r) => r.name.toLowerCase() === name)?.id ?? null;
  return {
    fuel: by("fuel"),
    engine: by("maintenance"),
    propeller: by("maintenance"),
    airframe: by("maintenance"),
    avionics: by("maintenance"),
    pilot: by("crew"),
    handling: by("airport fees"),
    airport_fees: by("airport fees"),
    hotel: by("crew"),
    per_diem: by("crew"),
    catering: null,
    other: null,
  } as Record<string, string | null>;
}

/**
 * Issues the invoice for an approved report: numbered in the company's
 * sequence, lines fixed, the owner's statement updated, the owner notified.
 *
 * The invoice is the one source of a flight's costs in the owner's ledger: a
 * flight that already has a live invoice (issued here or uploaded) is refused,
 * so its costs are never booked twice.
 *
 * `zeroRated`: finance marks an international flight as zero-rated (no GST or
 * QST). Stored on the invoice and in the audit; taxed by default.
 */
export async function issueInvoice(
  db: Db,
  actor: Actor,
  reportId: string,
  { zeroRated = false, now = new Date() }: { zeroRated?: boolean; now?: Date } = {},
) {
  const { invoice, emails } = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(flightReports).where(eq(flightReports.id, reportId)).for("update");
    if (!locked) throw new NotFoundError("flight_report");
    if (locked.status !== "approved") throw new ConflictError("report_not_approved");
    if (locked.invoiceId) throw new ConflictError("report_already_invoiced");
    const draft = await draftFor(tx, reportId, { zeroRated });
    if (!draft.company) throw new ConflictError("no_holding_company");
    authorizeInvoicing(actor, draft.company.id);
    if (!draft.rate) throw new ConflictError("no_rate");
    if (!draft.ownerId || !locked.shareId) throw new ConflictError("share_required");
    if (draft.needsFxRate) throw new ConflictError("fx_rate_missing");
    const [live] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.flightId, locked.flightId), ne(invoices.status, "void")))
      .limit(1);
    if (live) throw new ConflictError("flight_already_invoiced");

    // The company row is the lock that keeps numbers unique and gapless.
    const [company] = await tx
      .select()
      .from(holdingCompanies)
      .where(eq(holdingCompanies.id, draft.company.id))
      .for("update");
    const issuedOn = zonedDay(now);
    const year = Number(issuedOn.slice(0, 4));
    const seq = company!.invoiceSeqYear === year ? company!.invoiceSeq + 1 : 1;
    const prefix = company!.invoicePrefix || defaultPrefix(company!.legalName);
    const number = invoiceNumber(prefix, year, seq);
    const taken = await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, number)).limit(1);
    if (taken.length) throw new ConflictError("invoice_number_taken");
    await tx
      .update(holdingCompanies)
      .set({ invoiceSeq: seq, invoiceSeqYear: year, invoicePrefix: prefix })
      .where(eq(holdingCompanies.id, company!.id));

    const due = new Date(`${issuedOn}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + company!.paymentTermsDays);
    const issuer: InvoiceIssuer = {
      legalName: company!.legalName,
      address: company!.address,
      gstNumber: company!.gstNumber,
      qstNumber: company!.qstNumber,
      paymentInstructions: company!.paymentInstructions,
    };
    const [invoice] = await tx
      .insert(invoices)
      .values({
        shareId: locked.shareId,
        flightId: locked.flightId,
        number,
        issuedOn,
        dueOn: due.toISOString().slice(0, 10),
        totalCents: draft.totalCents,
        subtotalCents: draft.subtotalCents,
        gstCents: draft.gstCents,
        qstCents: draft.qstCents,
        zeroRated,
        holdingCompanyId: company!.id,
        issuer,
      })
      .returning();
    await tx.insert(invoiceLines).values(draft.lines.map((l, i) => ({ ...l, invoiceId: invoice!.id, sortOrder: i })));
    await tx.update(flightReports).set({ invoiceId: invoice!.id }).where(eq(flightReports.id, reportId));
    // The reserve part of each hour goes into the aircraft's reserves.
    await creditReserves(
      tx,
      { aircraftId: draft.flight.aircraftId, invoiceId: invoice!.id, occurredOn: draft.day, actorUserId: actor.id },
      draft.lines,
    );

    // The owner's ledger: one cost per billed line, plus the taxes, labelled in the owner's language.
    const cats = await categoryIds(tx);
    const occurredOn = draft.day;
    await tx.insert(transactions).values([
      ...draft.lines
        .filter((l) => l.amountCents !== 0)
        .map((l) => ({
          shareId: locked.shareId!,
          occurredOn,
          categoryId: cats[l.part] ?? null,
          kind: "cost" as const,
          amountCents: l.amountCents,
          invoiceId: invoice!.id,
          description: `${number} · ${ledgerLabel(draft.locale, l)}`,
          createdByUserId: actor.id,
        })),
      ...(draft.gstCents + draft.qstCents > 0
        ? [
            {
              shareId: locked.shareId!,
              occurredOn,
              categoryId: null,
              kind: "cost" as const,
              amountCents: draft.gstCents + draft.qstCents,
              invoiceId: invoice!.id,
              description: `${number} · ${ledgerLabel(draft.locale, "taxes")}`,
              createdByUserId: actor.id,
            },
          ]
        : []),
    ]);

    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "invoice.issue",
      entityType: "invoice",
      entityId: invoice!.id,
      after: {
        number,
        reportId,
        totalCents: draft.totalCents,
        gstCents: draft.gstCents,
        qstCents: draft.qstCents,
        zeroRated,
      },
    });
    await emit(tx, "invoice.issued", {
      invoiceId: invoice!.id,
      number,
      shareId: invoice!.shareId,
      totalCents: invoice!.totalCents,
      currency: invoice!.currency,
      issuedOn,
    });
    const emails = await notifyOwnerMembers(
      tx,
      draft.ownerId,
      "invoice.issued",
      { number, amount: formatMoney(draft.totalCents, "CAD", "fr"), aircraft: draft.registration },
      { template: "invoiceIssued", path: `/invoices/${invoice!.id}` },
    );
    return { invoice: invoice!, emails };
  });
  await sendPendingEmails(db, emails);
  return invoice;
}

/**
 * One invoice with its lines and the flight report it came from. Owners see
 * their own (with finance access), finance all, managers their companies'.
 */
export async function getInvoiceDetail(db: Db, actor: Actor, id: string) {
  const [invoice] = await db
    .select({
      invoice: invoices,
      ownerId: shares.ownerId,
      ownerName: owners.legalName,
      registration: aircraft.registration,
      model: aircraft.model,
    })
    .from(invoices)
    .innerJoin(shares, eq(shares.id, invoices.shareId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(eq(invoices.id, id));
  if (!invoice) throw new NotFoundError("invoice");
  const managed =
    invoice.invoice.holdingCompanyId && actor.managedCompanyIds?.includes(invoice.invoice.holdingCompanyId);
  if (!managed) authorize(actor, "finance:read", { ownerIds: [invoice.ownerId] });
  const [lines, [report]] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.sortOrder)),
    db
      .select({
        flightMinutes: flightReports.flightMinutes,
        fromAirport: flights.fromAirport,
        toAirport: flights.toAirport,
        departsAt: flights.departsAt,
        pilotName: user.name,
      })
      .from(flightReports)
      .innerJoin(flights, eq(flights.id, flightReports.flightId))
      .leftJoin(user, eq(user.id, flightReports.pilotUserId))
      // By the invoice's flight, so a voided invoice (its report unlinked to be reissued) keeps its flight.
      .where(invoice.invoice.flightId ? eq(flightReports.flightId, invoice.invoice.flightId) : sql`false`),
  ]);
  return { ...invoice, lines, report: report ?? null };
}

/** Issued invoices of the companies a manager runs, newest first. */
export async function listManagedInvoices(db: Db, actor: Actor) {
  const companies = actor.managedCompanyIds ?? [];
  if (!companies.length) return [];
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      issuedOn: invoices.issuedOn,
      dueOn: invoices.dueOn,
      totalCents: invoices.totalCents,
      currency: invoices.currency,
      status: invoices.status,
      ownerName: owners.legalName,
      registration: aircraft.registration,
      companyName: holdingCompanies.legalName,
    })
    .from(invoices)
    .innerJoin(shares, eq(shares.id, invoices.shareId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .innerJoin(holdingCompanies, eq(holdingCompanies.id, invoices.holdingCompanyId))
    .where(and(isNotNull(invoices.holdingCompanyId), inArray(invoices.holdingCompanyId, [...companies])))
    .orderBy(desc(invoices.issuedOn), desc(invoices.number))
    .limit(200);
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const billingProfileInput = z.object({
  address: optional(500),
  gstNumber: optional(40),
  qstNumber: optional(40),
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((v) => v ?? null),
  paymentTermsDays: z.coerce.number().int().min(0).max(120),
  paymentInstructions: optional(1000),
});
export type BillingProfileInput = z.input<typeof billingProfileInput>;

/** What the company's invoices say and how they're numbered. Finance sets it. */
export async function updateBillingProfile(db: Db, actor: Actor, id: string, raw: BillingProfileInput) {
  authorize(actor, "finance:write");
  const input = billingProfileInput.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(holdingCompanies).where(eq(holdingCompanies.id, id)).for("update");
    if (!before) throw new NotFoundError("holding_company");
    if (input.invoicePrefix && input.invoicePrefix !== before.invoicePrefix) {
      const [clash] = await tx
        .select({ id: holdingCompanies.id })
        .from(holdingCompanies)
        .where(and(eq(holdingCompanies.invoicePrefix, input.invoicePrefix), sql`${holdingCompanies.id} <> ${id}`));
      if (clash) throw new ConflictError("prefix_taken");
    }
    const [row] = await tx.update(holdingCompanies).set(input).where(eq(holdingCompanies.id, id)).returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "holding_company.billing",
      entityType: "holding_company",
      entityId: id,
      before: {
        address: before.address,
        gstNumber: before.gstNumber,
        qstNumber: before.qstNumber,
        invoicePrefix: before.invoicePrefix,
        paymentTermsDays: before.paymentTermsDays,
      },
      after: input,
    });
    return row!;
  });
}

/** The people who issue a company's invoices. */
export async function listManagers(db: Db, actor: Actor, companyId: string) {
  authorize(actor, "owners:read");
  return db
    .select({ id: holdingCompanyManagers.id, userId: user.id, name: user.name, email: user.email })
    .from(holdingCompanyManagers)
    .innerJoin(user, eq(user.id, holdingCompanyManagers.userId))
    .where(eq(holdingCompanyManagers.holdingCompanyId, companyId))
    .orderBy(asc(user.name));
}

/** Gives an existing account the company's invoicing. They sign up first; this links them. */
export async function addManager(db: Db, actor: Actor, companyId: string, raw: { email: string }) {
  authorize(actor, "finance:write");
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(raw);
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: user.id, staffRole: user.staffRole })
      .from(user)
      .where(eq(user.email, email));
    if (!person) throw new ConflictError("no_account_for_email");
    if (person.staffRole) throw new ConflictError("staff_already_has_access");
    const [row] = await tx
      .insert(holdingCompanyManagers)
      .values({ holdingCompanyId: companyId, userId: person.id })
      .onConflictDoNothing()
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "holding_company.manager.add",
      entityType: "holding_company",
      entityId: companyId,
      after: { userId: person.id },
    });
    return row ?? null;
  });
}

export async function removeManager(db: Db, actor: Actor, companyId: string, managerId: string) {
  authorize(actor, "finance:write");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(holdingCompanyManagers)
      .where(and(eq(holdingCompanyManagers.id, managerId), eq(holdingCompanyManagers.holdingCompanyId, companyId)))
      .returning();
    if (!row) throw new NotFoundError("manager");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "holding_company.manager.remove",
      entityType: "holding_company",
      entityId: companyId,
      before: { userId: row.userId },
    });
  });
}
