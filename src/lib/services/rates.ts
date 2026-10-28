/**
 * The hourly rate of each aircraft: fuel, the maintenance reserves set aside
 * per hour for each component, and the pilot. A flight hour is billed at the
 * rate in force on the day of the flight; a new rate takes effect from a date,
 * so earlier flights keep the rate they were flown at.
 */
import "server-only";
import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/lib/db";
import { aircraft, aircraftRates } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { money } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

export type AircraftRate = typeof aircraftRates.$inferSelect;

/** The parts of an hour, in the order they're shown and billed. Reserves are kept per component. */
export const RATE_PARTS = ["fuel", "engine", "propeller", "airframe", "avionics", "pilot"] as const;
export type RatePart = (typeof RATE_PARTS)[number];
export const RESERVE_PARTS = ["engine", "propeller", "airframe", "avionics"] as const satisfies readonly RatePart[];
export type ReservePart = (typeof RESERVE_PARTS)[number];

const COLUMN = {
  fuel: "fuelCentsPerHour",
  engine: "engineReserveCentsPerHour",
  propeller: "propellerReserveCentsPerHour",
  airframe: "airframeReserveCentsPerHour",
  avionics: "avionicsReserveCentsPerHour",
  pilot: "pilotCentsPerHour",
} as const satisfies Record<RatePart, keyof AircraftRate>;

/** Cents per hour of one part of a rate. */
export const perHour = (rate: AircraftRate, part: RatePart): number => rate[COLUMN[part]];

/** What a full flight hour costs. */
export const hourlyTotal = (rate: AircraftRate) => RATE_PARTS.reduce((sum, p) => sum + perHour(rate, p), 0);

/**
 * What a flight of `minutes` comes to, part by part. Each part is rounded to
 * the cent on its own, so the lines of an invoice always add up to its total.
 */
export function chargesFor(rate: AircraftRate, minutes: number) {
  const lines = RATE_PARTS.map((part) => ({
    part,
    perHourCents: perHour(rate, part),
    cents: Math.round((perHour(rate, part) * minutes) / 60),
  }));
  return { lines, totalCents: lines.reduce((s, l) => s + l.cents, 0) };
}

/**
 * Whether a fuel receipt is billed to the owner. Fuel is part of the hourly
 * rate: when the rate in force has a fuel part, the fuel the pilot bought is
 * the company's cost, already paid by the rate, and is not billed again. With
 * no fuel in the rate, fuel receipts are rebilled at cost like any expense.
 */
export const fuelIncludedInRate = (rate: AircraftRate | null) => !!rate && perHour(rate, "fuel") > 0;

const nonNegative = money.refine((c) => c >= 0, { message: "invalid_amount" });

export const rateInput = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fuel: nonNegative,
  engine: nonNegative,
  propeller: nonNegative,
  airframe: nonNegative,
  avionics: nonNegative,
  pilot: nonNegative,
});
export type RateInput = z.input<typeof rateInput>;

/** An aircraft's rates, latest first. */
export async function listRates(db: Db, actor: Actor, aircraftId: string) {
  authorize(actor, "finance:read");
  return db
    .select()
    .from(aircraftRates)
    .where(eq(aircraftRates.aircraftId, aircraftId))
    .orderBy(desc(aircraftRates.effectiveFrom));
}

/** The rate in force on a day (YYYY-MM-DD), or null when none had been set yet. */
export async function rateOn(db: DbOrTx, aircraftId: string, day: string): Promise<AircraftRate | null> {
  const [rate] = await db
    .select()
    .from(aircraftRates)
    .where(and(eq(aircraftRates.aircraftId, aircraftId), lte(aircraftRates.effectiveFrom, day)))
    .orderBy(desc(aircraftRates.effectiveFrom))
    .limit(1);
  return rate ?? null;
}

/**
 * Sets the rate from a date. Setting it again for the same date corrects that
 * rate; a later date starts a new one and leaves earlier flights as they were.
 */
export async function setRate(db: Db, actor: Actor, aircraftId: string, raw: RateInput) {
  authorize(actor, "finance:write");
  const input = rateInput.parse(raw);
  const values = {
    fuelCentsPerHour: input.fuel,
    engineReserveCentsPerHour: input.engine,
    propellerReserveCentsPerHour: input.propeller,
    airframeReserveCentsPerHour: input.airframe,
    avionicsReserveCentsPerHour: input.avionics,
    pilotCentsPerHour: input.pilot,
  };
  if (Object.values(values).every((v) => v === 0)) throw new ConflictError("rate_empty");
  return db.transaction(async (tx) => {
    const [plane] = await tx.select({ id: aircraft.id }).from(aircraft).where(eq(aircraft.id, aircraftId));
    if (!plane) throw new NotFoundError("aircraft");
    const [before] = await tx
      .select()
      .from(aircraftRates)
      .where(and(eq(aircraftRates.aircraftId, aircraftId), eq(aircraftRates.effectiveFrom, input.effectiveFrom)));
    const [row] = await tx
      .insert(aircraftRates)
      .values({ aircraftId, effectiveFrom: input.effectiveFrom, ...values, createdByUserId: actor.id })
      .onConflictDoUpdate({ target: [aircraftRates.aircraftId, aircraftRates.effectiveFrom], set: values })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "aircraft.rate.set",
      entityType: "aircraft",
      entityId: aircraftId,
      before: before ?? null,
      after: { effectiveFrom: input.effectiveFrom, ...values },
    });
    return row!;
  });
}
