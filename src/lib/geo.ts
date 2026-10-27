/** Great-circle helpers for the live map. Pure functions, shared by server and browser. */

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type LatLon = { lat: number; lon: number };

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial course from a to b, in degrees clockwise from true north (0–360). */
export function bearing(a: LatLon, b: LatLon) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point a fraction `f` (0–1) of the way along the great circle from a to b. */
export function interpolate(a: LatLon, b: LatLon, f: number): LatLon {
  const d = distanceKm(a.lat, a.lon, b.lat, b.lon) / R_KM;
  if (d === 0) return { ...a };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(rad(a.lat)) * Math.cos(rad(a.lon)) + B * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon));
  const y = A * Math.cos(rad(a.lat)) * Math.sin(rad(a.lon)) + B * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon));
  const z = A * Math.sin(rad(a.lat)) + B * Math.sin(rad(b.lat));
  return { lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: deg(Math.atan2(y, x)) };
}

/** Points along the great circle from a to b, for drawing the route arc. */
export function arc(a: LatLon, b: LatLon, steps = 64): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = interpolate(a, b, i / steps);
    return [p.lon, p.lat];
  });
}

/** Where an aircraft is after flying `seconds` at `knots` on `headingDeg` from p (dead reckoning). */
export function project(p: LatLon, headingDeg: number, knots: number, seconds: number): LatLon {
  const d = (knots * 1.852 * (seconds / 3600)) / R_KM;
  const h = rad(headingDeg);
  const lat = Math.asin(Math.sin(rad(p.lat)) * Math.cos(d) + Math.cos(rad(p.lat)) * Math.sin(d) * Math.cos(h));
  const lon =
    rad(p.lon) +
    Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(rad(p.lat)), Math.cos(d) - Math.sin(rad(p.lat)) * Math.sin(lat));
  return { lat: deg(lat), lon: ((deg(lon) + 540) % 360) - 180 };
}
