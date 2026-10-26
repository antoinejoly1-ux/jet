import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { transactionsCsv } from "@/lib/exports";
import { orNotFound } from "@/lib/route-errors";
import { listTransactions } from "@/lib/services/ledger";

/** The ledger as filtered on screen. */
export async function GET(request: NextRequest) {
  const viewer = await requireStaff();
  const sp = request.nextUrl.searchParams;
  const year = Number(sp.get("year")) || undefined;
  return orNotFound(async () => {
    const rows = await listTransactions(db, viewer, {
      shareId: sp.get("share") || undefined,
      year,
      kind: sp.get("kind") || undefined,
    });
    return csvResponse(await transactionsCsv(rows, { withOwner: true }), `transactions${year ? `-${year}` : ""}.csv`);
  });
}
