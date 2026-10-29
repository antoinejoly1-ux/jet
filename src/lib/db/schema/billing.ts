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
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createdAt, currency, id, timestamps } from "./_shared";
import { user } from "./auth";
import { aircraft, flights, shares } from "./fleet";
import { invoices } from "./finance";
import { holdingCompanies } from "./owners";
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
    /** CAD per USD that finance entered at approval, when the pilot paid in US dollars. */
    usdCadRate: numeric("usd_cad_rate", { precision: 10, scale: 6 }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** The holding company's invoice to the owner, once issued. */
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
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
    /** The amount in CAD, fixed at approval (converted at the report's rate when paid in USD). */
    amountCadCents: bigint("amount_cad_cents", { mode: "number" }),
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

/**
 * hours: flight time at one part of the rate; expense: a cost rebilled at cost;
 * included: a receipt the hourly rate already covers (fuel), shown with nothing billed.
 */
export const invoiceLineKind = pgEnum("invoice_line_kind", ["hours", "expense", "included"]);

/** The lines of a generated invoice, fixed when it's issued. */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    kind: invoiceLineKind("kind").notNull(),
    /** The rate part (fuel, engine, …) or the expense category. */
    part: text("part").notNull(),
    description: text("description"),
    minutes: integer("minutes"),
    unitCents: bigint("unit_cents", { mode: "number" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

/** The maintenance reserves kept per hour flown, one balance per component. */
export const reserveComponent = pgEnum("reserve_component", ["engine", "propeller", "airframe", "avionics"]);
/** flight: set aside from an invoiced flight; work: paid out for maintenance; adjustment: a correction. */
export const reserveEntryKind = pgEnum("reserve_entry_kind", ["flight", "work", "adjustment"]);

/**
 * Append-only: every flight invoiced adds to each component's reserve; paying
 * for a big job (an overhaul, a propeller) takes from it. Corrections are new
 * entries, never edits.
 */
export const reserveLedger = pgTable(
  "reserve_ledger",
  {
    id: id(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "restrict" }),
    component: reserveComponent("component").notNull(),
    kind: reserveEntryKind("kind").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    occurredOn: date("occurred_on").notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "restrict" }),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("reserve_ledger_aircraft_idx").on(t.aircraftId, t.component)],
);

/** What each reserve is saving towards, e.g. the propeller overhaul at $200,000. */
export const reserveTargets = pgTable(
  "reserve_targets",
  {
    id: id(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    component: reserveComponent("component").notNull(),
    targetCents: bigint("target_cents", { mode: "number" }).notNull(),
    label: text("label"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("reserve_targets_aircraft_component_uq").on(t.aircraftId, t.component)],
);

/**
 * What a holding company pays that no flight report carries: pilot pay,
 * insurance, the hangar… Append-only; a mistake is reversed.
 */
export const companyExpenseCategory = pgEnum("company_expense_category", [
  "pilot_pay",
  "insurance",
  "hangar",
  "maintenance",
  "fuel",
  "fees",
  "other",
]);

export const companyExpenses = pgTable(
  "company_expenses",
  {
    id: id(),
    holdingCompanyId: uuid("holding_company_id")
      .notNull()
      .references(() => holdingCompanies.id, { onDelete: "restrict" }),
    occurredOn: date("occurred_on").notNull(),
    category: companyExpenseCategory("category").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    description: text("description"),
    reversesId: uuid("reverses_id").references((): AnyPgColumn => companyExpenses.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("company_expenses_company_date_idx").on(t.holdingCompanyId, t.occurredOn)],
);
