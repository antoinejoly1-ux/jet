import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql, sum } from "drizzle-orm";
import type { Db } from "@/lib/db";
import {
  aircraft,
  budgetLines,
  budgets,
  conversations,
  flights,
  hourLedger,
  invitations,
  invoices,
  maintenanceEvents,
  messages,
  owners,
  shares,
  transactions,
  user,
} from "@/lib/db/schema";
import { authorize, can, financeOwnerIds, type Actor } from "@/lib/auth/policy";
import { listNotifications } from "./notification-center";
import { countReportsWaiting } from "./flight-reports";
import { listToInvoice } from "./billing";

export type ShareSummary = {
  shareId: string;
  ownerName: string;
  percentageBp: number;
  aircraft: { id: string; registration: string; model: string; status: string };
  minutesRemaining: number;
  /** Hours flown since January 1, net of cancelled flights. */
  usedThisYearMinutes: number;
  annualMinutes: number | null;
  budget: { year: number; plannedCents: number; spentCents: number; currency: "CAD" | "USD" } | null;
  nextFlight: { fromAirport: string; toAirport: string; departsAt: Date } | null;
  /** Owners see maintenance only as a window: the details stay with Univair and the shop. */
  /** False for members who don't see this owner's finances: no budget or invoice cards. */
  showFinances: boolean;
  nextMaintenance: { startsAt: Date; endsAt: Date | null } | null;
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
  authorize(actor, "fleet:read", { ownerIds: actor.ownerIds });
  // Assistants and read-only members see budgets and invoices only when allowed.
  const withFinances = new Set(financeOwnerIds(actor));

  const rows = await db
    .select({
      shareId: shares.id,
      ownerId: shares.ownerId,
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
      const [[hours], [used], [budget], [nextFlight], [nextMaintenance], [latestInvoice]] = await Promise.all([
        db
          .select({ minutes: sum(hourLedger.minutes).mapWith(Number) })
          .from(hourLedger)
          .where(eq(hourLedger.shareId, r.shareId)),
        db
          .select({ minutes: sum(hourLedger.minutes).mapWith(Number) })
          .from(hourLedger)
          .where(
            and(
              eq(hourLedger.shareId, r.shareId),
              isNotNull(hourLedger.flightId),
              gte(hourLedger.createdAt, new Date(Date.UTC(year, 0, 1))),
            ),
          ),
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
          .select({ startsAt: maintenanceEvents.startsAt, endsAt: maintenanceEvents.endsAt })
          .from(maintenanceEvents)
          .where(
            and(
              eq(maintenanceEvents.aircraftId, r.aircraftId),
              inArray(maintenanceEvents.status, ["planned", "in_progress", "review"]),
              isNotNull(maintenanceEvents.startsAt),
            ),
          )
          .orderBy(asc(maintenanceEvents.startsAt))
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

      const showFinances = withFinances.has(r.ownerId);
      let budgetSummary: ShareSummary["budget"] = null;
      if (budget && showFinances) {
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
        usedThisYearMinutes: -(used?.minutes ?? 0),
        annualMinutes: r.annualMinutes,
        budget: budgetSummary,
        nextFlight: nextFlight ?? null,
        nextMaintenance: nextMaintenance
          ? { startsAt: nextMaintenance.startsAt!, endsAt: nextMaintenance.endsAt }
          : null,
        latestInvoice: showFinances ? (latestInvoice ?? null) : null,
        showFinances,
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

export type ActivityItem =
  | { kind: "flight"; id: string; at: Date; registration: string; from: string; to: string; minutes: number | null }
  | { kind: "notice"; id: string; at: Date; type: string; data: Record<string, string>; href: string; unread: boolean };

/**
 * The owner Home's "live" feed: the viewer's own notifications (already
 * limited to what their role may see) and the flights completed on their
 * shares, newest first.
 */
export async function getOwnerActivity(db: Db, actor: Actor, { limit = 8 } = {}): Promise<ActivityItem[]> {
  if (actor.ownerIds.length === 0) return [];
  authorize(actor, "fleet:read", { ownerIds: actor.ownerIds });
  const [notices, flown] = await Promise.all([
    listNotifications(db, actor, { limit }),
    db
      .select({
        id: flights.id,
        registration: aircraft.registration,
        from: flights.fromAirport,
        to: flights.toAirport,
        minutes: flights.flightMinutes,
        at: sql<Date>`coalesce(${flights.arrivesAt}, ${flights.departsAt})`.mapWith((v) => new Date(v)),
      })
      .from(flights)
      .innerJoin(shares, eq(shares.id, flights.shareId))
      .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
      .where(and(inArray(shares.ownerId, [...actor.ownerIds]), eq(flights.status, "completed")))
      .orderBy(desc(flights.departsAt))
      .limit(limit),
  ]);
  const items: ActivityItem[] = [
    ...notices.map((n) => ({
      kind: "notice" as const,
      id: n.id,
      at: n.createdAt,
      type: n.type,
      data: n.data,
      href: n.href,
      unread: !n.readAt,
    })),
    ...flown.map((f) => ({ kind: "flight" as const, ...f })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export type QueueKey =
  | "flightReports"
  | "toInvoice"
  | "flightsToClose"
  | "flightRequests"
  | "awaitingReply"
  | "maintenanceSoon"
  | "maintenanceOverdue"
  | "lowHours"
  | "ownersNeverInvited";

/**
 * "À traiter": what needs someone on the team today, each with how many.
 * Only what this person's role can act on; zero rows are left out.
 */
export async function getAdminQueue(db: Db, actor: Actor, now = new Date()) {
  authorize(actor, "admin:access");
  const ops = can(actor, "operations:write");
  const replies = can(actor, "messages:reply");
  const invites = can(actor, "owners:invite");
  const zero = Promise.resolve([{ n: 0 }]);
  const in48h = new Date(now.getTime() + 48 * 3_600_000);
  // A flight counts as flown once it has landed, or two hours after departure without an arrival time.
  const landed = sql`coalesce(${flights.arrivesAt}, ${flights.departsAt} + interval '2 hours') < ${now}`;

  const [[toClose], [requests], [awaiting], [soon], [overdue], [low], [neverInvited]] = await Promise.all([
    ops
      ? db
          .select({ n: count() })
          .from(flights)
          .where(and(eq(flights.status, "scheduled"), landed))
      : zero,
    ops
      ? db
          .select({ n: count() })
          .from(messages)
          .where(and(sql`${messages.meta}->>'kind' = 'flight_request'`, sql`${messages.meta}->>'status' = 'requested'`))
      : zero,
    replies
      ? // Open threads whose latest message is the owner's: someone is waiting for us.
        db
          .select({ n: count() })
          .from(conversations)
          .where(
            and(
              isNull(conversations.resolvedAt),
              sql`(select u.staff_role from messages m left join users u on u.id = m.sender_user_id
                 where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1) is null`,
              sql`exists (select 1 from messages m where m.conversation_id = ${conversations.id})`,
            ),
          )
      : zero,
    ops
      ? db
          .select({ n: count() })
          .from(maintenanceEvents)
          .where(
            and(
              eq(maintenanceEvents.status, "planned"),
              gte(maintenanceEvents.startsAt, now),
              lt(maintenanceEvents.startsAt, in48h),
            ),
          )
      : zero,
    ops
      ? db
          .select({ n: count() })
          .from(maintenanceEvents)
          .where(and(inArray(maintenanceEvents.status, ["in_progress", "review"]), lt(maintenanceEvents.endsAt, now)))
      : zero,
    // Active shares at or under 10% of their yearly hours.
    db
      .select({ n: count() })
      .from(shares)
      .where(
        and(
          or(isNull(shares.endsOn), sql`${shares.endsOn} > current_date`),
          sql`${shares.annualHoursMinutes} > 0`,
          sql`coalesce((select sum(h.minutes) from hour_ledger h where h.share_id = ${shares.id}), 0)
              <= ${shares.annualHoursMinutes} * 0.1`,
        ),
      ),
    invites
      ? db
          .select({ n: count() })
          .from(owners)
          .where(
            and(
              isNull(owners.deletedAt),
              sql`not exists (select 1 from owner_members m where m.owner_id = ${owners.id})`,
              sql`not exists (select 1 from invitations i where i.owner_id = ${owners.id})`,
            ),
          )
      : zero,
  ]);
  const [reports, toInvoice] = await Promise.all([
    countReportsWaiting(db, actor),
    can(actor, "finance:write") ? listToInvoice(db, actor).then((r) => r.length) : 0,
  ]);
  const rows: { key: QueueKey; count: number; href: string }[] = [
    { key: "flightReports", count: reports, href: "/admin/flight-reports" },
    { key: "toInvoice", count: toInvoice, href: "/admin/flight-reports#to-invoice" },
    { key: "flightsToClose", count: toClose!.n, href: "/admin/flights#to-close" },
    { key: "flightRequests", count: requests!.n, href: "/admin/messages" },
    { key: "awaitingReply", count: awaiting!.n, href: "/admin/messages" },
    { key: "maintenanceOverdue", count: overdue!.n, href: "/admin/maintenance" },
    { key: "maintenanceSoon", count: soon!.n, href: "/admin/maintenance" },
    { key: "lowHours", count: low!.n, href: "/admin/budgets" },
    { key: "ownersNeverInvited", count: neverInvited!.n, href: "/admin/invitations" },
  ];
  return rows.filter((r) => r.count > 0);
}
