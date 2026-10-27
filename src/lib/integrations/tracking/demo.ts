/**
 * A stand-in for a real tracker in development and demos: each aircraft flies
 * the leg our own schedule says is under way, along the great circle, and is
 * otherwise parked at home. No network.
 */
import { bearing, interpolate } from "@/lib/geo";
import type { LivePosition, TrackingProvider } from "./types";

const CRUISE_FT = 26_000;
const CRUISE_KT = 280;

/** Climb over the first 12% of the flight, descend over the last 15%. */
export function altitudeAt(f: number) {
  if (f < 0.12) return Math.round((CRUISE_FT * f) / 0.12);
  if (f > 0.85) return Math.round((CRUISE_FT * (1 - f)) / 0.15);
  return CRUISE_FT;
}

export const demoProvider: TrackingProvider = {
  name: "demo",
  async positions(targets, { now, legs, homes }) {
    const out = new Map<string, LivePosition>();
    for (const t of targets) {
      const leg = legs.get(t.aircraftId);
      const span = leg ? leg.arrivesAt.getTime() - leg.departsAt.getTime() : 0;
      const f = leg && span > 0 ? (now.getTime() - leg.departsAt.getTime()) / span : -1;
      if (leg && f >= 0 && f < 1) {
        const here = interpolate(leg.from, leg.to, f);
        const ahead = interpolate(leg.from, leg.to, Math.min(1, f + 0.01));
        const slow = f < 0.12 || f > 0.85;
        out.set(t.aircraftId, {
          ...here,
          altitudeFt: altitudeAt(f),
          groundSpeedKt: slow ? Math.round(CRUISE_KT * 0.7) : CRUISE_KT,
          headingDeg: Math.round(bearing(here, ahead)),
          onGround: false,
          seenAt: now,
          callsign: t.registration.replace(/-/g, ""),
          origin: leg.from.icao,
          destination: leg.to.icao,
          eta: leg.arrivesAt,
        });
        continue;
      }
      const home = homes.get(t.aircraftId);
      if (home)
        out.set(t.aircraftId, {
          ...home,
          altitudeFt: 0,
          groundSpeedKt: 0,
          headingDeg: null,
          onGround: true,
          seenAt: now,
          callsign: null,
          origin: null,
          destination: null,
          eta: null,
        });
    }
    return out;
  },
};
