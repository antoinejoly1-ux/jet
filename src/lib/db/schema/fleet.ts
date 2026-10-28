import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { dataSource, deletedAt, id, timestamps } from "./_shared";
import { holdingCompanies, owners } from "./owners";
import { files } from "./platform";

export const aircraftStatus = pgEnum("aircraft_status", ["available", "flying", "maintenance", "inactive"]);
export const flightStatus = pgEnum("flight_status", ["scheduled", "completed", "cancelled"]);
export const availabilityKind = pgEnum("availability_kind", ["available", "booked", "maintenance"]);
/** planned → in_progress → review (work signed off) → done, or cancelled. */
export const maintenanceStatus = pgEnum("maintenance_status", [
  "planned",
  "in_progress",
  "review",
  "done",
  "cancelled",
]);

export const aircraft = pgTable(
  "aircraft",
  {
    id: id(),
    /** Registration mark, e.g. C-GJET. */
    registration: text("registration").notNull().unique(),
    model: text("model").notNull(),
    serialNumber: text("serial_number"),
    homeBase: text("home_base"),
    status: aircraftStatus("status").notNull().default("available"),
    /** ICAO 24-bit address (hex), used by flight-tracking providers. */
    icaoHex: text("icao_hex"),
    /** The company that owns it; null while unknown or for an aircraft Univair only operates. */
    holdingCompanyId: uuid("holding_company_id").references(() => holdingCompanies.id, { onDelete: "restrict" }),
    /** Its own photo, uploaded by the team; until then, the model's. */
    photoFileId: uuid("photo_file_id").references((): AnyPgColumn => files.id, { onDelete: "set null" }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("aircraft_holding_company_id_idx").on(t.holdingCompanyId)],
);

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

/**
 * The latest known position of each aircraft, from the tracking provider.
 * Kept when the transponder goes quiet, so a parked aircraft still shows
 * where it was last seen. `fetchedAt` paces calls to the provider. This is
 * telemetry, refreshed every few seconds, so it isn't audited.
 */
export const aircraftPositions = pgTable("aircraft_positions", {
  aircraftId: uuid("aircraft_id")
    .primaryKey()
    .references(() => aircraft.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  altitudeFt: integer("altitude_ft"),
  groundSpeedKt: integer("ground_speed_kt"),
  headingDeg: integer("heading_deg"),
  onGround: boolean("on_ground"),
  callsign: text("callsign"),
  origin: text("origin"),
  destination: text("destination"),
  eta: timestamp("eta", { withTimezone: true }),
  source: text("source"),
  seenAt: timestamp("seen_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

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
    flightMinutes: integer("flight_minutes"),
    status: flightStatus("status").notNull().default("scheduled"),
    source: dataSource("source").notNull().default("manual"),
    externalId: text("external_id"),
    ...timestamps(),
  },
  (t) => [
    index("flights_aircraft_departs_idx").on(t.aircraftId, t.departsAt),
    index("flights_share_id_idx").on(t.shareId),
    // A record synced from an outside system exists once, however often the sync runs.
    uniqueIndex("flights_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),
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
    uniqueIndex("availability_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),
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
  (t) => [
    index("maintenance_aircraft_idx").on(t.aircraftId),
    uniqueIndex("maintenance_external_id_uq")
      .on(t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);
