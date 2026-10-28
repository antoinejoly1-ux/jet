/**
 * Flight requests: an owner asks for a flight from the portal instead of (or
 * as well as) calling. The request is a message in their thread with dispatch,
 * carrying the details as structured data so both sides see a card, and
 * dispatch plans the flight from it in one click. No separate table: the
 * thread already is the record of what was asked and answered.
 */
import "server-only";
import { and, desc, eq, gte, inArray, isNull, or, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "@/lib/db";
import { aircraft, conversations, messages, shares, type FlightRequestMeta } from "@/lib/db/schema";
import { authorize, type Actor } from "@/lib/auth/policy";
import { airport } from "@/lib/airports";
import { zonedDay } from "@/lib/time";
import { recordAudit } from "./audit";
import { postOwnerMessage } from "./messages";
import { ConflictError, NotFoundError } from "./errors";

export type { FlightRequestMeta, MessageMeta } from "@/lib/db/schema";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,4}$/);

export const flightRequestInput = z
  .object({
    shareId: z.string().uuid(),
    from: code,
    to: code,
    date: day,
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    returnDate: day.optional().or(z.literal("").transform(() => undefined)),
    passengers: z.coerce.number().int().min(1).max(19),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((r) => r.from !== r.to, { path: ["to"], message: "same_airport" })
  .refine((r) => !r.returnDate || r.returnDate >= r.date, { path: ["returnDate"], message: "return_before" });
export type FlightRequestInput = z.input<typeof flightRequestInput>;

/** The request as a sentence, for notifications and anyone reading the thread as plain text. */
function summary(m: FlightRequestMeta, locale: "fr" | "en") {
  const route = `${m.from} → ${m.to}`;
  const when = m.time ? `${m.date} ${m.time}` : m.date;
  const back = m.returnDate ? (locale === "fr" ? `, retour le ${m.returnDate}` : `, returning ${m.returnDate}`) : "";
  const pax =
    locale === "fr"
      ? `${m.passengers} passager${m.passengers > 1 ? "s" : ""}`
      : `${m.passengers} passenger${m.passengers > 1 ? "s" : ""}`;
  const head = locale === "fr" ? "Demande de vol" : "Flight request";
  return `${head} · ${m.registration} · ${route} · ${when}${back} · ${pax}${m.notes ? `\n${m.notes}` : ""}`;
}

/** An owner (or an assistant who acts for them) asks dispatch for a flight on one of their shares. */
export async function requestFlight(db: Db, actor: Actor, raw: FlightRequestInput, locale: "fr" | "en" = "fr") {
  const input = flightRequestInput.parse(raw);
  const [share] = await db
    .select({ ownerId: shares.ownerId, aircraftId: shares.aircraftId, registration: aircraft.registration })
    .from(shares)
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .where(
      and(
        eq(shares.id, input.shareId),
        isNull(aircraft.deletedAt),
        or(isNull(shares.endsOn), gt(shares.endsOn, sql`current_date`)),
      ),
    );
  if (!share) throw new NotFoundError("share");
  authorize(actor, "messages:send", { ownerIds: [share.ownerId] });
  if (input.date < zonedDay(new Date())) throw new ConflictError("date_in_past");
  for (const c of [input.from, input.to]) if (!airport(c)) throw new ConflictError("unknown_airport");

  const meta: FlightRequestMeta = {
    kind: "flight_request",
    status: "requested",
    shareId: input.shareId,
    aircraftId: share.aircraftId,
    registration: share.registration,
    from: input.from,
    to: input.to,
    date: input.date,
    time: input.time ?? null,
    returnDate: input.returnDate ?? null,
    passengers: input.passengers,
    notes: input.notes || null,
  };
  return db.transaction(async (tx) => {
    const message = await postOwnerMessage(tx, actor, share.ownerId, { body: summary(meta, locale), meta });
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "flight.request",
      entityType: "message",
      entityId: message.id,
      after: meta,
    });
    return message;
  });
}

/** The owner's requests dispatch hasn't planned yet, for "Vos prochains vols". */
export async function listOpenFlightRequests(db: Db, actor: Actor) {
  if (actor.ownerIds.length === 0) return [];
  authorize(actor, "owners:read", { ownerIds: actor.ownerIds });
  const rows = await db
    .select({ id: messages.id, meta: messages.meta, createdAt: messages.createdAt })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        inArray(conversations.ownerId, [...actor.ownerIds]),
        sql`${messages.meta}->>'kind' = 'flight_request'`,
        sql`${messages.meta}->>'status' = 'requested'`,
        gte(sql`${messages.meta}->>'date'`, zonedDay(new Date())),
      ),
    )
    .orderBy(desc(messages.createdAt));
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, ...(r.meta as FlightRequestMeta) }));
}

/** One request, for staff planning it. */
export async function getFlightRequest(db: Db, actor: Actor, messageId: string) {
  authorize(actor, "operations:write");
  const [row] = await db.select({ meta: messages.meta }).from(messages).where(eq(messages.id, messageId));
  if (row?.meta?.kind !== "flight_request") throw new NotFoundError("flight_request");
  return row.meta;
}

/** Called inside scheduleFlight's transaction: the request now has its flight. */
export async function markFlightRequestScheduled(tx: Tx, messageId: string, flightId: string) {
  const [row] = await tx
    .update(messages)
    .set({
      meta: sql`${messages.meta} || ${JSON.stringify({ status: "scheduled", flightId })}::jsonb`,
    })
    .where(and(eq(messages.id, messageId), sql`${messages.meta}->>'kind' = 'flight_request'`))
    .returning({ id: messages.id, conversationId: messages.conversationId });
  if (!row) throw new NotFoundError("flight_request");
  return row;
}
