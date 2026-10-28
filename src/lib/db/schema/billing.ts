/**
 * Flight billing. After each flight the pilot files a flight report (time
 * flown, what was bought on the way, with receipts); finance checks it, and
 * the aircraft's hourly rate turns it into the owner's invoice. Money is
 * integer cents, CAD.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, currency, id, timestamps } from "./_shared";
import { user } from "./auth";
import { aircraft, flights, shares } from "./fleet";
import { files } from "./platform";

/**
 * What one flight hour costs on an aircraft, from a date: fuel, the
 * maintenance reserves set aside per hour for each component, and the pilot.
 * A new rate is a new row; the one in force on a flight's date applies.
 */
export const aircraftRates = pgTable(
  "aircraft_rates",
  {
    id: id(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "restrict" }),
    effectiveFrom: date("effective_from").notNull(),
    fuelCentsPerHour: bigint("fuel_cents_per_hour", { mode: "number" }).notNull(),
    engineReserveCentsPerHour: bigint("engine_reserve_cents_per_hour", { mode: "number" }).notNull(),
    propellerReserveCentsPerHour: bigint("propeller_reserve_cents_per_hour", { mode: "number" }).notNull(),
    airframeReserveCentsPerHour: bigint("airframe_reserve_cents_per_hour", { mode: "number" }).notNull(),
    avionicsReserveCentsPerHour: bigint("avionics_reserve_cents_per_hour", { mode: "number" }).notNull(),
    pilotCentsPerHour: bigint("pilot_cents_per_hour", { mode: "number" }).notNull(),
    currency: currency("currency").notNull().default("CAD"),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("aircraft_rates_aircraft_from_uq").on(t.aircraftId, t.effectiveFrom)],
);

/** submitted → approved, or returned to the pilot with a note and submitted again. */
export const flightReportStatus = pgEnum("flight_report_status", ["submitted", "returned", "approved"]);

export const flightReports = pgTable(
  "flight_reports",
  {
    id: id(),
    flightId: uuid("flight_id")
      .notNull()
      .references(() => flights.id, { onDelete: "restrict" }),
    pilotUserId: uuid("pilot_user_id").references(() => user.id, { onDelete: "set null" }),
    flightMinutes: integer("flight_minutes").notNull(),
    /** Fuel taken on, in litres, as the pilot noted it. */
    fuelLitres: integer("fuel_litres"),
    notes: text("notes"),
    status: flightReportStatus("status").notNull().default("submitted"),
    /** The share billed for the flight: the flight's, unless finance corrects it. */
    shareId: uuid("share_id").references(() => shares.id, { onDelete: "restrict" }),
    reviewNote: text("review_note"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("flight_reports_flight_uq").on(t.flightId),
    index("flight_reports_status_idx").on(t.status),
    check("flight_reports_minutes_range", sql`${t.flightMinutes} > 0 AND ${t.flightMinutes} <= 1440`),
  ],
);

export const expenseCategory = pgEnum("expense_category", [
  "fuel",
  "handling",
  "airport_fees",
  "hotel",
  "per_diem",
  "catering",
  "other",
]);
/** Who paid at the counter: the pilot (to reimburse) or the company card. */
export const expensePayer = pgEnum("expense_payer", ["pilot", "company_card"]);

export const flightReportExpenses = pgTable(
  "flight_report_expenses",
  {
    id: id(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => flightReports.id, { onDelete: "cascade" }),
    category: expenseCategory("category").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: currency("currency").notNull().default("CAD"),
    paidBy: expensePayer("paid_by").notNull().default("company_card"),
    receiptFileId: uuid("receipt_file_id").references(() => files.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("flight_report_expenses_report_idx").on(t.reportId),
    check("flight_report_expenses_positive", sql`${t.amountCents} > 0`),
  ],
);
