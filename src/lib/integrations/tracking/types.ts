/** What a tracking provider reports for one aircraft. Units are aviation's: feet, knots, degrees. */
export type LivePosition = {
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  /** Track over the ground, degrees clockwise from true north. */
  headingDeg: number | null;
  onGround: boolean;
  /** When the position was observed (not when we fetched it). */
  seenAt: Date;
  callsign: string | null;
  /** ICAO codes and estimated arrival, when the provider knows the filed route. */
  origin: string | null;
  destination: string | null;
  eta: Date | null;
};

export type TrackingTarget = {
  aircraftId: string;
  registration: string;
  /** ICAO 24-bit transponder address, lowercase hex. */
  icaoHex: string | null;
};

/** A flight our own schedule says is under way; the demo provider flies it. */
export type ScheduledLeg = {
  from: { icao: string; lat: number; lon: number };
  to: { icao: string; lat: number; lon: number };
  departsAt: Date;
  arrivesAt: Date;
};

export interface TrackingProvider {
  readonly name: "opensky" | "flightaware" | "demo";
  /** Positions by aircraft id; an aircraft with nothing to report is left out. */
  positions(
    targets: TrackingTarget[],
    context: { now: Date; legs: Map<string, ScheduledLeg>; homes: Map<string, { lat: number; lon: number }> },
  ): Promise<Map<string, LivePosition>>;
}
