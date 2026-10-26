import { api, query } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { listInvoices } from "@/lib/services/invoices";

/** Invoices (?status=issued|paid|void, ?year=, ?q=). Scope: finance:read. */
export const GET = api(({ actor, request }) =>
  listInvoices(db, actor, {
    status: query(request, "status"),
    year: Number(query(request, "year")) || undefined,
    q: query(request, "q"),
  }),
);
