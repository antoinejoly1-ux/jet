import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, locale, staffRole, timestamps } from "./_shared";
import { user } from "./auth";

export const ownerType = pgEnum("owner_type", ["person", "company"]);
export const memberRole = pgEnum("member_role", ["primary", "viewer"]);

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
    role: memberRole("role").notNull().default("primary"),
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
