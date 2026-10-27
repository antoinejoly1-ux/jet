import { api, jsonBody } from "@/lib/api/handler";
import { apiCompleteBody, toCompleteInput } from "@/lib/api/schemas";
import { db } from "@/lib/db";
import { completeFlight } from "@/lib/services/flights";

/** Completes a flight with its block time; deducts the hours. Scope: operations:write. */
export const POST = api(async ({ actor, request, params }) =>
  completeFlight(db, actor, params.id!, toCompleteInput(apiCompleteBody.parse(await jsonBody(request)))),
);
