import { requireAccess } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { invoicesCsv } from "@/lib/exports";
import { orNotFound } from "@/lib/route-errors";
import { listOwnerInvoices } from "@/lib/services/invoices";

export async function GET() {
  const viewer = await requireAccess();
  return orNotFound(async () => csvResponse(await invoicesCsv(await listOwnerInvoices(db, viewer)), "invoices.csv"));
}
