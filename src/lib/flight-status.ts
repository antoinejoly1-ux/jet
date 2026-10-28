/**
 * What a flight's status means right now, for display. The database knows
 * scheduled / completed / cancelled; the team also needs to see a scheduled
 * flight that has taken off (« En vol ») and one that has landed but still
 * waits for its flight time (« À clôturer »). One rule, used everywhere a
 * flight shows its status, so the map, the lists and the detail page agree.
 */

export type FlightStatus = "scheduled" | "completed" | "cancelled";
export type FlightDisplayStatus = FlightStatus | "in_flight" | "to_close";

/** Without an arrival time, a flight counts as landed two hours after departure (as on the live map). */
export const DEFAULT_FLIGHT_MS = 2 * 3_600_000;

export function flightDisplayStatus(
  f: { status: FlightStatus; departsAt: Date; arrivesAt: Date | null },
  now: Date = new Date(),
): FlightDisplayStatus {
  if (f.status !== "scheduled" || f.departsAt > now) return f.status;
  const lands = f.arrivesAt ?? new Date(f.departsAt.getTime() + DEFAULT_FLIGHT_MS);
  return lands > now ? "in_flight" : "to_close";
}

export const FLIGHT_STATUS_TONE = {
  scheduled: "accent",
  in_flight: "accent",
  to_close: "warning",
  completed: "success",
  cancelled: "neutral",
} as const satisfies Record<FlightDisplayStatus, string>;
