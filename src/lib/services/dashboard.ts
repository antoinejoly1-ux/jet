import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, sql, sum } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  aircraft,
  budgetLines,
  budgets,
  flights,
  hourLedger,
  invitations,
  invoices,
  maintenanceEvents,
  owners,
  shares,
  transactions,
  user,
} from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";

export type ShareSummary = {
  shareId: string;
  ownerName: string;
  percentageBp: number;
  aircraft: { id: string; registration: string; model: string; status: string };
  minutesRemaining: number;
  annualMinutes: number | null;
  budget: { year: number; plannedCents: number; spentCents: number; currency: "CAD" | "USD" } | null;
  nextFlight: { fromAirport: string; toAirport: string; departsAt: Date } | null;
  nextMaintenance: { title: string; startsAt: Date | null; dueOn: string | null } | null;
  latestInvoice: {
    number: string;
    issuedOn: string;
    totalCents: number;
    currency: "CAD" | "USD";
    status: string;
  } | null;
};

/**
 * Everything the owner's Home screen shows, one entry per share. Scoped by the
 * actor's own owner ids inside every query, so nothing else can leak in.
 */
export async function getOwnerHome(db: Db, actor: Actor): Promise<ShareSummary[]> {
  if (actor.ownerIds.length === 0) return [];
  authorize(actor, "finance:read", { ownerIds: actor.ownerIds });

  const rows = await db
    .select({
      shareId: shares.id,
      ownerName: owners.legalName,
      percentageBp: shares.percentageBp,
      annualMinutes: shares.annualHoursMinutes,
      aircraftId: aircraft.id,
      registration: aircraft.registration,
      model: aircraft.model,
      status: aircraft.status,
    })
    .from(shares)
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(and(inArray(shares.ownerId, [...actor.ownerIds]), isNull(aircraft.deletedAt)))
    .orderBy(asc(aircraft.registration));

  const year = new Date().getFullYear();
  const now = new Date();

  return Promise.all(
    rows.map(async (r): Promise<ShareSummary> => {
      const [[hours], [budget], [nextFlight], [nextMaintenance], [latestInvoice]] = await Promise.all([
        db
          .select({ minutes: sum(hourLedger.minutes).mapWith(Number) })
          .from(hourLedger)
          .where(eq(hourLedger.shareId, r.shareId)),
        db
          .select({ id: budgets.id, currency: budgets.currency })
          .from(budgets)
          .where(and(eq(budgets.shareId, r.shareId), eq(budgets.year, year), eq(budgets.status, "published"))),
        db
          .select({ fromAirport: flights.fromAirport, toAirport: flights.toAirport, departsAt: flights.departsAt })
          .from(flights)
          // The owner's own flights only; co-owners' trips are theirs to know.
          .where(and(eq(flights.shareId, r.shareId), eq(flights.status, "scheduled"), gte(flights.departsAt, now)))
          .orderBy(asc(flights.departsAt))
          .limit(1),
        db
          .select({
            title: maintenanceEvents.title,
            startsAt: maintenanceEvents.startsAt,
            dueOn: maintenanceEvents.dueOn,
          })
          .from(maintenanceEvents)
          .where(
            and(
              eq(maintenanceEvents.aircraftId, r.aircraftId),
              inArray(maintenanceEvents.status, ["planned", "in_progress"]),
            ),
          )
          .orderBy(sql`coalesce(${maintenanceEvents.startsAt}, ${maintenanceEvents.dueOn}::timestamptz) asc nulls last`)
          .limit(1),
        db
          .select({
            number: invoices.number,
            issuedOn: invoices.issuedOn,
            totalCents: invoices.totalCents,
            currency: invoices.currency,
            status: invoices.status,
          })
          .from(invoices)
          .where(eq(invoices.shareId, r.shareId))
          .orderBy(desc(invoices.issuedOn))
          .limit(1),
      ]);

      let budgetSummary: ShareSummary["budget"] = null;
      if (budget) {
        const [[planned], [spent]] = await Promise.all([
          db
            .select({ cents: sum(budgetLines.plannedCents).mapWith(Number) })
            .from(budgetLines)
            .where(eq(budgetLines.budgetId, budget.id)),
          db
            .select({ cents: sum(transactions.amountCents).mapWith(Number) })
            .from(transactions)
            .where(
              and(
                eq(transactions.shareId, r.shareId),
                eq(transactions.kind, "cost"),
                gte(transactions.occurredOn, `${year}-01-01`),
                sql`${transactions.occurredOn} < ${`${year + 1}-01-01`}`,
              ),
            ),
        ]);
        budgetSummary = {
          year,
          plannedCents: planned?.cents ?? 0,
          spentCents: spent?.cents ?? 0,
          currency: budget.currency,
        };
      }

      return {
        shareId: r.shareId,
        ownerName: r.ownerName,
        percentageBp: r.percentageBp,
        aircraft: { id: r.aircraftId, registration: r.registration, model: r.model, status: r.status },
        minutesRemaining: hours?.minutes ?? 0,
        annualMinutes: r.annualMinutes,
        budget: budgetSummary,
        nextFlight: nextFlight ?? null,
        nextMaintenance: nextMaintenance ?? null,
        latestInvoice: latestInvoice ?? null,
      };
    }),
  );
}

/**
 * Back-office counts. "Today" and "this week" are the operator's local days:
 * `todayStart` is local midnight, the week runs seven days from it.
 */
export async function getAdminStats(db: Db, actor: Actor, todayStart: Date) {
  authorize(actor, "admin:access");
  const day = 86_400_000;
  const scheduledBetween = (from: Date, to: Date) =>
    db
      .select({ n: count() })
      .from(flights)
      .where(and(ne(flights.status, "cancelled"), gte(flights.departsAt, from), lt(flights.departsAt, to)));
  const [[o], [a], [inv], [waiting], [today], [week], [inMaintenance], [noAccess]] = await Promise.all([
    db.select({ n: count() }).from(owners).where(isNull(owners.deletedAt)),
    db.select({ n: count() }).from(aircraft).where(isNull(aircraft.deletedAt)),
    db
      .select({ n: count() })
      .from(invitations)
      .where(
        and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gte(invitations.expiresAt, new Date())),
      ),
    // Accounts with neither a staff role nor an owner membership.
    db
      .select({ n: count() })
      .from(user)
      .where(and(isNull(user.staffRole), sql`not exists (select 1 from owner_members m where m.user_id = ${user.id})`)),
    scheduledBetween(todayStart, new Date(todayStart.getTime() + day)),
    scheduledBetween(todayStart, new Date(todayStart.getTime() + 7 * day)),
    db
      .select({ n: count() })
      .from(aircraft)
      .where(and(eq(aircraft.status, "maintenance"), isNull(aircraft.deletedAt))),
    db
      .select({ n: count() })
      .from(owners)
      .where(
        and(
          isNull(owners.deletedAt),
          sql`not exists (select 1 from owner_members m where m.owner_id = ${owners.id})`,
          sql`not exists (select 1 from invitations i where i.owner_id = ${owners.id}
            and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())`,
        ),
      ),
  ]);
  return {
    owners: o.n,
    aircraft: a.n,
    pendingInvitations: inv.n,
    accountsWaiting: waiting.n,
    flightsToday: today.n,
    flightsThisWeek: week.n,
    inMaintenance: inMaintenance.n,
    ownersWithoutAccess: noAccess.n,
  };
}
