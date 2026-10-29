/**
 * FlightAware AeroAPI (paid, per aircraft): positions plus the filed route and
 * estimated arrival. Enabled by FLIGHTAWARE_API_KEY once Univair's account is
 * shared. Two calls per airborne aircraft: its current flight, then its position.
 */
import type { LivePosition, TrackingProvider } from "./types";

const API = "https://aeroapi.flightaware.com/aeroapi";

type AeroFlight = {
  fa_flight_id: string;
  ident: string;
  actual_off: string | null;
  actual_on: string | null;
  estimated_on: string | null;
  origin: { code_icao: string | null } | null;
  destination: { code_icao: string | null } | null;
};
type AeroPosition = {
  last_position: {
    latitude: number;
    longitude: number;
    altitude: number;
    groundspeed: number;
    heading: number | null;
    timestamp: string;
  } | null;
};

/** The flight in the air now: took off and hasn't landed. */
export function currentFlight(body: { flights?: AeroFlight[] }): AeroFlight | null {
  return body.flights?.find((f) => f.actual_off && !f.actual_on) ?? null;
}

export function parseAeroPosition(flight: AeroFlight, body: AeroPosition): LivePosition | null {
  const p = body.last_position;
  if (!p) return null;
  return {
    lat: p.latitude,
    lon: p.longitude,
    // AeroAPI gives altitude in hundreds of feet.
    altitudeFt: p.altitude * 100,
    groundSpeedKt: p.groundspeed,
    headingDeg: p.heading,
    onGround: false,
    seenAt: new Date(p.timestamp),
    callsign: flight.ident,
    origin: flight.origin?.code_icao ?? null,
    destination: flight.destination?.code_icao ?? null,
    eta: flight.estimated_on ? new Date(flight.estimated_on) : null,
  };
}

export function flightAwareProvider(apiKey: string, fetchImpl: typeof fetch = fetch): TrackingProvider {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetchImpl(`${API}${path}`, {
      headers: { "x-apikey": apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`AeroAPI ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    name: "flightaware",
    async positions(targets) {
      const out = new Map<string, LivePosition>();
      await Promise.all(
        targets.map(async (t) => {
          const ident = t.registration.replace(/-/g, "");
          const flight = currentFlight(
            await get<{ flights?: AeroFlight[] }>(`/flights/${encodeURIComponent(ident)}?max_pages=1`),
          );
          if (!flight) return;
          const position = parseAeroPosition(
            flight,
            await get<AeroPosition>(`/flights/${encodeURIComponent(flight.fa_flight_id)}/position`),
          );
          if (position) out.set(t.aircraftId, position);
        }),
      );
      return out;
    },
  };
}
