/**
 * The yearly statement for one share: what was planned, what was spent, every
 * entry, hours in and out, and invoices. Owners get their own shares only and
 * never see a budget before it's published.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sum } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  aircraft,
  budgetCategories,
  budgets,
  flights,
  hourLedger,
  invoices,
  owners,
  shares,
  transactions,
} from "@/lib/db/schema";
import { authorize, isStaff, financeOwnerIds, type Actor } from "@/lib/auth/policy";
import { loadBudget } from "./budgets";
import { NotFoundError } from "./errors";

const yearBounds = (year: number) => ({ from: `${year}-01-01`, to: `${year + 1}-01-01` });

export async function getAnnualStatement(
  db: Db,
  actor: Actor,
  shareId: string,
  year: number,
  { ownerView = !isStaff(actor) } = {},
) {
  const [share] = await db
    .select({
      id: shares.id,
      ownerId: shares.ownerId,
      ownerName: owners.legalName,
      registration: aircraft.registration,
      model: aircraft.model,
      percentageBp: shares.percentageBp,
      annualMinutes: shares.annualHoursMinutes,
    })
    .from(shares)
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(eq(shares.id, shareId));
  if (!share) throw new NotFoundError("share");
  authorize(actor, "finance:read", { ownerIds: [share.ownerId] });
  const { from, to } = yearBounds(year);
  const yearStart = new Date(`${from}T00:00:00Z`);
  const yearEnd = new Date(`${to}T00:00:00Z`);

  const [budget, [status], entries, hours, [opening], invoiceRows] = await Promise.all([
    loadBudget(db, shareId, year),
    db
      .select({ status: budgets.status, currency: budgets.currency })
      .from(budgets)
      .where(and(eq(budgets.shareId, shareId), eq(budgets.year, year))),
    db
      .select({
        occurredOn: transactions.occurredOn,
        kind: transactions.kind,
        amountCents: transactions.amountCents,
        currency: transactions.currency,
        description: transactions.description,
        categoryFr: budgetCategories.nameFr,
        categoryEn: budgetCategories.nameEn,
        reversesId: transactions.reversesId,
      })
      .from(transactions)
      .leftJoin(budgetCategories, eq(budgetCategories.id, transactions.categoryId))
      .where(
        and(eq(transactions.shareId, shareId), gte(transactions.occurredOn, from), lt(transactions.occurredOn, to)),
      )
      .orderBy(asc(transactions.occurredOn), asc(transactions.createdAt)),
    db
      .select({
        createdAt: hourLedger.createdAt,
        kind: hourLedger.kind,
        minutes: hourLedger.minutes,
        note: hourLedger.note,
        fromAirport: flights.fromAirport,
        toAirport: flights.toAirport,
        departsAt: flights.departsAt,
      })
      .from(hourLedger)
      .leftJoin(flights, eq(flights.id, hourLedger.flightId))
      .where(
        and(eq(hourLedger.shareId, shareId), gte(hourLedger.createdAt, yearStart), lt(hourLedger.createdAt, yearEnd)),
      )
      .orderBy(asc(hourLedger.createdAt)),
    db
      .select({ minutes: sum(hourLedger.minutes).mapWith(Number) })
      .from(hourLedger)
      .where(and(eq(hourLedger.shareId, shareId), lt(hourLedger.createdAt, yearStart))),
    db
      .select({
        number: invoices.number,
        issuedOn: invoices.issuedOn,
        dueOn: invoices.dueOn,
        totalCents: invoices.totalCents,
        currency: invoices.currency,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(eq(invoices.shareId, shareId), gte(invoices.issuedOn, from), lt(invoices.issuedOn, to)))
      .orderBy(asc(invoices.issuedOn)),
  ]);

  const published = status?.status === "published";
  const showPlan = published || !ownerView;
  const openingMinutes = opening?.minutes ?? 0;
  const movement = hours.reduce((n, h) => n + h.minutes, 0);
  return {
    share,
    year,
    currency: status?.currency ?? "CAD",
    budgetPublished: published,
    categories: budget.rows
      .map((r) => ({ ...r, plannedCents: showPlan ? r.plannedCents : 0 }))
      .filter((r) => r.plannedCents || r.spentCents),
    totals: {
      plannedCents: showPlan ? budget.totals.plannedCents : 0,
      spentCents: budget.totals.spentCents,
      revenueCents: entries.filter((e) => e.kind === "revenue").reduce((n, e) => n + e.amountCents, 0),
      paymentsCents: entries.filter((e) => e.kind === "payment").reduce((n, e) => n + e.amountCents, 0),
    },
    entries,
    hours: {
      openingMinutes,
      purchasedMinutes: hours.filter((h) => h.kind === "purchase").reduce((n, h) => n + h.minutes, 0),
      flownMinutes: -hours.filter((h) => h.kind === "flight").reduce((n, h) => n + h.minutes, 0),
      adjustedMinutes: hours.filter((h) => h.kind === "adjustment").reduce((n, h) => n + h.minutes, 0),
      closingMinutes: openingMinutes + movement,
      entries: hours,
    },
    invoices: invoiceRows,
  };
}

export type AnnualStatement = Awaited<ReturnType<typeof getAnnualStatement>>;

/** The signed-in owner's transactions for a year, across their shares, for the CSV export. */
export async function listOwnerTransactions(db: Db, actor: Actor, year: number) {
  const ids = financeOwnerIds(actor);
  if (ids.length === 0) return [];
  authorize(actor, "finance:read", { ownerIds: ids });
  const { from, to } = yearBounds(year);
  return db
    .select({
      occurredOn: transactions.occurredOn,
      registration: aircraft.registration,
      kind: transactions.kind,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      categoryFr: budgetCategories.nameFr,
      categoryEn: budgetCategories.nameEn,
      description: transactions.description,
      reversesId: transactions.reversesId,
    })
    .from(transactions)
    .innerJoin(shares, eq(shares.id, transactions.shareId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .leftJoin(budgetCategories, eq(budgetCategories.id, transactions.categoryId))
    .where(
      and(
        inArray(shares.ownerId, [...ids]),
        isNull(aircraft.deletedAt),
        gte(transactions.occurredOn, from),
        lt(transactions.occurredOn, to),
      ),
    )
    .orderBy(desc(transactions.occurredOn));
}
