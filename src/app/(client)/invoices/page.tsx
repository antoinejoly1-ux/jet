import { Download, Eye, FileText } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { listOwnerInvoices } from "@/lib/services/invoices";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("invoices") };
}

const TONE = { issued: "accent", paid: "success", void: "neutral" } as const;

export default async function OwnerInvoicesPage() {
  const viewer = await requireAccess();
  const t = await getTranslations("ownerInvoices");
  const ti = await getTranslations("invoices");
  const locale = await getLocale();
  const format = await getFormatter();
  const rows = await listOwnerInvoices(db, viewer);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });

  // Grouped by year, newest first.
  const years = [...new Set(rows.map((r) => r.issuedOn.slice(0, 4)))];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={rows.length ? <DownloadLink href="/invoices/export">{t("exportCsv")}</DownloadLink> : null}
      />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className="flex flex-col gap-8">
          {years.map((year) => (
            <section key={year} aria-labelledby={`y-${year}`}>
              <h2 id={`y-${year}`} className="text-muted mb-2 text-sm font-semibold">
                {year}
              </h2>
              <ul className="bg-surface shadow-card divide-border divide-y rounded-lg border border-(--card-border)">
                {rows
                  .filter((r) => r.issuedOn.startsWith(year))
                  .map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold whitespace-nowrap">{r.number}</p>
                          <p className="text-muted text-sm">
                            {r.registration} · {day(r.issuedOn)}
                            {r.dueOn && r.status === "issued" ? ` · ${t("due", { date: day(r.dueOn) })}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`tabular font-semibold whitespace-nowrap ${r.status === "void" ? "text-muted line-through" : ""}`}
                          >
                            {formatMoney(r.totalCents, r.currency, locale)}
                          </span>
                          <Badge tone={TONE[r.status]}>{ti(`statuses.${r.status}`)}</Badge>
                        </div>
                      </div>
                      {r.fileId ? (
                        <div className="-ml-3 flex gap-1 sm:ml-0">
                          <Button asChild size="sm" variant="ghost">
                            <a
                              href={`/files/${r.fileId}?inline=1`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t("viewNumber", { number: r.number })}
                            >
                              <Eye aria-hidden />
                              {t("view")}
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <a href={`/files/${r.fileId}`} aria-label={t("downloadNumber", { number: r.number })}>
                              <Download aria-hidden />
                              {t("download")}
                            </a>
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
