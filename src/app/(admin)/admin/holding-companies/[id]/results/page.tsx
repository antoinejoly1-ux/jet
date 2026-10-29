import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CompanyExpenseForm } from "@/components/billing/company-expense-form";
import { PnlView } from "@/components/billing/pnl-view";
import { YearPicker } from "@/components/billing/year-picker";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { can, ForbiddenError } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { NotFoundError } from "@/lib/services/errors";
import { getCompanyPnl, listCompanyExpenses } from "@/lib/services/pnl";
import { zonedDay } from "@/lib/time";
import { addCompanyExpenseAction, reverseCompanyExpenseAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pnl"))("title") };
}

/** The company's results for a year, and what it paid outside the flights. */
export default async function CompanyResultsPage({
  params,
  searchParams,
}: PageProps<"/admin/holding-companies/[id]/results">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const thisYear = Number(zonedDay(new Date()).slice(0, 4));
  const year = Number(typeof sp.year === "string" ? sp.year : thisYear) || thisYear;
  const t = await getTranslations("pnl");
  const format = await getFormatter();
  const [pnl, expenses] = await Promise.all([
    getCompanyPnl(db, viewer, id, year),
    listCompanyExpenses(db, viewer, id, year),
  ]).catch((e) => (e instanceof NotFoundError || e instanceof ForbiddenError ? notFound() : Promise.reject(e)));
  const canWrite = can(viewer, "finance:write");
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });

  return (
    <>
      <Link
        href={`/admin/holding-companies/${id}`}
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {pnl.company.legalName}
      </Link>
      <PageHeader
        eyebrow={pnl.company.legalName}
        title={t("titleYear", { year })}
        description={t("subtitle")}
        actions={
          <>
            <YearPicker year={year} years={[thisYear, thisYear - 1, thisYear - 2]} />
            <DownloadLink href={`/admin/holding-companies/${id}/results/export?year=${year}`}>
              {t("exportCsv")}
            </DownloadLink>
          </>
        }
      />
      <PnlView pnl={pnl} locale={viewer.locale} />

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle className="mb-1">{t("companyExpenses")}</CardTitle>
          <p className="text-muted mb-4 text-sm">{t("companyExpensesBody")}</p>
          {expenses.length === 0 ? (
            <p className="text-muted text-sm">{t("noCompanyExpenses")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {expenses.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className={e.reversed || e.reversesId ? "text-muted text-sm line-through" : "text-sm font-medium"}
                    >
                      {t(`expenseLines.${e.category}`)}
                      {e.description ? ` · ${e.description}` : ""}
                    </p>
                    <p className="text-muted text-xs">
                      {day(e.occurredOn)}
                      {e.reversesId ? ` · ${t("reversal")}` : ""}
                    </p>
                  </div>
                  <span className="tabular text-sm">{formatMoney(e.amountCents, "CAD", viewer.locale)}</span>
                  {canWrite && !e.reversed && !e.reversesId ? (
                    <form action={reverseCompanyExpenseAction.bind(null, id, e.id)}>
                      <Button type="submit" size="sm" variant="ghost">
                        {t("reverse")}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canWrite ? (
          <Card>
            <CardTitle className="mb-4">{t("addExpenseTitle")}</CardTitle>
            <CompanyExpenseForm action={addCompanyExpenseAction.bind(null, id)} today={zonedDay(new Date())} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
