/**
 * Flight reports. After each flight the pilot files what happened: the time
 * flown, the fuel taken on, and every expense on the way with a photo of the
 * receipt. Filing it closes the flight (its hours come off the share). Finance
 * then checks who flew, and approves it or sends it back with a note.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import {
  aircraft,
  files,
  flightReportExpenses,
  flightReports,
  flights,
  hourLedger,
  owners,
  shares,
  user,
} from "@/lib/db/schema";
import { authorize, can, type Actor } from "@/lib/auth/policy";
import { zonedDay } from "@/lib/time";
import { money } from "@/lib/validation/finance";
import { parseDurationToMinutes } from "@/lib/validation/operations";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";
import { applyCompletion, lockFlight } from "./flights";
import { alertIfHoursLow } from "./hour-alerts";
import { sendPendingEmails } from "./owner-notifications";
import { chargesFor, fuelIncludedInRate, rateOn } from "./rates";

export const EXPENSE_CATEGORIES = [
  "fuel",
  "handling",
  "airport_fees",
  "hotel",
  "per_diem",
  "catering",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** How far back a pilot can still file: long enough for a trip of several legs. */
export const REPORT_WINDOW_DAYS = 14;

const expenseInput = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: money.refine((c) => c > 0, { message: "invalid_amount" }),
  /** Receipts abroad are in US dollars: kept as paid, converted by finance at approval. */
  currency: z.enum(["CAD", "USD"]).default("CAD"),
  paidBy: z.enum(["pilot", "company_card"]).default("company_card"),
  receiptFileId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: z.string().trim().max(200).optional(),
});

export const reportInput = z.object({
  flightId: z.string().uuid(),
  flightTime: z.string().transform((v, ctx) => {
    const minutes = parseDurationToMinutes(v);
    if (!minutes || minutes > 24 * 60) {
      ctx.addIssue({ code: "custom", message: "invalid_duration" });
      return z.NEVER;
    }
    return minutes;
  }),
  fuelLitres: z
    .literal("")
    .transform(() => null)
    .or(z.coerce.number().int().min(0).max(20_000))
    .optional()
    .transform((v) => v ?? null),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
  expenses: z.array(expenseInput).max(40).default([]),
});
export type ReportInput = z.input<typeof reportInput>;

const pilot = alias(user, "pilot");

/**
 * What a pilot sees: their reports sent back to fix (first, whatever their
 * age), the fleet's recent flights that have landed and have no report yet,
 * and the reports they've filed. No owner names, no money.
 */
export async function listPilotFlights(db: Db, actor: Actor, now = new Date()) {
  authorize(actor, "reports:file");
  const since = new Date(now.getTime() - REPORT_WINDOW_DAYS * 86_400_000);
  const columns = {
    id: flights.id,
    registration: aircraft.registration,
    model: aircraft.model,
    fromAirport: flights.fromAirport,
    toAirport: flights.toAirport,
    departsAt: flights.departsAt,
    status: flights.status,
    reportStatus: flightReports.status,
    reviewNote: flightReports.reviewNote,
  };
  const [toFix, toReport, mine] = await Promise.all([
    db
      .select(columns)
      .from(flightReports)
      .innerJoin(flights, eq(flights.id, flightReports.flightId))
      .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
      .where(and(eq(flightReports.status, "returned"), eq(flightReports.pilotUserId, actor.id)))
      .orderBy(desc(flights.departsAt)),
    db
      .select(columns)
      .from(flights)
      .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
      .leftJoin(flightReports, eq(flightReports.flightId, flights.id))
      .where(
        and(
          ne(flights.status, "cancelled"),
          gte(flights.departsAt, since),
          // Landed: past its arrival (or its departure, when no arrival was planned).
          sql`coalesce(${flights.arrivesAt}, ${flights.departsAt}) <= ${now}`,
          isNull(aircraft.deletedAt),
          isNull(flightReports.id),
        ),
      )
      .orderBy(desc(flights.departsAt)),
    db
      .select({
        id: flightReports.id,
        flightId: flights.id,
        registration: aircraft.registration,
        fromAirport: flights.fromAirport,
        toAirport: flights.toAirport,
        departsAt: flights.departsAt,
        flightMinutes: flightReports.flightMinutes,
        status: flightReports.status,
        submittedAt: flightReports.submittedAt,
      })
      .from(flightReports)
      .innerJoin(flights, eq(flights.id, flightReports.flightId))
      .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
      .where(and(eq(flightReports.pilotUserId, actor.id), ne(flightReports.status, "returned")))
      .orderBy(desc(flightReports.submittedAt))
      .limit(30),
  ]);
  return { toFix, toReport, mine };
}

/** One flight as the pilot reports it, with the report so far when it's being corrected. */
export async function getFlightForReport(db: Db, actor: Actor, flightId: string) {
  authorize(actor, "reports:file");
  const [flight] = await db
    .select({
      id: flights.id,
      registration: aircraft.registration,
      model: aircraft.model,
      fromAirport: flights.fromAirport,
      toAirport: flights.toAirport,
      departsAt: flights.departsAt,
      arrivesAt: flights.arrivesAt,
      flightMinutes: flights.flightMinutes,
      status: flights.status,
    })
    .from(flights)
    .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
    .where(eq(flights.id, flightId));
  if (!flight) throw new NotFoundError("flight");
  const [report] = await db.select().from(flightReports).where(eq(flightReports.flightId, flightId));
  const expenses = report ? await expensesOf(db, report.id) : [];
  return { flight, report: report ?? null, expenses };
}

const expensesOf = (db: Db | Tx, reportId: string) =>
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
    .orderBy(asc(flightReportExpenses.createdAt));

/**
 * Files (or corrects) the report of a flight. A flight still scheduled is
 * closed with the reported time; a flight already closed with another time is
 * corrected, its hours adjusted by the difference. Once approved, a report is
 * final.
 */
export async function submitReport(db: Db, actor: Actor, raw: ReportInput, now = new Date()) {
  authorize(actor, "reports:file");
  const input = reportInput.parse(raw);
  const { report, emails } = await db.transaction(async (tx) => {
    const flight = await lockFlight(tx, input.flightId);
    if (flight.status === "cancelled") throw new ConflictError("flight_cancelled");
    if (flight.departsAt > now) throw new ConflictError("flight_not_departed");
    const [existing] = await tx.select().from(flightReports).where(eq(flightReports.flightId, flight.id)).for("update");
    if (existing?.status === "approved") throw new ConflictError("report_approved");
    if (existing?.status === "submitted" && existing.pilotUserId !== actor.id)
      throw new ConflictError("report_already_filed");

    // Receipts must be ones this pilot just uploaded, or ones already on this report (a returned
    // report sent again as is), not any file they know the id of.
    const kept = existing
      ? (
          await tx
            .select({ id: flightReportExpenses.receiptFileId })
            .from(flightReportExpenses)
            .where(eq(flightReportExpenses.reportId, existing.id))
        ).flatMap((e) => (e.id ? [e.id] : []))
      : [];
    const receiptIds = [...new Set(input.expenses.flatMap((e) => (e.receiptFileId ? [e.receiptFileId] : [])))].filter(
      (id) => !kept.includes(id),
    );
    if (receiptIds.length) {
      const owned = await tx
        .select({ id: files.id })
        .from(files)
        .where(
          and(
            inArray(files.id, receiptIds),
            eq(files.uploadedByUserId, actor.id),
            sql`${files.storageKey} like 'receipts/%'`,
          ),
        );
      if (owned.length !== receiptIds.length) throw new ConflictError("invalid_receipt");
    }

    let emails: Awaited<ReturnType<typeof alertIfHoursLow>> = [];
    if (flight.status === "scheduled") {
      await applyCompletion(tx, flight, input.flightTime, null, actor.id);
      if (flight.shareId) emails = await alertIfHoursLow(tx, flight.shareId, input.flightTime);
    } else if (flight.flightMinutes !== input.flightTime) {
      await correctFlightTime(tx, flight, input.flightTime, actor.id);
    }

    const values = {
      pilotUserId: actor.id,
      flightMinutes: input.flightTime,
      fuelLitres: input.fuelLitres,
      notes: input.notes,
      status: "submitted" as const,
      shareId: existing?.shareId ?? flight.shareId,
      submittedAt: now,
    };
    const [report] = existing
      ? await tx.update(flightReports).set(values).where(eq(flightReports.id, existing.id)).returning()
      : await tx
          .insert(flightReports)
          .values({ flightId: flight.id, ...values })
          .returning();
    // Expenses aren't money moved yet, only what the pilot declares: replaced as a whole until approval.
    await tx.delete(flightReportExpenses).where(eq(flightReportExpenses.reportId, report!.id));
    if (input.expenses.length)
      await tx.insert(flightReportExpenses).values(
        input.expenses.map((e) => ({
          reportId: report!.id,
          category: e.category,
          amountCents: e.amount,
          currency: e.currency,
          paidBy: e.paidBy,
          receiptFileId: e.receiptFileId ?? null,
          note: e.note || null,
        })),
      );
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: existing ? "flight_report.resubmit" : "flight_report.submit",
      entityType: "flight_report",
      entityId: report!.id,
      before: existing ? { flightMinutes: existing.flightMinutes, status: existing.status } : null,
      after: {
        flightId: flight.id,
        flightMinutes: input.flightTime,
        expenses: input.expenses.length,
        expensesCents: input.expenses.reduce((s, e) => s + e.amount, 0),
      },
    });
    return { report: report!, emails };
  });
  await sendPendingEmails(db, emails);
  return report;
}

/** A closed flight's time changes: the flight takes the new time and its share's hours the difference. */
async function correctFlightTime(tx: Tx, flight: typeof flights.$inferSelect, minutes: number, actorUserId: string) {
  await tx
    .update(flights)
    .set({ flightMinutes: minutes, arrivesAt: new Date(flight.departsAt.getTime() + minutes * 60_000) })
    .where(eq(flights.id, flight.id));
  const diff = (flight.flightMinutes ?? 0) - minutes;
  if (flight.shareId && diff !== 0)
    await tx.insert(hourLedger).values({
      shareId: flight.shareId,
      kind: "adjustment",
      minutes: diff,
      flightId: flight.id,
      note: "flight_report",
      createdByUserId: actorUserId,
    });
}

const reviewColumns = {
  id: flightReports.id,
  status: flightReports.status,
  flightMinutes: flightReports.flightMinutes,
  submittedAt: flightReports.submittedAt,
  reviewedAt: flightReports.reviewedAt,
  invoiceId: flightReports.invoiceId,
  flightId: flights.id,
  aircraftId: flights.aircraftId,
  registration: aircraft.registration,
  fromAirport: flights.fromAirport,
  toAirport: flights.toAirport,
  departsAt: flights.departsAt,
  pilotName: pilot.name,
  pilotId: pilot.id,
  pilotImage: pilot.image,
  shareId: flightReports.shareId,
  ownerName: owners.legalName,
  /** In CAD: converted amounts once approved, CAD receipts as they are. */
  expensesCents:
    sql<number>`coalesce((select sum(coalesce(e.amount_cad_cents, case when e.currency = 'CAD' then e.amount_cents end)) from flight_report_expenses e where e.report_id = ${flightReports.id}), 0)`.mapWith(
      Number,
    ),
  /** US-dollar receipts not converted yet (until approval), kept apart rather than added to CAD. */
  usdCents:
    sql<number>`coalesce((select sum(e.amount_cents) from flight_report_expenses e where e.report_id = ${flightReports.id} and e.currency = 'USD' and e.amount_cad_cents is null), 0)`.mapWith(
      Number,
    ),
  expenseCount:
    sql<number>`(select count(*) from flight_report_expenses e where e.report_id = ${flightReports.id})`.mapWith(
      Number,
    ),
};

const reviewBase = (db: Db) =>
  db
    .select(reviewColumns)
    .from(flightReports)
    .innerJoin(flights, eq(flights.id, flightReports.flightId))
    .innerJoin(aircraft, eq(aircraft.id, flights.aircraftId))
    .leftJoin(pilot, eq(pilot.id, flightReports.pilotUserId))
    .leftJoin(shares, eq(shares.id, flightReports.shareId))
    .leftJoin(owners, eq(owners.id, shares.ownerId));

/** Reports for finance: waiting ones first (oldest first), then the latest decided ones. */
export async function listReportsForReview(db: Db, actor: Actor) {
  authorize(actor, "finance:read");
  const [waiting, decided] = await Promise.all([
    reviewBase(db).where(eq(flightReports.status, "submitted")).orderBy(asc(flightReports.submittedAt)),
    reviewBase(db)
      .where(ne(flightReports.status, "submitted"))
      .orderBy(desc(sql`coalesce(${flightReports.reviewedAt}, ${flightReports.submittedAt})`))
      .limit(50),
  ]);
  return { waiting, decided };
}

/**
 * One report as finance reviews it: the flight, what the pilot declared with
 * the receipts, who it would be billed to and what the hours come to at the
 * aircraft's rate on that day.
 */
export async function getReportForReview(db: Db, actor: Actor, id: string) {
  authorize(actor, "finance:read");
  const [report] = await reviewBase(db).where(eq(flightReports.id, id));
  if (!report) throw new NotFoundError("flight_report");
  const [details] = await db
    .select({
      fuelLitres: flightReports.fuelLitres,
      notes: flightReports.notes,
      reviewNote: flightReports.reviewNote,
      usdCadRate: flightReports.usdCadRate,
    })
    .from(flightReports)
    .where(eq(flightReports.id, id));
  const day = zonedDay(report.departsAt);
  const [expenses, rate, shareOptions] = await Promise.all([
    expensesOf(db, id),
    rateOn(db, report.aircraftId, day),
    db
      .select({ id: shares.id, ownerName: owners.legalName, percentageBp: shares.percentageBp })
      .from(shares)
      .innerJoin(owners, eq(owners.id, shares.ownerId))
      .where(
        and(
          eq(shares.aircraftId, report.aircraftId),
          lte(shares.startsOn, day),
          or(isNull(shares.endsOn), sql`${shares.endsOn} > ${day}`),
        ),
      )
      .orderBy(asc(owners.legalName)),
  ]);
  return {
    report: { ...report, ...details! },
    expenses,
    rate,
    charges: rate ? chargesFor(rate, report.flightMinutes) : null,
    /** Fuel receipts are covered by the rate (not billed again) when it has a fuel part. */
    fuelIncluded: fuelIncludedInRate(rate),
    shareOptions,
  };
}

const lockReport = async (tx: Tx, id: string) => {
  const [row] = await tx.select().from(flightReports).where(eq(flightReports.id, id)).for("update");
  if (!row) throw new NotFoundError("flight_report");
  if (row.status !== "submitted") throw new ConflictError("report_not_waiting");
  return row;
};

/** "1,3850" or "1.385" → 1.385: CAD for one USD, as finance reads it off the bank or card statement. */
export function parseFxRate(input: string | undefined): number | null {
  const v = (input ?? "").trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,6})?$/.test(v)) return null;
  const n = Number(v);
  return n >= 0.5 && n <= 3 ? n : null;
}

/** Converts at a rate held to six decimals, in integer arithmetic. */
export const convertCents = (cents: number, rate: number) => Math.round((cents * Math.round(rate * 1e6)) / 1e6);

/**
 * Finance confirms the report and who flew (the share billed). Every expense
 * is fixed in CAD here: CAD receipts as they are, USD receipts at the rate
 * finance enters (required when there are any), so billing never adds US
 * dollars to Canadian ones.
 */
export async function approveReport(db: Db, actor: Actor, id: string, raw: { shareId: string; usdRate?: string }) {
  authorize(actor, "finance:write");
  const { shareId, usdRate } = z.object({ shareId: z.string().uuid(), usdRate: z.string().optional() }).parse(raw);
  return db.transaction(async (tx) => {
    const report = await lockReport(tx, id);
    const [flight] = await tx.select().from(flights).where(eq(flights.id, report.flightId));
    const [share] = await tx
      .select({ id: shares.id })
      .from(shares)
      .where(and(eq(shares.id, shareId), eq(shares.aircraftId, flight!.aircraftId)));
    if (!share) throw new ConflictError("share_not_on_aircraft");
    const expenses = await tx.select().from(flightReportExpenses).where(eq(flightReportExpenses.reportId, id));
    const foreign = expenses.some((e) => e.currency !== "CAD");
    const rate = foreign ? parseFxRate(usdRate) : null;
    if (foreign && rate === null)
      throw new z.ZodError([{ code: "custom", path: ["usdRate"], message: "fx_rate_required", input: usdRate }]);
    for (const e of expenses)
      await tx
        .update(flightReportExpenses)
        .set({ amountCadCents: e.currency === "CAD" ? e.amountCents : convertCents(e.amountCents, rate!) })
        .where(eq(flightReportExpenses.id, e.id));
    const [row] = await tx
      .update(flightReports)
      .set({
        status: "approved",
        shareId,
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
        reviewNote: null,
        usdCadRate: rate === null ? null : rate.toFixed(6),
      })
      .where(eq(flightReports.id, id))
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "flight_report.approve",
      entityType: "flight_report",
      entityId: id,
      before: { shareId: report.shareId },
      after: { shareId, ...(rate === null ? {} : { usdCadRate: rate }) },
    });
    return row!;
  });
}

/** Finance sends the report back to the pilot with what to fix. */
export async function returnReport(db: Db, actor: Actor, id: string, raw: { note: string }) {
  authorize(actor, "finance:write");
  const { note } = z.object({ note: z.string().trim().min(1).max(1000) }).parse(raw);
  return db.transaction(async (tx) => {
    await lockReport(tx, id);
    const [row] = await tx
      .update(flightReports)
      .set({ status: "returned", reviewNote: note, reviewedByUserId: actor.id, reviewedAt: new Date() })
      .where(eq(flightReports.id, id))
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "flight_report.return",
      entityType: "flight_report",
      entityId: id,
      after: { note },
    });
    return row!;
  });
}

/** Reports waiting for finance, for the "À traiter" queue. */
export async function countReportsWaiting(db: Db, actor: Actor) {
  if (!can(actor, "finance:read")) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(flightReports)
    .where(eq(flightReports.status, "submitted"));
  return row?.n ?? 0;
}
