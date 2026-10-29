/**
 * The public API's request bodies. Times are ISO 8601 with an offset, money is
 * integer cents, durations are minutes; each body maps onto the same
 * validated input the screens use, so the API can't do anything they can't.
 */
import { z } from "zod";
import type { TransactionInput } from "@/lib/validation/finance";
import type { CompleteFlightInput, FlightInput } from "@/lib/validation/operations";
import { utcToZonedLocal } from "@/lib/time";

const instant = z.iso.datetime({ offset: true });
const local = (iso: string) => utcToZonedLocal(new Date(iso));

export const apiFlightBody = z.object({
  aircraftId: z.uuid(),
  shareId: z.uuid().nullable().optional().describe("Whose hours the flight uses; omit for positioning flights"),
  fromAirport: z.string().describe("ICAO code, e.g. CYUL"),
  toAirport: z.string(),
  departsAt: instant,
  arrivesAt: instant.nullable().optional(),
});
export const toFlightInput = (b: z.infer<typeof apiFlightBody>): FlightInput => ({
  aircraftId: b.aircraftId,
  shareId: b.shareId ?? "",
  fromAirport: b.fromAirport,
  toAirport: b.toAirport,
  departsAt: local(b.departsAt),
  arrivesAt: b.arrivesAt ? local(b.arrivesAt) : "",
});

export const apiCompleteBody = z.object({
  flightMinutes: z.number().int().min(1).max(1440),
  arrivesAt: instant.nullable().optional(),
});
export const toCompleteInput = (b: z.infer<typeof apiCompleteBody>): CompleteFlightInput => ({
  flightTime: `${Math.floor(b.flightMinutes / 60)}:${String(b.flightMinutes % 60).padStart(2, "0")}`,
  arrivesAt: b.arrivesAt ? local(b.arrivesAt) : "",
});

export const apiCancelBody = z.object({ reason: z.string().max(300).optional() });

export const apiTransactionBody = z.object({
  shareId: z.uuid(),
  occurredOn: z.iso.date(),
  kind: z.enum(["cost", "revenue", "payment"]),
  amountCents: z
    .number()
    .int()
    .refine((n) => n !== 0, "must_not_be_zero"),
  currency: z.literal("CAD").default("CAD"),
  categoryId: z.uuid().nullable().optional(),
  description: z.string().max(300).nullable().optional(),
});
export const toTransactionInput = (b: z.infer<typeof apiTransactionBody>): TransactionInput => ({
  shareId: b.shareId,
  occurredOn: b.occurredOn,
  kind: b.kind,
  amount: (b.amountCents / 100).toFixed(2),
  currency: b.currency,
  categoryId: b.categoryId ?? "",
  description: b.description ?? undefined,
});
