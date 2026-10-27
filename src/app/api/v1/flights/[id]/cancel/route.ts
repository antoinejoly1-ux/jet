import { api, jsonBody } from "@/lib/api/handler";
import { apiCancelBody } from "@/lib/api/schemas";
import { db } from "@/lib/db";
import { cancelFlight } from "@/lib/services/flights";

/** Cancels a flight; a completed flight's hours are given back. Scope: operations:write. */
export const POST = api(async ({ actor, request, params }) => {
  const body = apiCancelBody.parse(await jsonBody(request).catch(() => ({})));
  return cancelFlight(db, actor, params.id!, body.reason ?? "");
});
