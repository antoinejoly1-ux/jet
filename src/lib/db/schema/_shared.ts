import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/** UUIDv7 primary key: sortable by creation time, safe to expose in URLs. */
export const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Soft delete marker. Financial records are never soft-deleted, only reversed. */
export const deletedAt = () => timestamp("deleted_at", { withTimezone: true });

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffRole = pgEnum("staff_role", ["admin", "finance", "dispatcher", "pilot"]);
export const locale = pgEnum("locale", ["fr", "en"]);
export const currency = pgEnum("currency", ["CAD", "USD"]);
export const dataSource = pgEnum("data_source", ["manual", "import", "sync"]);

export type StaffRole = (typeof staffRole.enumValues)[number];
export type Locale = (typeof locale.enumValues)[number];
export type Currency = (typeof currency.enumValues)[number];
