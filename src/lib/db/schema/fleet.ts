import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dataSource, deletedAt, id, timestamps } from "./_shared";
import { owners } from "./owners";

export const aircraftStatus = pgEnum("aircraft_status", ["available", "flying", "maintenance", "inactive"]);
export const flightStatus = pgEnum("flight_status", ["scheduled", "completed", "cancelled"]);
export const availabilityKind = pgEnum("availability_kind", ["available", "booked", "maintenance"]);
export const maintenanceStatus = pgEnum("maintenance_status", ["planned", "in_progress", "done", "cancelled"]);

export const aircraft = pgTable("aircraft", {
  id: id(),
  /** Registration mark, e.g. C-GJET. */
  registration: text("registration").notNull().unique(),
  model: text("model").notNull(),
  serialNumber: text("serial_number"),
  homeBase: text("home_base"),
  status: aircraftStatus("status").notNull().default("available"),
  /** ICAO 24-bit address (hex), used by flight-tracking providers. */
  icaoHex: text("icao_hex"),
  ...timestamps(),
  deletedAt: deletedAt(),
});

/** An owner's stake in an aircraft. Percentages are basis points: 2500 = 25%. */
export const shares = pgTable(
  "shares",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "restrict" }),
    percentageBp: integer("percentage_bp").notNull(),
    annualHoursMinutes: integer("annual_hours_minutes"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    ...timestamps(),
  },
  (t) => [
    index("shares_owner_id_idx").on(t.ownerId),
    index("shares_aircraft_id_idx").on(t.aircraftId),
    check("shares_percentage_range", sql`${t.percentageBp} > 0 AND ${t.percentageBp} <= 10000`),
  ],
);

export const flights = pgTable(
  "flights",
  {
    id: id(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "restrict" }),
    /** The share whose hours this flight uses; null for positioning or maintenance flights. */
    shareId: uuid("share_id").references(() => shares.id, { onDelete: "restrict" }),
    fromAirport: text("from_airport").notNull(),
    toAirport: text("to_airport").notNull(),
    departsAt: timestamp("departs_at", { withTimezone: true }).notNull(),
    arrivesAt: timestamp("arrives_at", { withTimezone: true }),
    blockMinutes: integer("block_minutes"),
    status: flightStatus("status").notNull().default("scheduled"),
    source: dataSource("source").notNull().default("manual"),
    externalId: text("external_id"),
    ...timestamps(),
  },
  (t) => [
    index("flights_aircraft_departs_idx").on(t.aircraftId, t.departsAt),
    index("flights_share_id_idx").on(t.shareId),
  ],
);

export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: id(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    kind: availabilityKind("kind").notNull(),
    source: dataSource("source").notNull().default("manual"),
    externalId: text("external_id"),
    ...timestamps(),
  },
  (t) => [
    index("availability_aircraft_starts_idx").on(t.aircraftId, t.startsAt),
    check("availability_valid_range", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const maintenanceEvents = pgTable(
  "maintenance_events",
  {
    id: id(),
    aircraftId: uuid("aircraft_id")
      .notNull()
      .references(() => aircraft.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    dueOn: date("due_on"),
    dueAtHoursMinutes: integer("due_at_hours_minutes"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: maintenanceStatus("status").notNull().default("planned"),
    notes: text("notes"),
    source: dataSource("source").notNull().default("manual"),
    externalId: text("external_id"),
    ...timestamps(),
  },
  (t) => [index("maintenance_aircraft_idx").on(t.aircraftId)],
);
