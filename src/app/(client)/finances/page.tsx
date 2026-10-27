import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getOwnerFinances } from "@/lib/services/budgets";
import { scenes } from "@/lib/imagery";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("finances") };
}

export default async function FinancesPage({ searchParams }: PageProps<"/finances">) {
  const viewer = await requireAccess();
  const t = await getTranslations("finances");
  const locale = await getLocale();
  const format = await getFormatter();
  const { year: yearParam } = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = Number(typeof yearParam === "string" ? yearParam : "") || thisYear;
  const shares = await getOwnerFinances(db, viewer, year);
  const money = (cents: number, currency: "CAD" | "USD" = "CAD") => formatMoney(cents, currency, locale);
  const monthName = (m: number) => format.dateTime(new Date(Date.UTC(year, m - 1, 15)), { month: "short" });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <DownloadLink href={`/finances/export?year=${year}`}>{t("exportCsv")}</DownloadLink>
            <nav aria-label={t("year")} className="border-border bg-surface-muted inline-flex rounded-md border p-0.5">
              {[thisYear - 2, thisYear - 1, thisYear].map((y) => (
                <Link
                  key={y}
                  href={`/finances?year=${y}`}
                  aria-current={y === year ? "page" : undefined}
                  className={cn(
                    "text-muted flex h-8 items-center rounded-[5px] px-3 text-sm font-semibold",
                    y === year && "bg-surface text-text shadow-sm",
                  )}
                >
                  {y}
                </Link>
              ))}
            </nav>
          </>
        }
      />
      {shares.length === 0 ? (
        <EmptyState icon={Wallet} image={scenes.cabinLifestyle} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className="flex flex-col gap-10">
          {shares.map((s) => {
            const maxMonth = Math.max(1, ...s.months.map((m) => m.costCents));
            const remaining = s.totals.plannedCents - s.totals.spentCents;
            return (
              <section key={s.shareId} aria-labelledby={`fin-${s.shareId}`} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`fin-${s.shareId}`} className="text-xl font-light tracking-tight">
                    {s.registration} <span className="text-muted font-medium">· {s.model}</span>
                  </h2>
                  <DownloadLink href={`/finances/statement?share=${s.shareId}&year=${year}`}>
                    {t("statementPdf", { year })}
                  </DownloadLink>
                </div>
                {!s.published ? <Alert>{t("notPublished", { year })}</Alert> : null}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardTitle>{t("planned")}</CardTitle>
                    <p className="tabular mt-1 text-3xl font-light tracking-tight">
                      {s.published ? money(s.totals.plannedCents, s.currency) : "—"}
                    </p>
                  </Card>
                  <Card>
                    <CardTitle>{t("spent")}</CardTitle>
                    <p className="tabular mt-1 text-3xl font-light tracking-tight">
                      {money(s.totals.spentCents, s.currency)}
                    </p>
                  </Card>
                  <Card>
                    <CardTitle>{t("remaining")}</CardTitle>
                    <p
                      className={cn(
                        "tabular mt-1 text-3xl font-light tracking-tight",
                        s.published && remaining < 0 && "text-danger",
                      )}
                    >
                      {s.published ? money(remaining, s.currency) : "—"}
                    </p>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardTitle className="mb-4">{t("byCategory")}</CardTitle>
                    <ul className="flex flex-col gap-4">
                      {s.rows
                        .filter((r) => r.plannedCents > 0 || r.spentCents !== 0)
                        .map((r) => {
                          const ratio = r.plannedCents > 0 ? r.spentCents / r.plannedCents : null;
                          const tone =
                            ratio === null
                              ? "bg-accent"
                              : ratio > 1
                                ? "bg-danger"
                                : ratio > 0.9
                                  ? "bg-warning"
                                  : "bg-accent";
                          return (
                            <li key={r.categoryId}>
                              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                                <span className="font-medium">{locale === "en" ? r.nameEn : r.nameFr}</span>
                                <span className="tabular text-muted">
                                  {money(r.spentCents, s.currency)}
                                  {s.published && r.plannedCents > 0 ? ` / ${money(r.plannedCents, s.currency)}` : ""}
                                </span>
                              </div>
                              <div
                                className="bg-surface-muted h-2 overflow-hidden rounded-full"
                                role="meter"
                                aria-label={locale === "en" ? r.nameEn : r.nameFr}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
                              >
                                <div
                                  className={`h-full rounded-full ${tone}`}
                                  style={{ width: `${ratio === null ? 100 : Math.min(100, ratio * 100)}%` }}
                                />
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  </Card>

                  <Card>
                    <div className="mb-4 flex items-baseline justify-between gap-3">
                      <CardTitle>{t("byMonth")}</CardTitle>
                      <span className="text-muted tabular text-xs">
                        {t("peak", { amount: money(maxMonth, s.currency) })}
                      </span>
                    </div>
                    {/* Bars for sighted users; the same numbers as a table for screen readers. */}
                    <div aria-hidden className="flex h-40 items-end gap-1.5">
                      {s.months.map((m) => (
                        <div key={m.month} className="flex h-full flex-1 flex-col justify-end gap-1">
                          <div
                            className="bg-accent/80 rounded-t-sm"
                            style={{ height: `${Math.max(0, (m.costCents / maxMonth) * 100)}%` }}
                            title={`${monthName(m.month)} · ${money(m.costCents, s.currency)}`}
                          />
                          <span className="text-muted text-center text-[10px]">{monthName(m.month).slice(0, 3)}</span>
                        </div>
                      ))}
                    </div>
                    <table className="sr-only">
                      <caption>{t("byMonth")}</caption>
                      <tbody>
                        {s.months.map((m) => (
                          <tr key={m.month}>
                            <th scope="row">{monthName(m.month)}</th>
                            <td>{money(m.costCents, s.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
