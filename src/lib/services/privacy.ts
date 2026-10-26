/**
 * Quebec's private-sector privacy law (Law 25) in practice: people can take
 * their data with them, make requests that the team must answer within 30
 * days, confidentiality incidents are kept in a register, and data that has
 * served its purpose is deleted on a schedule.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import {
  aircraft,
  auditLog,
  budgets,
  confidentialityIncidents,
  conversations,
  flights,
  hourLedger,
  invitations,
  invoices,
  messages,
  notificationPreferences,
  notifications,
  ownerMembers,
  owners,
  privacyRequests,
  session,
  shares,
  syncRuns,
  transactions,
  user,
  verification,
} from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

/** Law 25 gives 30 days to answer a request about personal information. */
export const RESPONSE_DAYS = 30;

/* ---------- Portability: everything about me, in one structured file ---------- */

export async function exportMyData(db: Db, actor: Actor) {
  const [me] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale,
      createdAt: user.createdAt,
      staffRole: user.staffRole,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, actor.id));
  if (!me) throw new NotFoundError("user");

  const memberships = await db.select().from(ownerMembers).where(eq(ownerMembers.userId, actor.id));
  const ownerIds = memberships.map((m) => m.ownerId);
  const ownerScope = ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"];
  const myShares = await db
    .select({
      id: shares.id,
      ownerId: shares.ownerId,
      registration: aircraft.registration,
      model: aircraft.model,
      percentageBp: shares.percentageBp,
      annualHoursMinutes: shares.annualHoursMinutes,
      startsOn: shares.startsOn,
      endsOn: shares.endsOn,
    })
    .from(shares)
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(inArray(shares.ownerId, ownerScope));
  const shareIds = myShares.length ? myShares.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"];

  const [ownerRows, flightRows, hours, money, invoiceRows, budgetRows, threads, notices, prefs, sessions, activity] =
    await Promise.all([
      db.select().from(owners).where(inArray(owners.id, ownerScope)),
      db
        .select({
          id: flights.id,
          shareId: flights.shareId,
          fromAirport: flights.fromAirport,
          toAirport: flights.toAirport,
          departsAt: flights.departsAt,
          arrivesAt: flights.arrivesAt,
          blockMinutes: flights.blockMinutes,
          status: flights.status,
        })
        .from(flights)
        .where(inArray(flights.shareId, shareIds))
        .orderBy(asc(flights.departsAt)),
      db
        .select({
          shareId: hourLedger.shareId,
          kind: hourLedger.kind,
          minutes: hourLedger.minutes,
          note: hourLedger.note,
          createdAt: hourLedger.createdAt,
        })
        .from(hourLedger)
        .where(inArray(hourLedger.shareId, shareIds))
        .orderBy(asc(hourLedger.createdAt)),
      db
        .select({
          shareId: transactions.shareId,
          occurredOn: transactions.occurredOn,
          kind: transactions.kind,
          amountCents: transactions.amountCents,
          currency: transactions.currency,
          description: transactions.description,
          reversesId: transactions.reversesId,
        })
        .from(transactions)
        .where(inArray(transactions.shareId, shareIds))
        .orderBy(asc(transactions.occurredOn)),
      db
        .select({
          shareId: invoices.shareId,
          number: invoices.number,
          issuedOn: invoices.issuedOn,
          dueOn: invoices.dueOn,
          totalCents: invoices.totalCents,
          currency: invoices.currency,
          status: invoices.status,
        })
        .from(invoices)
        .where(inArray(invoices.shareId, shareIds)),
      db
        .select({ shareId: budgets.shareId, year: budgets.year, currency: budgets.currency })
        .from(budgets)
        .where(and(inArray(budgets.shareId, shareIds), eq(budgets.status, "published"))),
      db
        .select({
          body: messages.body,
          createdAt: messages.createdAt,
          fromMe: sql<boolean>`${messages.senderUserId} = ${actor.id}`,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(inArray(conversations.ownerId, ownerScope))
        .orderBy(asc(messages.createdAt)),
      db
        .select({ type: notifications.type, data: notifications.data, createdAt: notifications.createdAt })
        .from(notifications)
        .where(eq(notifications.userId, actor.id)),
      db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, actor.id)),
      db
        .select({ createdAt: session.createdAt, ipAddress: session.ipAddress, userAgent: session.userAgent })
        .from(session)
        .where(eq(session.userId, actor.id)),
      db
        .select({ action: auditLog.action, createdAt: auditLog.createdAt, ipAddress: auditLog.ipAddress })
        .from(auditLog)
        .where(eq(auditLog.actorUserId, actor.id))
        .orderBy(desc(auditLog.createdAt))
        .limit(5000),
    ]);

  await recordAudit(db, { actorUserId: actor.id, action: "privacy.export", entityType: "user", entityId: actor.id });
  return {
    format: "jet-personal-data/1",
    exportedAt: new Date().toISOString(),
    account: me,
    emailPreferences: prefs[0]?.emailOff ?? [],
    owners: ownerRows.map(({ deletedAt: _d, ...o }) => o),
    shares: myShares,
    flights: flightRows,
    hourLedger: hours,
    transactions: money,
    invoices: invoiceRows,
    publishedBudgets: budgetRows,
    messages: threads,
    notifications: notices,
    activeSessions: sessions,
    activity,
  };
}

/* ---------- Requests ---------- */

export const privacyRequestInput = z.object({
  kind: z.enum(["access", "correction", "deletion", "portability"]),
  details: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => v || null),
});
export type PrivacyRequestInput = z.input<typeof privacyRequestInput>;

export async function createPrivacyRequest(db: Db, actor: Actor, raw: PrivacyRequestInput) {
  const input = privacyRequestInput.parse(raw);
  return db.transaction(async (tx) => {
    const [me] = await tx.select({ email: user.email }).from(user).where(eq(user.id, actor.id));
    if (!me) throw new NotFoundError("user");
    const [open] = await tx
      .select({ id: privacyRequests.id })
      .from(privacyRequests)
      .where(
        and(
          eq(privacyRequests.userId, actor.id),
          eq(privacyRequests.kind, input.kind),
          eq(privacyRequests.status, "open"),
        ),
      );
    if (open) throw new ConflictError("privacy_request_open");
    const [row] = await tx
      .insert(privacyRequests)
      .values({ userId: actor.id, email: me.email, kind: input.kind, details: input.details })
      .returning();
    const admins = await tx.select({ id: user.id }).from(user).where(eq(user.staffRole, "admin"));
    if (admins.length)
      await tx
        .insert(notifications)
        .values(
          admins.map((a) => ({ userId: a.id, type: "privacy.request", data: { email: me.email, kind: input.kind } })),
        );
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "privacy.request",
      entityType: "privacy_request",
      entityId: row!.id,
      after: { kind: input.kind },
    });
    return row!;
  });
}

export async function listMyPrivacyRequests(db: Db, actor: Actor) {
  return db
    .select()
    .from(privacyRequests)
    .where(eq(privacyRequests.userId, actor.id))
    .orderBy(desc(privacyRequests.createdAt));
}

/** Open requests first, oldest first (closest to the 30-day deadline), then the last closed ones. */
export async function listPrivacyRequests(db: Db, actor: Actor) {
  authorize(actor, "team:manage");
  const [open, closed] = await Promise.all([
    db.select().from(privacyRequests).where(eq(privacyRequests.status, "open")).orderBy(asc(privacyRequests.createdAt)),
    db
      .select()
      .from(privacyRequests)
      .where(isNotNull(privacyRequests.closedAt))
      .orderBy(desc(privacyRequests.closedAt))
      .limit(50),
  ]);
  return { open, closed };
}

export const closeRequestInput = z.object({
  status: z.enum(["done", "refused"]),
  response: z.string().trim().min(2).max(4000),
});

export async function closePrivacyRequest(db: Db, actor: Actor, id: string, raw: z.input<typeof closeRequestInput>) {
  authorize(actor, "team:manage");
  const input = closeRequestInput.parse(raw);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(privacyRequests)
      .set({ status: input.status, response: input.response, closedAt: new Date() })
      .where(and(eq(privacyRequests.id, id), eq(privacyRequests.status, "open")))
      .returning();
    if (!row) throw new ConflictError("privacy_request_closed");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "privacy.request_close",
      entityType: "privacy_request",
      entityId: id,
      after: input,
    });
  });
}

/* ---------- Incident register ---------- */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate = isoDate
  .optional()
  .or(z.literal("").transform(() => undefined))
  .transform((v) => v ?? null);

export const incidentInput = z
  .object({
    occurredOn: isoDate,
    discoveredOn: isoDate,
    description: z.string().trim().min(5).max(4000),
    dataConcerned: z.string().trim().min(2).max(1000),
    peopleConcerned: z.string().trim().min(1).max(1000),
    severity: z.enum(["low", "serious"]),
    measures: z.string().trim().min(2).max(4000),
    reportedToCaiOn: optionalDate,
    peopleNotifiedOn: optionalDate,
  })
  .refine((i) => i.discoveredOn >= i.occurredOn, { path: ["discoveredOn"], message: "before_occurred" });
export type IncidentInput = z.input<typeof incidentInput>;

export async function listIncidents(db: Db, actor: Actor) {
  authorize(actor, "team:manage");
  return db.select().from(confidentialityIncidents).orderBy(desc(confidentialityIncidents.discoveredOn));
}

export async function recordIncident(db: Db, actor: Actor, raw: IncidentInput) {
  authorize(actor, "team:manage");
  const input = incidentInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(confidentialityIncidents)
      .values({ ...input, createdByUserId: actor.id })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "privacy.incident",
      entityType: "incident",
      entityId: row!.id,
      after: { severity: input.severity, occurredOn: input.occurredOn },
    });
    return row!;
  });
}

/** Records when a serious incident was reported to the Commission and to the people concerned. */
export async function updateIncidentReporting(
  db: Db,
  actor: Actor,
  id: string,
  raw: { reportedToCaiOn?: string; peopleNotifiedOn?: string },
) {
  authorize(actor, "team:manage");
  const input = z.object({ reportedToCaiOn: optionalDate, peopleNotifiedOn: optionalDate }).parse(raw);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(confidentialityIncidents)
      .set(input)
      .where(eq(confidentialityIncidents.id, id))
      .returning({ id: confidentialityIncidents.id });
    if (!row) throw new NotFoundError("incident");
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "privacy.incident_reporting",
      entityType: "incident",
      entityId: id,
      after: input,
    });
  });
}

/* ---------- Retention ---------- */

const DAY = 86_400_000;

/**
 * What the portal deletes on its own, and when. Financial records (ledgers,
 * invoices, budgets) are kept: tax law requires six years, and they are
 * removed only by a deliberate, logged decision, never by this job.
 */
export const RETENTION = {
  expiredSessionsDays: 0,
  expiredVerificationsDays: 0,
  closedInvitationsDays: 90,
  readNotificationsDays: 365,
  syncRunsDays: 365,
} as const;

export async function runRetention(db: Db, now = new Date()) {
  const before = (days: number) => new Date(now.getTime() - days * DAY);
  return db.transaction(async (tx) => {
    const sessions = await tx
      .delete(session)
      .where(lt(session.expiresAt, before(RETENTION.expiredSessionsDays)))
      .returning({ id: session.id });
    const verifications = await tx
      .delete(verification)
      .where(lt(verification.expiresAt, before(RETENTION.expiredVerificationsDays)))
      .returning({ id: verification.id });
    const oldInvitations = await tx
      .delete(invitations)
      .where(
        and(
          isNull(invitations.acceptedAt),
          or(
            lt(invitations.expiresAt, before(RETENTION.closedInvitationsDays)),
            lt(invitations.revokedAt, before(RETENTION.closedInvitationsDays)),
          ),
        ),
      )
      .returning({ id: invitations.id });
    const oldNotifications = await tx
      .delete(notifications)
      .where(and(isNotNull(notifications.readAt), lt(notifications.createdAt, before(RETENTION.readNotificationsDays))))
      .returning({ id: notifications.id });
    const oldRuns = await tx
      .delete(syncRuns)
      .where(lt(syncRuns.startedAt, before(RETENTION.syncRunsDays)))
      .returning({ id: syncRuns.id });
    const counts = {
      sessions: sessions.length,
      verifications: verifications.length,
      invitations: oldInvitations.length,
      notifications: oldNotifications.length,
      syncRuns: oldRuns.length,
    };
    await recordAudit(tx, { actorUserId: null, action: "privacy.retention", after: counts });
    return counts;
  });
}
