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

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Airports matching what someone typed: an ICAO code, a city or a name,
 * accents ignored ("montreal" finds Montréal). Best matches first; North
 * American airports (C…, K…) win ties, since that's where Univair flies.
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const code = q.toUpperCase();
  const scored: { a: Airport; score: number }[] = [];
  for (const a of index().values()) {
    const city = fold(a.city);
    const name = fold(a.name);
    const score =
      a.icao === code
        ? 0
        : a.icao.startsWith(code)
          ? 1
          : city.startsWith(q)
            ? 2
            : name.startsWith(q) || name.includes(` ${q}`)
              ? 3
              : city.includes(q) || name.includes(q)
                ? 4
                : -1;
    if (score < 0) continue;
    scored.push({ a, score: score + (/^[CK]/.test(a.icao) ? 0 : 0.5) });
  }
  return scored
    .sort((x, y) => x.score - y.score || x.a.icao.localeCompare(y.a.icao))
    .slice(0, limit)
    .map((s) => s.a);
}
