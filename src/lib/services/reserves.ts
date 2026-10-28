/**
 * Maintenance reserves. Each flight hour billed sets money aside per
 * component (engine, propeller, airframe, avionics) to pay for the big jobs
 * when they come: an overhaul, a propeller. The ledger is append-only: flights
 * add, maintenance paid from a reserve takes, corrections are new entries.
 */
import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx, Tx } from "@/lib/db";
import { aircraft, owners, reserveLedger, reserveTargets, shares } from "@/lib/db/schema";
import { authorize, financeOwnerIds, type Actor } from "@/lib/auth/policy";
import { zonedDay } from "@/lib/time";
import { money } from "@/lib/validation/finance";
import { recordAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";
import { RESERVE_PARTS, type ReservePart } from "./rates";

export { RESERVE_PARTS };

/** Sets aside the reserve lines of an invoice, one entry per component. */
export async function creditReserves(
  tx: Tx,
  entry: { aircraftId: string; invoiceId: string; occurredOn: string; actorUserId: string },
  lines: { kind: string; part: string; amountCents: number }[],
) {
  const rows = lines
    .filter((l) => l.kind === "hours" && (RESERVE_PARTS as readonly string[]).includes(l.part) && l.amountCents)
    .map((l) => ({
      aircraftId: entry.aircraftId,
      component: l.part as ReservePart,
      kind: "flight" as const,
      amountCents: l.amountCents,
      occurredOn: entry.occurredOn,
      invoiceId: entry.invoiceId,
      createdByUserId: entry.actorUserId,
    }));
  if (rows.length) await tx.insert(reserveLedger).values(rows);
}

/** A voided invoice gives back what it set aside: an opposite entry for each, never a deletion. */
export async function reverseReservesOf(
  tx: Tx,
  invoiceId: string,
  actorUserId: string,
  note: string,
  occurredOn = zonedDay(new Date()),
) {
  const entries = await tx.select().from(reserveLedger).where(eq(reserveLedger.invoiceId, invoiceId));
  const net = new Map<string, { aircraftId: string; component: ReservePart; cents: number }>();
  for (const e of entries) {
    const key = `${e.aircraftId}:${e.component}`;
    const cur = net.get(key) ?? { aircraftId: e.aircraftId, component: e.component, cents: 0 };
    cur.cents += e.amountCents;
    net.set(key, cur);
  }
  const rows = [...net.values()]
    .filter((n) => n.cents !== 0)
    .map((n) => ({
      aircraftId: n.aircraftId,
      component: n.component,
      kind: "adjustment" as const,
      amountCents: -n.cents,
      occurredOn,
      invoiceId,
      note,
      createdByUserId: actorUserId,
    }));
  if (rows.length) await tx.insert(reserveLedger).values(rows);
}

/** Balances per component, with what each is saving towards. */
async function balancesOf(db: DbOrTx, aircraftIds: string[]) {
  if (!aircraftIds.length) return { balances: [], targets: [] };
  const [balances, targets] = await Promise.all([
    db
      .select({
        aircraftId: reserveLedger.aircraftId,
        component: reserveLedger.component,
        balanceCents: sql<number>`coalesce(sum(${reserveLedger.amountCents}), 0)`.mapWith(Number),
        setAsideCents:
          sql<number>`coalesce(sum(${reserveLedger.amountCents}) filter (where ${reserveLedger.kind} = 'flight'), 0)`.mapWith(
            Number,
          ),
        spentCents:
          sql<number>`coalesce(-sum(${reserveLedger.amountCents}) filter (where ${reserveLedger.kind} = 'work'), 0)`.mapWith(
            Number,
          ),
      })
      .from(reserveLedger)
      .where(inArray(reserveLedger.aircraftId, aircraftIds))
      .groupBy(reserveLedger.aircraftId, reserveLedger.component),
    db.select().from(reserveTargets).where(inArray(reserveTargets.aircraftId, aircraftIds)),
  ]);
  return { balances, targets };
}

const shape = (aircraftId: string, data: Awaited<ReturnType<typeof balancesOf>>) =>
  RESERVE_PARTS.map((component) => {
    const b = data.balances.find((x) => x.aircraftId === aircraftId && x.component === component);
    const target = data.targets.find((x) => x.aircraftId === aircraftId && x.component === component);
    const balanceCents = b?.balanceCents ?? 0;
    return {
      component,
      balanceCents,
      setAsideCents: b?.setAsideCents ?? 0,
      spentCents: b?.spentCents ?? 0,
      targetCents: target?.targetCents ?? null,
      targetLabel: target?.label ?? null,
      /** How much of the job the reserve already covers, 0–1; null without a target. */
      covered: target?.targetCents ? Math.max(0, Math.min(1, balanceCents / target.targetCents)) : null,
    };
  });

/** One aircraft's reserves, for the team. */
export async function getAircraftReserves(db: Db, actor: Actor, aircraftId: string) {
  authorize(actor, "finance:read");
  const data = await balancesOf(db, [aircraftId]);
  const history = await db
    .select()
    .from(reserveLedger)
    .where(and(eq(reserveLedger.aircraftId, aircraftId), sql`${reserveLedger.kind} <> 'flight'`))
    .orderBy(sql`${reserveLedger.occurredOn} desc`, sql`${reserveLedger.createdAt} desc`)
    .limit(20);
  return { components: shape(aircraftId, data), history };
}

/**
 * The reserves of the aircraft an owner holds shares in, with their part of
 * each balance (their percentage of it).
 */
export async function listOwnerReserves(db: Db, actor: Actor) {
  const ids = financeOwnerIds(actor);
  if (!ids.length) return [];
  authorize(actor, "finance:read", { ownerIds: ids });
  const today = zonedDay(new Date());
  const held = await db
    .select({
      aircraftId: aircraft.id,
      registration: aircraft.registration,
      model: aircraft.model,
      ownerName: owners.legalName,
      percentageBp: shares.percentageBp,
    })
    .from(shares)
    .innerJoin(aircraft, eq(aircraft.id, shares.aircraftId))
    .innerJoin(owners, eq(owners.id, shares.ownerId))
    .where(
      and(
        inArray(shares.ownerId, [...ids]),
        isNull(aircraft.deletedAt),
        lte(shares.startsOn, today),
        or(isNull(shares.endsOn), gt(shares.endsOn, today)),
      ),
    )
    .orderBy(asc(aircraft.registration));
  const data = await balancesOf(
    db,
    held.map((h) => h.aircraftId),
  );
  return held.map((h) => {
    const components = shape(h.aircraftId, data);
    const totalCents = components.reduce((s, c) => s + c.balanceCents, 0);
    return { ...h, components, totalCents, mineCents: Math.round((totalCents * h.percentageBp) / 10_000) };
  });
}

const component = z.enum(RESERVE_PARTS);

export const reserveWorkInput = z.object({
  component,
  amount: money.refine((c) => c > 0, { message: "invalid_amount" }),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().min(2).max(300),
  /** Pay more than the reserve holds anyway (it goes negative), after being told. */
  override: z
    .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === true || v === "on" || v === "true"),
});
export type ReserveWorkInput = z.input<typeof reserveWorkInput>;

/** Maintenance paid out of a reserve: « payé par la réserve hélice ». */
export async function payFromReserve(db: Db, actor: Actor, aircraftId: string, raw: ReserveWorkInput) {
  authorize(actor, "finance:write");
  const input = reserveWorkInput.parse(raw);
  return db.transaction(async (tx) => {
    const [plane] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(eq(aircraft.id, aircraftId))
      .for("update");
    if (!plane) throw new NotFoundError("aircraft");
    const [held] = await tx
      .select({ cents: sql<number>`coalesce(sum(${reserveLedger.amountCents}), 0)`.mapWith(Number) })
      .from(reserveLedger)
      .where(and(eq(reserveLedger.aircraftId, aircraftId), eq(reserveLedger.component, input.component)));
    const balanceCents = held?.cents ?? 0;
    if (input.amount > balanceCents && !input.override) throw new ConflictError("reserve_insufficient");
    const [row] = await tx
      .insert(reserveLedger)
      .values({
        aircraftId,
        component: input.component,
        kind: "work",
        amountCents: -input.amount,
        occurredOn: input.occurredOn,
        note: input.note,
        createdByUserId: actor.id,
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "reserve.work",
      entityType: "aircraft",
      entityId: aircraftId,
      after: {
        component: input.component,
        amountCents: input.amount,
        note: input.note,
        balanceBeforeCents: balanceCents,
        override: input.amount > balanceCents,
      },
    });
    return row!;
  });
}

export const reserveTargetInput = z.object({
  component,
  target: money.refine((c) => c > 0, { message: "invalid_amount" }),
  label: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
});
export type ReserveTargetInput = z.input<typeof reserveTargetInput>;

/** What a reserve is saving towards, e.g. « Révision de l'hélice » at $200,000. */
export async function setReserveTarget(db: Db, actor: Actor, aircraftId: string, raw: ReserveTargetInput) {
  authorize(actor, "finance:write");
  const input = reserveTargetInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reserveTargets)
      .values({ aircraftId, component: input.component, targetCents: input.target, label: input.label })
      .onConflictDoUpdate({
        target: [reserveTargets.aircraftId, reserveTargets.component],
        set: { targetCents: input.target, label: input.label },
      })
      .returning();
    await recordAudit(tx, {
      actorUserId: actor.id,
      action: "reserve.target",
      entityType: "aircraft",
      entityId: aircraftId,
      after: { component: input.component, targetCents: input.target, label: input.label },
    });
    return row!;
  });
}
