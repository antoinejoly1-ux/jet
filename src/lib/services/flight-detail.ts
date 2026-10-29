/**
 * One flight as the team opens it: where it went and when, the aircraft, who
 * it was billed to, its route for the map (live while it's in the air), and
 * what the pilot reported. Amounts only show to those who see finances.
 */
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { aircraft, files, flightReportExpenses, flightReports, flights, shares, user } from "@/lib/db/schema";
import { authorize, can, financeOwnerIds, type Actor } from "@/lib/auth/policy";
import { airport } from "@/lib/airports";
import { aircraftPhotoUrl } from "@/lib/aircraft-photo-url";
import { getFlight, getFlightUnchecked } from "./flights";
import { NotFoundError } from "./errors";
import { getAircraftLive, type AircraftLive } from "./tracking";

const ref = (code: string) => {
  const a = airport(code);
  return a ? { icao: a.icao, name: a.name, city: a.city, lat: a.lat, lon: a.lon } : null;
};

type FlightRow = Awaited<ReturnType<typeof getFlight>>;

/** The route for the map: the live view while this flight is the one in the air, else its two airports. */
async function routeOf(db: Db, actor: Actor, flight: FlightRow, now: Date, ownerView: boolean) {
  const [plane] = await db
    .select({ model: aircraft.model, photoFileId: aircraft.photoFileId })
    .from(aircraft)
    .where(eq(aircraft.id, flight.aircraftId));
  const from = ref(flight.fromAirport);
  const to = ref(flight.toAirport);
  const live = await getAircraftLive(db, actor, flight.aircraftId, { now, ownerView }).catch(() => null);
  const inAir =
    live?.state === "in_flight" &&
    flight.status === "scheduled" &&
    flight.departsAt <= now &&
    live.leg?.to.icao === flight.toAirport;
  const route: AircraftLive | null = inAir
    ? live
    : from && to
      ? {
          aircraftId: flight.aircraftId,
          registration: flight.registration,
          model: plane?.model ?? "",
          photoUrl: aircraftPhotoUrl(flight.aircraftId, plane?.photoFileId ?? null),
          state: "on_ground",
          position: null,
          stale: false,
          place: flight.status === "completed" ? to : from,
          flightOf: null,
          coOwnerName: null,
          leg: {
            from,
            to,
            departsAt: flight.departsAt.toISOString(),
            eta: flight.arrivesAt?.toISOString() ?? null,
            progress: flight.status === "completed" ? 1 : 0,
          },
          nextFlight: null,
          source: null,
          generatedAt: now.toISOString(),
        }
      : null;
  return { plane, route, inAir: Boolean(inAir) };
}

export async function getFlightDetail(db: Db, actor: Actor, id: string, now = new Date()) {
  authorize(actor, "fleet:read");
  const flight = await getFlight(db, actor, id);
  const { plane, route, inAir } = await routeOf(db, actor, flight, now, false);

  const [report] = await db
    .select({
      id: flightReports.id,
      status: flightReports.status,
      flightMinutes: flightReports.flightMinutes,
      fuelLitres: flightReports.fuelLitres,
      notes: flightReports.notes,
      invoiceId: flightReports.invoiceId,
      submittedAt: flightReports.submittedAt,
      pilotName: user.name,
      pilotId: user.id,
      pilotImage: user.image,
    })
    .from(flightReports)
    .leftJoin(user, eq(user.id, flightReports.pilotUserId))
    .where(eq(flightReports.flightId, id));
  const money = can(actor, "finance:read");
  const expenses = report
    ? (
        await db
          .select({
            id: flightReportExpenses.id,
            category: flightReportExpenses.category,
            amountCents: flightReportExpenses.amountCents,
            paidBy: flightReportExpenses.paidBy,
            note: flightReportExpenses.note,
            receiptFileId: flightReportExpenses.receiptFileId,
            receiptType: files.contentType,
          })
          .from(flightReportExpenses)
          .leftJoin(files, eq(files.id, flightReportExpenses.receiptFileId))
          .where(eq(flightReportExpenses.reportId, report.id))
          .orderBy(asc(flightReportExpenses.createdAt))
      ).map((e) => (money ? e : { ...e, amountCents: null, receiptFileId: null, receiptType: null }))
    : [];

  return {
    flight: { ...flight, model: plane?.model ?? "" },
    photoUrl: aircraftPhotoUrl(flight.aircraftId, plane?.photoFileId ?? null),
    route,
    inAir,
    report: report ? { ...report, invoiceId: money ? report.invoiceId : null } : null,
    expenses,
    seesMoney: money,
  };
}

export type FlightDetail = Awaited<ReturnType<typeof getFlightDetail>>;

/**
 * One of the owner's own flights: where and when, the route on the map, who
 * flew it and for how long, and its invoice when they see finances. Nothing
 * about other owners, and no receipts.
 */
export async function getOwnerFlightDetail(db: Db, actor: Actor, id: string, now = new Date()) {
  if (!actor.ownerIds.length) throw new NotFoundError("flight");
  const [mine] = await db
    .select({ ownerId: shares.ownerId })
    .from(flights)
    .innerJoin(shares, eq(shares.id, flights.shareId))
    .where(and(eq(flights.id, id), inArray(shares.ownerId, [...actor.ownerIds])));
  if (!mine) throw new NotFoundError("flight");
  authorize(actor, "fleet:read", { ownerIds: [mine.ownerId] });
  const flight = await getFlightUnchecked(db, id);
  const { plane, route, inAir } = await routeOf(db, actor, flight, now, true);
  const [report] = await db
    .select({
      status: flightReports.status,
      flightMinutes: flightReports.flightMinutes,
      invoiceId: flightReports.invoiceId,
      pilotName: user.name,
      pilotId: user.id,
      pilotImage: user.image,
    })
    .from(flightReports)
    .leftJoin(user, eq(user.id, flightReports.pilotUserId))
    .where(eq(flightReports.flightId, id));
  const money = financeOwnerIds(actor).includes(mine.ownerId);
  return {
    flight: { ...flight, model: plane?.model ?? "" },
    photoUrl: aircraftPhotoUrl(flight.aircraftId, plane?.photoFileId ?? null),
    route,
    inAir,
    pilotName: report?.pilotName ?? null,
    pilotId: report?.pilotId ?? null,
    pilotImage: report?.pilotImage ?? null,
    reportedMinutes: report?.status === "approved" ? report.flightMinutes : null,
    invoiceId: money && report?.status === "approved" ? report.invoiceId : null,
  };
}
