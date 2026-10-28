/**
 * Money and hours. Amounts are integer cents with a currency; hours are integer
 * minutes. Ledger tables are append-only: corrections are new entries that
 * reverse earlier ones, never edits.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createdAt, currency, dataSource, id, timestamps } from "./_shared";
import { user } from "./auth";
import { flights, shares } from "./fleet";
import { files } from "./platform";
import { holdingCompanies } from "./owners";

export type InvoiceIssuer = {
  legalName: string;
  address: string | null;
  gstNumber: string | null;
  qstNumber: string | null;
  paymentInstructions: string | null;
};

export const hourEntryKind = pgEnum("hour_entry_kind", ["purchase", "flight", "adjustment"]);
export const budgetStatus = pgEnum("budget_status", ["draft", "published"]);
export const transactionKind = pgEnum("transaction_kind", ["cost", "revenue", "payment"]);
export const invoiceStatus = pgEnum("invoice_status", ["issued", "paid", "void"]);

export const hourLedger = pgTable(
  "hour_ledger",
  {
    id: id(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "restrict" }),
    kind: hourEntryKind("kind").notNull(),
    /** Positive adds hours (purchase), negative uses them (flight). */
    minutes: integer("minutes").notNull(),
    flightId: uuid("flight_id").references(() => flights.id, { onDelete: "restrict" }),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("hour_ledger_share_idx").on(t.shareId)],
);

export const budgetCategories = pgTable("budget_categories", {
  id: id(),
  nameFr: text("name_fr").notNull(),
  nameEn: text("name_en").notNull(),
  accountingAccountCode: text("accounting_account_code"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps(),
});

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "restrict" }),
    year: integer("year").notNull(),
    currency: currency("currency").notNull().default("CAD"),
    status: budgetStatus("status").notNull().default("draft"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("budgets_share_year_uq").on(t.shareId, t.year)],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: id(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => budgetCategories.id, { onDelete: "restrict" }),
    plannedCents: bigint("planned_cents", { mode: "number" }).notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("budget_lines_budget_category_uq").on(t.budgetId, t.categoryId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "restrict" }),
    occurredOn: date("occurred_on").notNull(),
    categoryId: uuid("category_id").references(() => budgetCategories.id, { onDelete: "restrict" }),
    kind: transactionKind("kind").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: currency("currency").notNull().default("CAD"),
    description: text("description"),
    invoiceId: uuid("invoice_id").references((): AnyPgColumn => invoices.id, { onDelete: "restrict" }),
    /** Set on a correcting entry: the transaction it cancels. */
    reversesId: uuid("reverses_id").references((): AnyPgColumn => transactions.id, { onDelete: "restrict" }),
    source: dataSource("source").notNull().default("manual"),
    externalId: text("external_id"),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("transactions_share_date_idx").on(t.shareId, t.occurredOn)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "restrict" }),
    flightId: uuid("flight_id").references(() => flights.id, { onDelete: "restrict" }),
    number: text("number").notNull(),
    issuedOn: date("issued_on").notNull(),
    dueOn: date("due_on"),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    currency: currency("currency").notNull().default("CAD"),
    status: invoiceStatus("status").notNull().default("issued"),
    voidReason: text("void_reason"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "restrict" }),
    source: dataSource("source").notNull().default("manual"),
    accountingId: text("accounting_id"),
    /** Set on invoices the portal generates: the company that issues them, and the breakdown. */
    holdingCompanyId: uuid("holding_company_id").references(() => holdingCompanies.id, { onDelete: "restrict" }),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }),
    gstCents: bigint("gst_cents", { mode: "number" }),
    qstCents: bigint("qst_cents", { mode: "number" }),
    /** The issuer as printed on the day, so the invoice never changes after the company's profile does. */
    issuer: jsonb("issuer").$type<InvoiceIssuer>(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("invoices_number_uq").on(t.number),
    index("invoices_share_issued_idx").on(t.shareId, t.issuedOn),
    check("invoices_void_has_reason", sql`${t.status} <> 'void' OR ${t.voidReason} IS NOT NULL`),
  ],
);
