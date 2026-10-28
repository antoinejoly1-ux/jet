/**
 * The two append-only ledgers: money (transactions) and hours. Nothing here
 * edits or deletes an entry. A mistake is corrected by a reversing entry that
 * points at the original, so every balance can be traced line by line.
 */
import "server-only";
import { and, asc, desc, eq, gte, isNotNull, lt, ne, or, sql, sum, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/lib/db";
import { aircraft, budgetCategories, hourLedger, owners, shares, transactions, user } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { hoursInput, transactionInput, type HoursInput, type TransactionInput } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { emit } from "./outbox";
import { ConflictError, NotFoundError } from "./errors";

const yearRange = (year: number): SQL[] => [
  gte(transactions.occurredOn, `${year}-01-01`),
  lt(transactions.occurredOn, `${year + 1}-01-01`),
];

/** The most entries one list shows; the page says so when there are more and suggests a filter. */
export const TRANSACTIONS_SHOWN = 500;

export async function listTransactions(
  db: Db,
  actor: Actor,
  opts: { shareId?: string; year?: number; kind?: string } = {},
) {
  authorize(actor, "finance:read");
  const filters: SQL[] = [];
  if (opts.shareId) filters.push(eq(transactions.shareId, opts.shareId));
  if (opts.year) filters.push(...yearRange(opts.year));
  if (opts.kind === "cost" || opts.kind === "revenue" || opts.kind === "payment")
    filters.push(eq(transactions.kind, opts.kind));
  const reversal = alias(transactions, "reversal");
  return db
    .select({
      id: transactions.id,
      shareId: transactions.shareId,
      registration: aircraft.registration,
      ownerName: owners.legalName,
      occurredOn: transactions.occurredOn,
      kind: transactions.kind,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      description: transactions.description,
      categoryFr: budgetCategories.nameFr,
      categoryEn: budgetCategories.nameEn,
      reversesId: transactions.reversesId,
      reversedById: reversal.id,
      source: transactions.source,
      createdByName: user.name,
    })
    .from(transactions)
    .innerJoin(shares, eq(shares.id, transactions.shareId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .leftJoin(budgetCategories, eq(budgetCategories.id, transactions.categoryId))
    .leftJoin(user, eq(user.id, transactions.createdByUserId))
    .leftJoin(reversal, eq(reversal.reversesId, transactions.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(TRANSACTIONS_SHOWN);
}

export async function addTransaction(
  db: Db,
  actor: Actor,
  raw: TransactionInput,
  source: "manual" | "import" = "manual",
) {
  authorize(actor, "finance:write");
  const input = transactionInput.parse(raw);
  return db.transaction(async (tx) => {
    const [share] = await tx.select({ id: shares.id }).from(shares).where(eq(shares.id, input.shareId));
    if (!share) throw new NotFoundError("share");
    const [row] = await tx
      .insert(transactions)
      .values({
        shareId: input.shareId,
        occurredOn: input.occurredOn,
        kind: input.kind,
        amountCents: input.amount,
        currency: input.currency,
        categoryId: input.categoryId ?? null,
        description: input.description,
        source,
        createdByUserId: actor.id,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "transaction.add",
      entityType: "transaction",
      entityId: row.id,
      after: { kind: row.kind, amountCents: row.amountCents, occurredOn: row.occurredOn },
    });
    await emit(tx, "transaction.created", {
      transactionId: row.id,
      shareId: row.shareId,
      occurredOn: row.occurredOn,
      kind: row.kind,
      amountCents: row.amountCents,
      currency: row.currency,
      categoryId: row.categoryId,
      reversesId: null,
    });
    return row;
  });
}

/** Cancels an entry by adding its exact opposite. An entry can be reversed once; a reversal can't be reversed. */
export async function reverseTransaction(db: Db, actor: Actor, id: string, reason: string) {
  authorize(actor, "finance:write");
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(transactions).where(eq(transactions.id, id)).for("update");
    if (!original) throw new NotFoundError("transaction");
    if (original.reversesId) throw new ConflictError("cannot_reverse_a_reversal");
    const already = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.reversesId, id))
      .limit(1);
    if (already.length > 0) throw new ConflictError("already_reversed");

    const [row] = await tx
      .insert(transactions)
      .values({
        shareId: original.shareId,
        occurredOn: new Date().toISOString().slice(0, 10),
        kind: original.kind,
        amountCents: -original.amountCents,
        currency: original.currency,
        categoryId: original.categoryId,
        description: reason.trim() || null,
        reversesId: original.id,
        source: "manual",
        createdByUserId: actor.id,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "transaction.reverse",
      entityType: "transaction",
      entityId: original.id,
      after: { reversalId: row.id, reason },
    });
    await emit(tx, "transaction.created", {
      transactionId: row.id,
      shareId: row.shareId,
      occurredOn: row.occurredOn,
      kind: row.kind,
      amountCents: row.amountCents,
      currency: row.currency,
      categoryId: row.categoryId,
      reversesId: original.id,
    });
    return row;
  });
}

export async function listHours(db: Db, actor: Actor, shareId: string) {
  authorize(actor, "finance:read");
  const entries = await db
    .select({
      id: hourLedger.id,
      kind: hourLedger.kind,
      minutes: hourLedger.minutes,
      note: hourLedger.note,
      flightId: hourLedger.flightId,
      createdAt: hourLedger.createdAt,
      createdByName: user.name,
    })
    .from(hourLedger)
    .leftJoin(user, eq(user.id, hourLedger.createdByUserId))
    .where(eq(hourLedger.shareId, shareId))
    .orderBy(desc(hourLedger.createdAt));
  const balance = entries.reduce((n, e) => n + e.minutes, 0);
  return { entries, balanceMinutes: balance };
}

/** Records hours bought, or a signed adjustment, on a share. Flights deduct hours separately. */
export async function addHours(db: Db, actor: Actor, shareId: string, raw: HoursInput) {
  authorize(actor, "finance:write");
  const input = hoursInput.parse(raw);
  if (input.kind === "purchase" && input.hours < 0) throw new ConflictError("purchase_must_be_positive");
  return db.transaction(async (tx) => {
    const [share] = await tx.select({ id: shares.id }).from(shares).where(eq(shares.id, shareId));
    if (!share) throw new NotFoundError("share");
    const [row] = await tx
      .insert(hourLedger)
      .values({ shareId, kind: input.kind, minutes: input.hours, note: input.note, createdByUserId: actor.id })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "hours.add",
      entityType: "share",
      entityId: shareId,
      after: { kind: row.kind, minutes: row.minutes },
    });
    return row;
  });
}

/** Costs per category for one share and year (cost entries net of reversals). */
export async function spentByCategory(db: Db, shareId: string, year: number) {
  const rows = await db
    .select({ categoryId: transactions.categoryId, cents: sum(transactions.amountCents).mapWith(Number) })
    .from(transactions)
    .where(
      and(
        eq(transactions.shareId, shareId),
        eq(transactions.kind, "cost"),
        isNotNull(transactions.categoryId),
        ...yearRange(year),
      ),
    )
    .groupBy(transactions.categoryId);
  return new Map(rows.map((r) => [r.categoryId!, r.cents ?? 0]));
}

/** Costs and revenue per month for one share and year. */
export async function monthlyTotals(db: Db, shareId: string, year: number) {
  const rows = await db
    .select({
      month: sql<number>`extract(month from ${transactions.occurredOn})::int`,
      kind: transactions.kind,
      cents: sum(transactions.amountCents).mapWith(Number),
    })
    .from(transactions)
    // Categorised entries only, like « Dépensé » itself: invoice tax rows aren't spending.
    .where(
      and(
        eq(transactions.shareId, shareId),
        or(ne(transactions.kind, "cost"), isNotNull(transactions.categoryId)),
        ...yearRange(year),
      ),
    )
    .groupBy(sql`1`, transactions.kind)
    .orderBy(asc(sql`1`));
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    costCents: rows.find((r) => r.month === i + 1 && r.kind === "cost")?.cents ?? 0,
    revenueCents: rows.find((r) => r.month === i + 1 && r.kind === "revenue")?.cents ?? 0,
  }));
}

export async function listCategories(db: Db) {
  return db.select().from(budgetCategories).orderBy(asc(budgetCategories.sortOrder), asc(budgetCategories.nameFr));
}
