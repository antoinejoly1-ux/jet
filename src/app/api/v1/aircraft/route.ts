import { api } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { listAircraft } from "@/lib/services/aircraft";

/** The fleet with share totals. Scope: fleet:read. */
export const GET = api(({ actor }) => listAircraft(db, actor));
