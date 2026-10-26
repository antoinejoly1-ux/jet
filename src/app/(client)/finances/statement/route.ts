import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { pdfResponse, statementPdf } from "@/lib/exports";
import { orNotFound, yearParam } from "@/lib/route-errors";
import { getAnnualStatement } from "@/lib/services/statements";

/** The owner's yearly statement for one share, as a PDF. */
export async function GET(request: NextRequest) {
  const viewer = await requireAccess();
  const sp = request.nextUrl.searchParams;
  const year = yearParam(sp.get("year"));
  return orNotFound(async () => {
    const statement = await getAnnualStatement(db, viewer, sp.get("share") ?? "", year, { ownerView: true });
    return pdfResponse(await statementPdf(statement), `statement-${year}-${statement.share.registration}.pdf`);
  });
}
