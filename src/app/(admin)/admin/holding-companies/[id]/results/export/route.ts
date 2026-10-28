import type { NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth/session";
import { centsToAmount, csvResponse, toCsv, type Cell } from "@/lib/csv";
import { db } from "@/lib/db";
import { lang } from "@/lib/locale";
import { orNotFound } from "@/lib/route-errors";
import { getCompanyPnl } from "@/lib/services/pnl";
import { zonedDay } from "@/lib/time";

/** The company's results for a year as a spreadsheet: one line per revenue and expense. */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/admin/holding-companies/[id]/results/export">,
) {
  const viewer = await requireStaff();
  const { id } = await params;
  const year = Number(request.nextUrl.searchParams.get("year")) || Number(zonedDay(new Date()).slice(0, 4));
  return orNotFound(async () => {
    const pnl = await getCompanyPnl(db, viewer, id, year);
    const t = await getTranslations("pnl");
    const rows: Cell[][] = [
      [t("section"), t("line"), t("amount")],
      ...pnl.revenue.map((r) => [t("revenue"), t(`revenueLines.${r.key}`), centsToAmount(r.cents)]),
      [t("revenue"), t("totalRevenue"), centsToAmount(pnl.revenueCents)],
      ...pnl.expenses.map((e) => [t("expenses"), t(`expenseLines.${e.key}`), centsToAmount(e.cents)]),
      [t("expenses"), t("totalExpenses"), centsToAmount(pnl.expensesCents)],
      [t("result"), t("result"), centsToAmount(pnl.resultCents)],
      [t("reservesTitle"), t("setAside", { year }), centsToAmount(pnl.reserves.setAsideCents)],
      [t("reservesTitle"), t("spent", { year }), centsToAmount(pnl.reserves.spentCents)],
      [t("reservesTitle"), t("balance"), centsToAmount(pnl.reserves.balanceCents)],
    ];
    return csvResponse(toCsv(rows, lang(await getLocale())), `${pnl.company.legalName}-${year}.csv`);
  });
}
