import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { pdfResponse, statementPdf } from "@/lib/exports";
import { orNotFound, yearParam } from "@/lib/route-errors";
import { getAnnualStatement } from "@/lib/services/statements";

/** Any share's yearly statement, for the team (drafts included, marked as planned). */
export async function GET(request: NextRequest) {
  const viewer = await requireStaff();
  const sp = request.nextUrl.searchParams;
  const year = yearParam(sp.get("year"));
  return orNotFound(async () => {
    const statement = await getAnnualStatement(db, viewer, sp.get("share") ?? "", year, { ownerView: false });
    return pdfResponse(
      await statementPdf(statement),
      `statement-${year}-${statement.share.registration}-${statement.share.ownerName}.pdf`,
    );
  });
}
