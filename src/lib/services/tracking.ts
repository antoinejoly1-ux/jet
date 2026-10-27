/**
 * Where each aircraft is right now. Positions come from the tracking provider
 * (see integrations/tracking) and are merged with our own schedule: which
 * flight is under way, from where to where, and whose it is.
 *
 * The provider is called for the whole fleet at once, at most every
 * REFRESH_MS, whatever the number of people watching; the last answer is kept
 * in aircraft_positions. Owners see their own aircraft only, and see the route
 * only when the flight is theirs: a co-owner's flight shows their name, a
 * charter shows nothing but "in flight" (the same rule as availability).
 */
import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, aircraftPositions, flights, owners, shares } from "@/lib/db/schema";
import { authorize, isStaff, type Actor } from "@/lib/auth/policy";
import { airport, nearestAirport, type Airport } from "@/lib/airports";
import { distanceKm } from "@/lib/geo";
import {
  getTrackingProvider,
  type LivePosition,
  type ScheduledLeg,
  type TrackingProvider,
  type TrackingTarget,
} from "@/lib/integrations/tracking";
import { NotFoundError } from "./errors";

/** How often the provider is asked, at most. */
export const REFRESH_MS = 20_000;
/** An airborne position older than this means the signal was lost. */
const STALE_MS = 15 * 60_000;
/** How long a flight with no arrival time is assumed to take. */
const DEFAULT_FLIGHT_MS = 2 * 3_600_000;
/** Any number will do, as long as nothing else uses it: one refresh at a time. */
const REFRESH_LOCK = 72_431;

export type AirportRef = Pick<Airport, "icao" | "name" | "city" | "lat" | "lon">;

export type AircraftLive = {
  aircraftId: string;
  registration: string;
  model: string;
  state: "in_flight" | "on_ground" | "maintenance" | "unknown";
  position: {
    lat: number;
    lon: number;
    altitudeFt: number | null;
    groundSpeedKt: number | null;
    headingDeg: number | null;
    seenAt: string;
  } | null;
  /** True when an airborne aircraft hasn't been heard from for a while. */
  stale: boolean;
  /** The airport it is at (on the ground) or its home base when nothing else is known. */
  place: AirportRef | null;
  /** Whose flight is under way, as far as this viewer may know. */
  flightOf: "mine" | "co_owner" | "charter" | "unknown" | null;
  coOwnerName: string | null;
  /** The route, only when the viewer may see it. */
  leg: { from: AirportRef; to: AirportRef; departsAt: string | null; eta: string | null; progress: number } | null;
  nextFlight: {
    from: AirportRef | null;
    to: AirportRef | null;
    fromCode: string;
    toCode: string;
    departsAt: string;
  } | null;
  source: string | null;
};

const ref = (a: Airport | null): AirportRef | null =>
  a ? { icao: a.icao, name: a.name, city: a.city, lat: a.lat, lon: a.lon } : null;

const flightEnd = (f: { departsAt: Date; arrivesAt: Date | null; flightMinutes: number | null }) =>
  f.arrivesAt ?? new Date(f.departsAt.getTime() + (f.flightMinutes ? f.flightMinutes * 60_000 : DEFAULT_FLIGHT_MS));

/** Flights under way now, per aircraft, with whose share they use. */
async function activeFlights(db: Db, now: Date, aircraftIds?: string[]) {
  const rows = await db
    .select({
      aircraftId: flights.aircraftId,
      fromAirport: flights.fromAirport,
      toAirport: flights.toAirport,
      departsAt: flights.departsAt,
      arrivesAt: flights.arrivesAt,
      flightMinutes: flights.flightMinutes,
      ownerId: shares.ownerId,
      ownerName: owners.legalName,
    })
    .from(flights)
    .leftJoin(shares, eq(shares.id, flights.shareId))
    .leftJoin(owners, eq(owners.id, shares.ownerId))
    .where(
      and(
        ne(flights.status, "cancelled"),
        lte(flights.departsAt, now),
        gt(flights.departsAt, new Date(now.getTime() - 24 * 3_600_000)),
        aircraftIds ? inArray(flights.aircraftId, aircraftIds) : undefined,
      ),
    )
    .orderBy(asc(flights.departsAt));
  const byAircraft = new Map<string, (typeof rows)[number]>();
  for (const f of rows) if (flightEnd(f) > now) byAircraft.set(f.aircraftId, f);
  return byAircraft;
}

/**
 * Asks the provider for the whole fleet when the last answer is older than
 * REFRESH_MS. A failed call is logged and the previous positions are kept.
 */
export async function refreshPositions(db: Db, now = new Date(), provider: TrackingProvider = getTrackingProvider()) {
  const fleet = await db
    .select({
      aircraftId: aircraft.id,
      registration: aircraft.registration,
      icaoHex: aircraft.icaoHex,
      homeBase: aircraft.homeBase,
      fetchedAt: aircraftPositions.fetchedAt,
    })
    .from(aircraft)
    .leftJoin(aircraftPositions, eq(aircraftPositions.aircraftId, aircraft.id))
    .where(isNull(aircraft.deletedAt));
  const due = fleet.some((a) => !a.fetchedAt || now.getTime() - a.fetchedAt.getTime() >= REFRESH_MS);
  if (!due || fleet.length === 0) return false;

  return db.transaction(async (tx) => {
    // Several viewers polling at the same moment trigger one provider call.
    const [{ locked }] = (
      await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${REFRESH_LOCK}) as locked`)
    ).rows as [{ locked: boolean }];
    if (!locked) return false;

    const legs = new Map<string, ScheduledLeg>();
    for (const [id, f] of await activeFlights(db, now)) {
      const from = airport(f.fromAirport);
      const to = airport(f.toAirport);
      if (from && to) legs.set(id, { from, to, departsAt: f.departsAt, arrivesAt: flightEnd(f) });
    }
    const homes = new Map<string, { lat: number; lon: number }>();
    for (const a of fleet) {
      const home = airport(a.homeBase);
      if (home) homes.set(a.aircraftId, { lat: home.lat, lon: home.lon });
    }
    const targets: TrackingTarget[] = fleet.map((a) => ({
      aircraftId: a.aircraftId,
      registration: a.registration,
      icaoHex: a.icaoHex,
    }));

    let found = new Map<string, LivePosition>();
    try {
      found = await provider.positions(targets, { now, legs, homes });
    } catch (err) {
      console.error(`[tracking] ${provider.name} failed`, err);
    }

    for (const a of fleet) {
      const p = found.get(a.aircraftId);
      const values = p
        ? {
            lat: p.lat,
            lon: p.lon,
            altitudeFt: p.altitudeFt,
            groundSpeedKt: p.groundSpeedKt,
            headingDeg: p.headingDeg == null ? null : Math.round(p.headingDeg),
            onGround: p.onGround,
            callsign: p.callsign,
            origin: p.origin,
            destination: p.destination,
            eta: p.eta,
            source: provider.name,
            seenAt: p.seenAt,
            fetchedAt: now,
          }
        : { fetchedAt: now };
      await tx
        .insert(aircraftPositions)
        .values({ aircraftId: a.aircraftId, ...values })
        .onConflictDoUpdate({ target: aircraftPositions.aircraftId, set: values });
    }
    return true;
  });
}

type ViewInput = {
  aircraftId: string;
  registration: string;
  model: string;
  status: string;
  homeBase: string | null;
};

async function buildViews(
  db: Db,
  actor: Actor,
  planes: ViewInput[],
  now: Date,
  ownerView: boolean,
): Promise<AircraftLive[]> {
  if (planes.length === 0) return [];
  const ids = planes.map((p) => p.aircraftId);
  // Staff and API keys see every flight in full; owners (and staff on the Client side) see an owner's view.
  const staff = (isStaff(actor) || Boolean(actor.apiScopes)) && !ownerView;
  const [positions, active, upcoming] = await Promise.all([
    db.select().from(aircraftPositions).where(inArray(aircraftPositions.aircraftId, ids)),
    activeFlights(db, now, ids),
    db
      .select({
        aircraftId: flights.aircraftId,
        fromAirport: flights.fromAirport,
        toAirport: flights.toAirport,
        departsAt: flights.departsAt,
        ownerId: shares.ownerId,
      })
      .from(flights)
      .leftJoin(shares, eq(shares.id, flights.shareId))
      .where(
        and(
          inArray(flights.aircraftId, ids),
          eq(flights.status, "scheduled"),
          gt(flights.departsAt, now),
          // Owners only ever see their own upcoming flights here.
          staff ? undefined : actor.ownerIds.length ? inArray(shares.ownerId, [...actor.ownerIds]) : sql`false`,
        ),
      )
      .orderBy(asc(flights.departsAt)),
  ]);
  const posBy = new Map(positions.map((p) => [p.aircraftId, p]));

  return planes.map((plane): AircraftLive => {
    const pos = posBy.get(plane.aircraftId);
    const hasPos = pos?.lat != null && pos?.lon != null && pos.seenAt != null;
    const flight = active.get(plane.aircraftId);
    const airborne = hasPos && pos.onGround === false;
    const stale = airborne && now.getTime() - pos.seenAt!.getTime() > STALE_MS;

    let flightOf: AircraftLive["flightOf"] = null;
    let coOwnerName: string | null = null;
    let from: Airport | null = null;
    let to: Airport | null = null;
    let departsAt: Date | null = null;
    let eta: Date | null = pos?.eta ?? null;
    if (flight && (airborne || !hasPos)) {
      const mine = !!flight.ownerId && actor.ownerIds.includes(flight.ownerId);
      flightOf = mine ? "mine" : flight.ownerId ? "co_owner" : "charter";
      if (flightOf === "co_owner") coOwnerName = flight.ownerName;
      if (staff || mine) {
        from = airport(flight.fromAirport);
        to = airport(flight.toAirport);
        departsAt = flight.departsAt;
        eta = flight.arrivesAt ?? eta ?? flightEnd(flight);
      }
    } else if (airborne) {
      flightOf = "unknown";
      if (staff) {
        from = airport(pos.origin);
        to = airport(pos.destination);
      }
    }

    let progress = 0;
    if (from && to) {
      const total = distanceKm(from.lat, from.lon, to.lat, to.lon);
      progress = hasPos
        ? Math.min(1, Math.max(0, distanceKm(from.lat, from.lon, pos.lat!, pos.lon!) / (total || 1)))
        : departsAt && eta
          ? Math.min(1, Math.max(0, (now.getTime() - departsAt.getTime()) / (eta.getTime() - departsAt.getTime())))
          : 0;
    }

    const state: AircraftLive["state"] = airborne
      ? "in_flight"
      : plane.status === "maintenance"
        ? "maintenance"
        : hasPos
          ? "on_ground"
          : "unknown";
    const place = !airborne
      ? ref((hasPos ? nearestAirport(pos.lat!, pos.lon!) : null) ?? airport(plane.homeBase))
      : null;
    const next = upcoming.find((f) => f.aircraftId === plane.aircraftId);

    return {
      aircraftId: plane.aircraftId,
      registration: plane.registration,
      model: plane.model,
      state,
      position: hasPos
        ? {
            lat: pos.lat!,
            lon: pos.lon!,
            altitudeFt: pos.altitudeFt,
            groundSpeedKt: pos.groundSpeedKt,
            headingDeg: pos.headingDeg,
            seenAt: pos.seenAt!.toISOString(),
          }
        : null,
      stale,
      place,
      flightOf,
      coOwnerName,
      leg:
        from && to
          ? {
              from: ref(from)!,
              to: ref(to)!,
              departsAt: departsAt?.toISOString() ?? null,
              eta: eta?.toISOString() ?? null,
              progress,
            }
          : null,
      nextFlight: next
        ? {
            from: ref(airport(next.fromAirport)),
            to: ref(airport(next.toAirport)),
            fromCode: next.fromAirport,
            toCode: next.toAirport,
            departsAt: next.departsAt.toISOString(),
          }
        : null,
      source: pos?.source ?? null,
    };
  });
}

const planeColumns = {
  aircraftId: aircraft.id,
  registration: aircraft.registration,
  model: aircraft.model,
  status: aircraft.status,
  homeBase: aircraft.homeBase,
};

/** Every owner with an active share in this aircraft: the scope for owner reads. */
async function holderOwnerIds(db: Db, aircraftId: string) {
  const rows = await db
    .selectDistinct({ ownerId: shares.ownerId })
    .from(shares)
    .where(and(eq(shares.aircraftId, aircraftId), or(isNull(shares.endsOn), gt(shares.endsOn, sql`current_date`))));
  return rows.map((r) => r.ownerId);
}

type LiveOptions = {
  now?: Date;
  provider?: TrackingProvider;
  /** Show what an owner sees even to staff (the Client side, including "view as owner"). */
  ownerView?: boolean;
};

/** One aircraft, live. Owners need a share in it. */
export async function getAircraftLive(
  db: Db,
  actor: Actor,
  aircraftId: string,
  { now = new Date(), provider, ownerView = false }: LiveOptions = {},
): Promise<AircraftLive> {
  authorize(actor, "fleet:read", { ownerIds: await holderOwnerIds(db, aircraftId) });
  const [plane] = await db
    .select(planeColumns)
    .from(aircraft)
    .where(and(eq(aircraft.id, aircraftId), isNull(aircraft.deletedAt)));
  if (!plane) throw new NotFoundError("aircraft");
  await refreshPositions(db, now, provider);
  const [view] = await buildViews(db, actor, [plane], now, ownerView);
  return view!;
}

/** The whole fleet, live, for the back office map. */
export async function getFleetLive(db: Db, actor: Actor, { now = new Date(), provider }: LiveOptions = {}) {
  authorize(actor, "fleet:read");
  const planes = await db
    .select(planeColumns)
    .from(aircraft)
    .where(isNull(aircraft.deletedAt))
    .orderBy(asc(aircraft.registration));
  await refreshPositions(db, now, provider);
  return buildViews(db, actor, planes, now, false);
}
