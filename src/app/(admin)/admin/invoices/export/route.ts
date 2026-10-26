import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { invoicesCsv } from "@/lib/exports";
import { orNotFound } from "@/lib/route-errors";
import { listInvoices } from "@/lib/services/invoices";

/** Invoices as filtered on screen. */
export async function GET(request: NextRequest) {
  const viewer = await requireStaff();
  const sp = request.nextUrl.searchParams;
  return orNotFound(async () => {
    const rows = await listInvoices(db, viewer, {
      status: sp.get("status") ?? undefined,
      year: Number(sp.get("year")) || undefined,
      q: sp.get("q") ?? undefined,
    });
    return csvResponse(await invoicesCsv(rows, { withOwner: true }), "invoices.csv");
  });
}
