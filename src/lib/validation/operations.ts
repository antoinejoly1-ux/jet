/**
 * Input schemas for flights, maintenance and availability. Times are typed in
 * the operator's time zone ("2026-11-01T08:30") and become UTC instants here.
 */
import { z } from "zod";
import { zonedLocalToUtc } from "@/lib/time";

const localDateTime = z.string().transform((v, ctx) => {
  const at = zonedLocalToUtc(v);
  if (!at) {
    ctx.addIssue({ code: "custom", message: "invalid_datetime" });
    return z.NEVER;
  }
  return at;
});

const optionalLocalDateTime = z
  .literal("")
  .transform(() => null)
  .or(localDateTime)
  .optional()
  .transform((v) => v ?? null);

const airport = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,4}$/);

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined))
  .transform((v) => v ?? null);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const flightInput = z
  .object({
    aircraftId: z.string().uuid(),
    shareId: optionalUuid,
    fromAirport: airport,
    toAirport: airport,
    departsAt: localDateTime,
    arrivesAt: optionalLocalDateTime,
  })
  .refine((f) => !f.arrivesAt || f.arrivesAt > f.departsAt, { path: ["arrivesAt"], message: "before_departure" });
export type FlightInput = z.input<typeof flightInput>;

/** Flight time is typed as "2:15" or "2.25" hours. */
export function parseDurationToMinutes(input: string): number | null {
  const s = input.trim().replace(",", ".");
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  if (/^\d{1,2}(\.\d{1,2})?$/.test(s)) return Math.round(Number(s) * 60);
  return null;
}

export const completeFlightInput = z.object({
  flightTime: z.string().transform((v, ctx) => {
    const minutes = parseDurationToMinutes(v);
    if (!minutes || minutes > 24 * 60) {
      ctx.addIssue({ code: "custom", message: "invalid_duration" });
      return z.NEVER;
    }
    return minutes;
  }),
  arrivesAt: optionalLocalDateTime,
});
export type CompleteFlightInput = z.input<typeof completeFlightInput>;

export const maintenanceInput = z
  .object({
    aircraftId: z.string().uuid(),
    type: z.enum(["inspection", "unscheduled", "upgrade", "other"]),
    title: z.string().trim().min(2).max(200),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal("").transform(() => undefined))
      .transform((v) => v ?? null),
    startsAt: optionalLocalDateTime,
    endsAt: optionalLocalDateTime,
    notes: optionalText(4000),
  })
  .refine((m) => !m.startsAt || !m.endsAt || m.endsAt > m.startsAt, { path: ["endsAt"], message: "before_start" })
  .refine((m) => !m.endsAt || m.startsAt, { path: ["startsAt"], message: "required_with_end" });
export type MaintenanceInput = z.input<typeof maintenanceInput>;

export const blockInput = z
  .object({
    startsAt: localDateTime,
    endsAt: localDateTime,
    kind: z.enum(["booked", "maintenance"]),
  })
  .refine((b) => b.endsAt > b.startsAt, { path: ["endsAt"], message: "before_start" });
export type BlockInput = z.input<typeof blockInput>;
