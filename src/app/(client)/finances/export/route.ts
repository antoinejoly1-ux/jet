import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { transactionsCsv } from "@/lib/exports";
import { orNotFound, yearParam } from "@/lib/route-errors";
import { listOwnerTransactions } from "@/lib/services/statements";

export async function GET(request: NextRequest) {
  const viewer = await requireAccess();
  const year = yearParam(request.nextUrl.searchParams.get("year"));
  return orNotFound(async () =>
    csvResponse(await transactionsCsv(await listOwnerTransactions(db, viewer, year)), `transactions-${year}.csv`),
  );
}
