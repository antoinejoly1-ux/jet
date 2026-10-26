import "server-only";
import { getFormatter } from "next-intl/server";
import type { Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { listAircraft } from "@/lib/services/aircraft";
import { listFlightShareOptions } from "@/lib/services/flights";

/** Aircraft and their active shares, for the flight form. */
export async function flightFormOptions(viewer: Actor) {
  const format = await getFormatter();
  const [fleet, shares] = await Promise.all([listAircraft(db, viewer), listFlightShareOptions(db, viewer)]);
  return {
    aircraft: fleet
      .filter((a) => a.status !== "inactive")
      .map((a) => ({ id: a.id, label: `${a.registration} · ${a.model}` })),
    shares: shares.map((s) => ({
      id: s.id,
      aircraftId: s.aircraftId,
      label: `${s.ownerName} (${format.number(s.percentageBp / 10000, { style: "percent", maximumFractionDigits: 2 })})`,
    })),
  };
}
