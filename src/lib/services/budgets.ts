import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, budgetLines, budgets, owners, shares } from "@/lib/db/schema";
import { authorize, financeOwnerIds, type Actor } from "@/lib/auth/policy";
import { budgetLinesInput } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { emit } from "./outbox";
import { ConflictError, NotFoundError } from "./errors";
import { listCategories, monthlyTotals, spentByCategory } from "./ledger";
import { notifyOwnerMembers, sendPendingEmails } from "./owner-notifications";

export type BudgetView = Awaited<ReturnType<typeof loadBudget>>;

/** A share's budget for a year: every category with planned, spent and remaining. */
/** Budget lines with actual spending for one share and year. Callers check access first. */
export async function loadBudget(db: Db, shareId: string, year: number) {
  const [budget] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.shareId, shareId), eq(budgets.year, year)));
  const [categories, spent, lines] = await Promise.all([
    listCategories(db),
    spentByCategory(db, shareId, year),
    budget ? db.select().from(budgetLines).where(eq(budgetLines.budgetId, budget.id)) : Promise.resolve([]),
  ]);
  const rows = categories.map((c) => {
    const plannedCents = lines.find((l) => l.categoryId === c.id)?.plannedCents ?? 0;
    const spentCents = spent.get(c.id) ?? 0;
    return {
      categoryId: c.id,
      nameFr: c.nameFr,
      nameEn: c.nameEn,
      plannedCents,
      spentCents,
      remainingCents: plannedCents - spentCents,
    };
  });
  const totals = rows.reduce(
    (t, r) => ({ plannedCents: t.plannedCents + r.plannedCents, spentCents: t.spentCents + r.spentCents }),
    { plannedCents: 0, spentCents: 0 },
  );
  return { budget: budget ?? null, year, rows, totals };
}

export async function getBudget(db: Db, actor: Actor, shareId: string, year: number) {
  authorize(actor, "finance:read");
  return loadBudget(db, shareId, year);
}

/**
 * Saves planned amounts for every category. Creates the budget as a draft on
 * first save. Owners only see a budget once it is published.
 */
export async function saveBudget(db: Db, actor: Actor, shareId: string, year: number, raw: unknown) {
  authorize(actor, "finance:write");
  const lines = budgetLinesInput.parse(raw);
  await db.transaction(async (tx) => {
    const [share] = await tx.select({ id: shares.id }).from(shares).where(eq(shares.id, shareId));
    if (!share) throw new NotFoundError("share");
    let [budget] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.shareId, shareId), eq(budgets.year, year)))
      .for("update");
    budget ??= (await tx.insert(budgets).values({ shareId, year }).returning())[0];
    await tx.delete(budgetLines).where(eq(budgetLines.budgetId, budget!.id));
    const kept = lines.filter((l) => l.planned > 0);
    if (kept.length)
      await tx
        .insert(budgetLines)
        .values(kept.map((l) => ({ budgetId: budget!.id, categoryId: l.categoryId, plannedCents: l.planned })));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "budget.save",
      entityType: "share",
      entityId: shareId,
      after: { year, totalCents: kept.reduce((n, l) => n + l.planned, 0) },
    });
  });
}

/** Starts a year's budget from the previous year's amounts. */
export async function copyBudgetFromPreviousYear(db: Db, actor: Actor, shareId: string, year: number) {
  authorize(actor, "finance:write");
  const previous = await loadBudget(db, shareId, year - 1);
  if (!previous.budget) throw new ConflictError("no_previous_budget");
  const current = await loadBudget(db, shareId, year);
  if (current.budget) throw new ConflictError("budget_exists");
  await saveBudget(
    db,
    actor,
    shareId,
    year,
    previous.rows.map((r) => ({ categoryId: r.categoryId, planned: (r.plannedCents / 100).toFixed(2) })),
  );
}

/** Makes the budget visible to the owner and tells them. */
export async function publishBudget(db: Db, actor: Actor, shareId: string, year: number) {
  authorize(actor, "finance:write");
  const emails = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: budgets.id, status: budgets.status, ownerId: shares.ownerId, registration: aircraft.registration })
      .from(budgets)
      .innerJoin(shares, eq(shares.id, budgets.shareId))
      .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
      .where(and(eq(budgets.shareId, shareId), eq(budgets.year, year)))
      .for("update", { of: budgets });
    if (!row) throw new ConflictError("budget_missing");
    if (row.status === "published") return [];
    await tx.update(budgets).set({ status: "published" }).where(eq(budgets.id, row.id));
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "budget.publish",
      entityType: "share",
      entityId: shareId,
      after: { year },
    });
    await emit(tx, "budget.published", { shareId, year });
    return notifyOwnerMembers(
      tx,
      row.ownerId,
      "budget.published",
      { year: String(year), aircraft: row.registration },
      { template: "budgetPublished", path: "/finances" },
    );
  });
  await sendPendingEmails(db, emails);
}

/**
 * The owner's Finances page: for each of their shares, the published budget,
 * actual costs by category and month. Unpublished budgets stay hidden.
 */
export async function getOwnerFinances(db: Db, actor: Actor, year: number) {
  const ids = financeOwnerIds(actor);
  if (ids.length === 0) return [];
  authorize(actor, "finance:read", { ownerIds: ids });
  const ownerShares = await db
    .select({
      shareId: shares.id,
      registration: aircraft.registration,
      model: aircraft.model,
      ownerName: owners.legalName,
      percentageBp: shares.percentageBp,
    })
    .from(shares)
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .where(inArray(shares.ownerId, [...ids]))
    .orderBy(aircraft.registration);

  return Promise.all(
    ownerShares.map(async (s) => {
      const [view, months] = await Promise.all([loadBudget(db, s.shareId, year), monthlyTotals(db, s.shareId, year)]);
      const published = view.budget?.status === "published";
      return {
        ...s,
        published,
        currency: view.budget?.currency ?? "CAD",
        rows: view.rows.map((r) => ({
          ...r,
          plannedCents: published ? r.plannedCents : 0,
          remainingCents: published ? r.remainingCents : -r.spentCents,
        })),
        totals: { plannedCents: published ? view.totals.plannedCents : 0, spentCents: view.totals.spentCents },
        months,
      };
    }),
  );
}

/** Budget status of every share for a year, for the budgets overview. */
export async function listBudgetStatuses(db: Db, actor: Actor, year: number) {
  authorize(actor, "finance:read");
  const rows = await db
    .select({ shareId: budgets.shareId, status: budgets.status })
    .from(budgets)
    .where(eq(budgets.year, year));
  return new Map(rows.map((r) => [r.shareId, r.status]));
}
