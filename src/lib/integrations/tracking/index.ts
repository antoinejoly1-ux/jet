import "server-only";
import { env } from "@/lib/env";
import { demoProvider } from "./demo";
import { flightAwareProvider } from "./flightaware";
import { openSkyProvider } from "./opensky";
import type { TrackingProvider } from "./types";

export type { LivePosition, ScheduledLeg, TrackingProvider, TrackingTarget } from "./types";

/**
 * The configured tracker. FlightAware when its key is set, else whatever
 * TRACKING_PROVIDER names: `opensky` (free, live) or `demo` (simulated).
 */
export function getTrackingProvider(): TrackingProvider {
  if (env.TRACKING_PROVIDER === "flightaware" && env.FLIGHTAWARE_API_KEY)
    return flightAwareProvider(env.FLIGHTAWARE_API_KEY);
  if (env.TRACKING_PROVIDER === "opensky") return openSkyProvider();
  return demoProvider;
}
