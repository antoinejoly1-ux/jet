import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { deletedAt, id, locale, staffRole, timestamps } from "./_shared";
import { user } from "./auth";

export const ownerType = pgEnum("owner_type", ["person", "company"]);
/**
 * What a login may do for an owner. An owner acts fully; an executive
 * assistant sees the schedule and can make requests; read-only can only look.
 * Finances are visible to owners, and to others only with `canSeeFinances`.
 */
export const memberRole = pgEnum("member_role", ["owner", "assistant", "read_only"]);

/**
 * The company that legally owns an aircraft and invoices its owners, who are
 * its shareholders. Univair manages it; the money goes through it.
 */
export const holdingCompanies = pgTable(
  "holding_companies",
  {
    id: id(),
    legalName: text("legal_name").notNull(),
    /** Quebec enterprise number (NEQ) or other registration. */
    registrationNumber: text("registration_number"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    /** Billing profile: what its invoices say, and how they're numbered. */
    address: text("address"),
    /** GST/HST registration (e.g. 123456789 RT0001). Empty: not registered, no GST charged. */
    gstNumber: text("gst_number"),
    /** QST registration (e.g. 1234567890 TQ0001). Empty: not registered, no QST charged. */
    qstNumber: text("qst_number"),
    /** Invoices are numbered PREFIX-YEAR-0001, per company, starting over each year. */
    invoicePrefix: text("invoice_prefix"),
    invoiceSeqYear: integer("invoice_seq_year"),
    invoiceSeq: integer("invoice_seq").notNull().default(0),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    paymentInstructions: text("payment_instructions"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("holding_companies_legal_name_idx").on(t.legalName)],
);

/**
 * People who run a holding company's books for its shareholders (an
 * assistant or a technician): they issue its invoices from the portal.
 */
export const holdingCompanyManagers = pgTable(
  "holding_company_managers",
  {
    id: id(),
    holdingCompanyId: uuid("holding_company_id")
      .notNull()
      .references(() => holdingCompanies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("holding_company_managers_uq").on(t.holdingCompanyId, t.userId),
    index("holding_company_managers_user_idx").on(t.userId),
  ],
);

/** The person or company that holds shares. Separate from users (logins). */
export const owners = pgTable(
  "owners",
  {
    id: id(),
    type: ownerType("type").notNull().default("person"),
    legalName: text("legal_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    locale: locale("locale").notNull().default("fr"),
    crmId: text("crm_id"),
    accountingCustomerId: text("accounting_customer_id"),
    notes: text("notes"),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("owners_legal_name_idx").on(t.legalName)],
);

/** Which users act for an owner (a company can give its CFO and assistant access). */
export const ownerMembers = pgTable(
  "owner_members",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("owner"),
    canSeeFinances: boolean("can_see_finances").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("owner_members_owner_user_uq").on(t.ownerId, t.userId),
    index("owner_members_user_id_idx").on(t.userId),
  ],
);

/**
 * Pending access. Exactly one target: an owner (the invitee becomes a member)
 * or a staff role. Only the token's SHA-256 hash is stored.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    email: text("email").notNull(),
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "cascade" }),
    memberRole: memberRole("member_role"),
    canSeeFinances: boolean("can_see_finances").notNull().default(false),
    staffRole: staffRole("staff_role"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    invitedByUserId: uuid("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("invitations_email_idx").on(t.email),
    check(
      "invitations_one_target",
      sql`(${t.ownerId} IS NOT NULL AND ${t.staffRole} IS NULL) OR (${t.ownerId} IS NULL AND ${t.staffRole} IS NOT NULL)`,
    ),
  ],
);
