/**
 * Airport lookup by ICAO code, from the OurAirports extract in
 * data/airports.json (see scripts/airports/build.ts). Server only: the list
 * is about 330 KB and never ships to browsers.
 */
import "server-only";
import data from "./data/airports.json";
import { distanceKm } from "./geo";

export type Airport = { icao: string; name: string; city: string; lat: number; lon: number };

let byCode: Map<string, Airport> | null = null;

function index() {
  byCode ??= new Map(
    (data as [string, string, string, number, number][]).map(([icao, name, city, lat, lon]) => [
      icao,
      { icao, name, city, lat, lon },
    ]),
  );
  return byCode;
}

export function airport(code: string | null | undefined): Airport | null {
  if (!code) return null;
  return index().get(code.trim().toUpperCase()) ?? null;
}

/** The closest airport within `maxKm` of a point, e.g. where a parked aircraft is. */
export function nearestAirport(lat: number, lon: number, maxKm = 6): Airport | null {
  let best: Airport | null = null;
  let bestKm = maxKm;
  for (const a of index().values()) {
    // Cheap box test first: a degree of latitude is about 111 km.
    if (Math.abs(a.lat - lat) > maxKm / 100 || Math.abs(a.lon - lon) > maxKm / 50) continue;
    const km = distanceKm(lat, lon, a.lat, a.lon);
    if (km <= bestKm) {
      best = a;
      bestKm = km;
    }
  }
  return best;
}
