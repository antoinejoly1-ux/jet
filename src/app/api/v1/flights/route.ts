import { z } from "zod";
import { api, jsonBody, query } from "@/lib/api/handler";
import { apiFlightBody, toFlightInput } from "@/lib/api/schemas";
import { db } from "@/lib/db";
import { listFlights, scheduleFlight } from "@/lib/services/flights";

const DAY = 86_400_000;
const range = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  aircraftId: z.uuid().optional(),
  status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
});

/** Flights departing in [from, to) (default: the last 30 days to 90 days ahead). Scope: fleet:read. */
export const GET = api(({ actor, request }) => {
  const q = range.parse({
    from: query(request, "from"),
    to: query(request, "to"),
    aircraftId: query(request, "aircraftId"),
    status: query(request, "status"),
  });
  const now = Date.now();
  return listFlights(db, actor, {
    from: new Date(q.from ?? now - 30 * DAY),
    to: new Date(q.to ?? now + 90 * DAY),
    aircraftId: q.aircraftId,
    status: q.status,
  });
});

/** Schedules a flight. Scope: operations:write. */
export const POST = api(async ({ actor, request }) =>
  scheduleFlight(db, actor, toFlightInput(apiFlightBody.parse(await jsonBody(request)))),
);
