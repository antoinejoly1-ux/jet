/**
 * A holding company's results for a year: what it billed its owners against
 * what it paid, so everyone can see whether the company balances. Revenue
 * comes from its invoices; expenses from the flight reports on its aircraft
 * (fuel, fees, hotels, per diem), the maintenance paid from the reserves, and
 * what it paid outside any flight (pilot pay, insurance, hangar).
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import {
  aircraft,
  companyExpenses,
  flightReportExpenses,
  flightReports,
  flights,
  holdingCompanies,
  invoiceLines,
  invoices,
  reserveLedger,
  shares,
  user,
} from "@/lib/db/schema";
import { authorize, can, financeOwnerIds, type Actor } from "@/lib/auth/policy";
import { zonedDay } from "@/lib/time";
import { money } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";
import { RESERVE_PARTS } from "./rates";

export const COMPANY_EXPENSE_CATEGORIES = [
  "pilot_pay",
  "insurance",
  "hangar",
  "maintenance",
  "fuel",
  "fees",
  "other",
] as const;

/** Revenue lines, in the order shown. */
export type RevenueKey = "fuel" | "pilot" | "reserves" | "rebilled" | "uploaded";
/** Expense lines: flight report categories, company categories, and maintenance paid from reserves. */
export type ExpenseKey = string;

/**
 * Finance and the company's managers see its results; so do its owners
 * (with finance access) while they hold a share in one of its aircraft.
 */
async function authorizeCompany(db: Db, actor: Actor, companyId: string) {
  if (can(actor, "finance:read") || actor.managedCompanyIds?.includes(companyId)) return;
  const ids = financeOwnerIds(actor);
  const today = zonedDay(new Date());
  const [held] = ids.length
    ? await db
        .select({ id: shares.id })
        .from(shares)
        .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
        .where(
          and(
            eq(aircraft.holdingCompanyId, companyId),
            inArray(shares.ownerId, [...ids]),
            sql`${shares.startsOn} <= ${today}`,
            sql`(${shares.endsOn} is null or ${shares.endsOn} > ${today})`,
          ),
        )
        .limit(1)
    : [];
  authorize(actor, "finance:read", { ownerIds: held ? [...ids] : [] });
}

/** The companies whose results this owner may open: those of the aircraft they hold shares in. */
export async function listOwnerCompanies(db: Db, actor: Actor) {
  const ids = financeOwnerIds(actor);
  if (!ids.length) return [];
  const today = zonedDay(new Date());
  return db
    .selectDistinct({ id: holdingCompanies.id, legalName: holdingCompanies.legalName })
    .from(shares)
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .innerJoin(holdingCompanies, eq(holdingCompanies.id, aircraft.holdingCompanyId))
    .where(
      and(
        inArray(shares.ownerId, [...ids]),
        isNull(aircraft.deletedAt),
        sql`${shares.startsOn} <= ${today}`,
        sql`(${shares.endsOn} is null or ${shares.endsOn} > ${today})`,
      ),
    )
    .orderBy(asc(holdingCompanies.legalName));
}

export async function getCompanyPnl(db: Db, actor: Actor, companyId: string, year: number) {
  await authorizeCompany(db, actor, companyId);
  const [company] = await db
    .select({ id: holdingCompanies.id, legalName: holdingCompanies.legalName })
    .from(holdingCompanies)
    .where(eq(holdingCompanies.id, companyId));
  if (!company) throw new NotFoundError("holding_company");
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const planes = await db
    .select({ id: aircraft.id, registration: aircraft.registration })
    .from(aircraft)
    .where(eq(aircraft.holdingCompanyId, companyId));
  const planeIds = planes.map((p) => p.id);

  const [billed, uploaded, reportExpenses, ownExpenses, reserves] = await Promise.all([
    db
      .select({
        kind: invoiceLines.kind,
        part: invoiceLines.part,
        cents: sql<number>`sum(${invoiceLines.amountCents})`.mapWith(Number),
      })
      .from(invoiceLines)
      .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
      .where(
        and(
          eq(invoices.holdingCompanyId, companyId),
          ne(invoices.status, "void"),
          gte(invoices.issuedOn, from),
          lt(invoices.issuedOn, to),
        ),
      )
      .groupBy(invoiceLines.kind, invoiceLines.part),
    // Invoices uploaded as PDFs (before the portal issued them) have no lines: their total counts.
    planeIds.length
      ? db
          .select({ cents: sql<number>`coalesce(sum(${invoices.totalCents}), 0)`.mapWith(Number) })
          .from(invoices)
          .innerJoin(shares, eq(shares.id, invoices.shareId))
          .where(
            and(
              inArray(shares.aircraftId, planeIds),
              isNull(invoices.holdingCompanyId),
              ne(invoices.status, "void"),
              gte(invoices.issuedOn, from),
              lt(invoices.issuedOn, to),
            ),
          )
      : [{ cents: 0 }],
    planeIds.length
      ? db
          .select({
            category: flightReportExpenses.category,
            cents: sql<number>`sum(${flightReportExpenses.amountCents})`.mapWith(Number),
          })
          .from(flightReportExpenses)
          .innerJoin(flightReports, eq(flightReports.id, flightReportExpenses.reportId))
          .innerJoin(flights, eq(flights.id, flightReports.flightId))
          .where(
            and(
              inArray(flights.aircraftId, planeIds),
              eq(flightReports.status, "approved"),
              sql`(${flights.departsAt} at time zone 'America/Montreal')::date >= ${from}::date`,
              sql`(${flights.departsAt} at time zone 'America/Montreal')::date < ${to}::date`,
            ),
          )
          .groupBy(flightReportExpenses.category)
      : [],
    db
      .select({
        category: companyExpenses.category,
        cents: sql<number>`sum(${companyExpenses.amountCents})`.mapWith(Number),
      })
      .from(companyExpenses)
      .where(
        and(
          eq(companyExpenses.holdingCompanyId, companyId),
          gte(companyExpenses.occurredOn, from),
          lt(companyExpenses.occurredOn, to),
        ),
      )
      .groupBy(companyExpenses.category),
    planeIds.length
      ? db
          .select({
            setAside:
              sql<number>`coalesce(sum(${reserveLedger.amountCents}) filter (where ${reserveLedger.invoiceId} is not null and ${reserveLedger.occurredOn} >= ${from} and ${reserveLedger.occurredOn} < ${to}), 0)`.mapWith(
                Number,
              ),
            spent:
              sql<number>`coalesce(-sum(${reserveLedger.amountCents}) filter (where ${reserveLedger.kind} = 'work' and ${reserveLedger.occurredOn} >= ${from} and ${reserveLedger.occurredOn} < ${to}), 0)`.mapWith(
                Number,
              ),
            balance:
              sql<number>`coalesce(sum(${reserveLedger.amountCents}) filter (where ${reserveLedger.occurredOn} < ${to}), 0)`.mapWith(
                Number,
              ),
          })
          .from(reserveLedger)
          .where(inArray(reserveLedger.aircraftId, planeIds))
      : [{ setAside: 0, spent: 0, balance: 0 }],
  ]);

  const sumWhere = (pred: (r: (typeof billed)[number]) => boolean) =>
    billed.filter(pred).reduce((s, r) => s + r.cents, 0);
  const revenue: { key: RevenueKey; cents: number }[] = [
    { key: "fuel", cents: sumWhere((r) => r.kind === "hours" && r.part === "fuel") },
    { key: "pilot", cents: sumWhere((r) => r.kind === "hours" && r.part === "pilot") },
    {
      key: "reserves",
      cents: sumWhere((r) => r.kind === "hours" && (RESERVE_PARTS as readonly string[]).includes(r.part)),
    },
    { key: "rebilled", cents: sumWhere((r) => r.kind === "expense") },
    { key: "uploaded", cents: uploaded[0]?.cents ?? 0 },
  ];

  // Expenses by kind: what the pilots paid on the way, what the company paid otherwise, and the
  // maintenance paid from the reserves.
  const expenseMap = new Map<string, number>();
  const add = (key: string, cents: number) => expenseMap.set(key, (expenseMap.get(key) ?? 0) + cents);
  for (const e of reportExpenses) add(e.category === "fuel" ? "fuel" : `trip_${e.category}`, e.cents);
  for (const e of ownExpenses) add(e.category, e.cents);
  const r = reserves[0] ?? { setAside: 0, spent: 0, balance: 0 };
  if (r.spent) add("maintenance_reserves", r.spent);
  const expenses = [...expenseMap.entries()]
    .filter(([, cents]) => cents !== 0)
    .map(([key, cents]) => ({ key: key as ExpenseKey, cents }))
    .sort((a, b) => b.cents - a.cents);

  const revenueCents = revenue.reduce((s, x) => s + x.cents, 0);
  const expensesCents = expenses.reduce((s, x) => s + x.cents, 0);
  return {
    company,
    year,
    aircraft: planes,
    revenue,
    revenueCents,
    expenses,
    expensesCents,
    resultCents: revenueCents - expensesCents,
    reserves: { setAsideCents: r.setAside, spentCents: r.spent, balanceCents: r.balance },
  };
}

export const companyExpenseInput = z.object({
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(COMPANY_EXPENSE_CATEGORIES),
  amount: money.refine((c) => c > 0, { message: "invalid_amount" }),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null),
});
export type CompanyExpenseInput = z.input<typeof companyExpenseInput>;

/** Something the company paid outside a flight: pilot pay, insurance, the hangar… */
export async function addCompanyExpense(db: Db, actor: Actor, companyId: string, raw: CompanyExpenseInput) {
  authorize(actor, "finance:write");
  const input = companyExpenseInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(companyExpenses)
      .values({
        holdingCompanyId: companyId,
        occurredOn: input.occurredOn,
        category: input.category,
        amountCents: input.amount,
        description: input.description,
        createdByUserId: actor.id,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "company_expense.add",
      entityType: "holding_company",
      entityId: companyId,
      after: { category: input.category, amountCents: input.amount, occurredOn: input.occurredOn },
    });
    return row!;
  });
}

/** Cancels an entry with an opposite one: the ledger is never edited. */
export async function reverseCompanyExpense(db: Db, actor: Actor, companyId: string, expenseId: string) {
  authorize(actor, "finance:write");
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(companyExpenses)
      .where(and(eq(companyExpenses.id, expenseId), eq(companyExpenses.holdingCompanyId, companyId)))
      .for("update");
    if (!entry) throw new NotFoundError("company_expense");
    if (entry.reversesId) throw new ConflictError("already_reversed");
    const [already] = await tx
      .select({ id: companyExpenses.id })
      .from(companyExpenses)
      .where(eq(companyExpenses.reversesId, expenseId));
    if (already) throw new ConflictError("already_reversed");
    const [row] = await tx
      .insert(companyExpenses)
      .values({
        holdingCompanyId: companyId,
        occurredOn: entry.occurredOn,
        category: entry.category,
        amountCents: -entry.amountCents,
        description: entry.description,
        reversesId: entry.id,
        createdByUserId: actor.id,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "company_expense.reverse",
      entityType: "holding_company",
      entityId: companyId,
      after: { reverses: expenseId },
    });
    return row!;
  });
}

/** The year's company expenses, latest first, with whether each was reversed. */
export async function listCompanyExpenses(db: Db, actor: Actor, companyId: string, year: number) {
  await authorizeCompany(db, actor, companyId);
  return db
    .select({
      id: companyExpenses.id,
      occurredOn: companyExpenses.occurredOn,
      category: companyExpenses.category,
      amountCents: companyExpenses.amountCents,
      description: companyExpenses.description,
      reversesId: companyExpenses.reversesId,
      reversed: sql<boolean>`exists (select 1 from company_expenses r where r.reverses_id = ${companyExpenses.id})`,
      createdBy: user.name,
    })
    .from(companyExpenses)
    .leftJoin(user, eq(user.id, companyExpenses.createdByUserId))
    .where(
      and(
        eq(companyExpenses.holdingCompanyId, companyId),
        gte(companyExpenses.occurredOn, `${year}-01-01`),
        lt(companyExpenses.occurredOn, `${year + 1}-01-01`),
      ),
    )
    .orderBy(desc(companyExpenses.occurredOn), desc(companyExpenses.createdAt));
}
