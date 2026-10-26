import { api, jsonBody, query } from "@/lib/api/handler";
import { apiTransactionBody, toTransactionInput } from "@/lib/api/schemas";
import { db } from "@/lib/db";
import { addTransaction, listTransactions } from "@/lib/services/ledger";

/** Ledger entries (?year=, ?shareId=, ?kind=cost|revenue|payment). Scope: finance:read. */
export const GET = api(({ actor, request }) =>
  listTransactions(db, actor, {
    year: Number(query(request, "year")) || undefined,
    shareId: query(request, "shareId"),
    kind: query(request, "kind"),
  }),
);

/** Adds a ledger entry (source "import"). Corrections are reversals, made in the portal. Scope: finance:write. */
export const POST = api(async ({ actor, request }) =>
  addTransaction(db, actor, toTransactionInput(apiTransactionBody.parse(await jsonBody(request))), "import"),
);
