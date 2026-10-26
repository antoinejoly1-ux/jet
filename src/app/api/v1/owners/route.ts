import { api, query } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { listOwners } from "@/lib/services/owners";

/** Owners, optionally filtered by name, email or registration (?q=). Scope: owners:read. */
export const GET = api(({ actor, request }) => listOwners(db, actor, { q: query(request, "q") }));
