import { api } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { listFlightShareOptions } from "@/lib/services/flights";

/** Active shares (who owns how much of which aircraft). Scope: fleet:read. */
export const GET = api(({ actor }) => listFlightShareOptions(db, actor));
