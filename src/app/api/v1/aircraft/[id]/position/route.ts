import { api } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { getAircraftLive } from "@/lib/services/tracking";

/** Where the aircraft is now: position, state and current leg. Scope: fleet:read. */
export const GET = api(({ actor, params }) => getAircraftLive(db, actor, params.id!));
