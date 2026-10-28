import { ChevronLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ReviewForms } from "@/components/billing/review-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { NotFoundError } from "@/lib/services/errors";
import { getReportForReview } from "@/lib/services/flight-reports";
import { OPERATOR_TIME_ZONE } from "@/lib/time";
import { approveReportAction, issueInvoiceAction, returnReportAction } from "../actions";
import { InvoicePreview } from "@/components/billing/invoice-preview";
import { Button } from "@/components/ui/button";
import { canIssueInvoicesFor } from "@/lib/auth/policy";
import { previewInvoice } from "@/lib/services/billing";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("flightReports"))("detailTitle") };
}

const TONE = { submitted: "accent", returned: "warning", approved: "success" } as const;

/** One flight report: what the pilot declared, the receipts, and what it comes to at the aircraft's rate. */
export default async function FlightReportPage({ params }: PageProps<"/admin/flight-reports/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const t = await getTranslations("flightReports");
  const tr = await getTranslations("rates");
  const tp = await getTranslations("pilot.form");
  const format = await getFormatter();
  const { report, expenses, rate, charges, shareOptions } = await getReportForReview(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  const cad = (c: number) => formatMoney(c, "CAD", viewer.locale);
  // Once approved, the invoice it becomes (or the one it became).
  const draft =
    report.status === "approved" && !report.invoiceId
      ? await previewInvoice(db, viewer, report.id).catch(() => null)
      : null;
  const expensesTotal = expenses.reduce((s, e) => s + e.amountCents, 0);
  const pct = (bp: number) => format.number(bp / 10000, { style: "percent", maximumFractionDigits: 2 });

  return (
    <>
      <Link
        href="/admin/flight-reports"
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("title")}
      </Link>
      <PageHeader
        eyebrow={
          <>
            {report.registration} <Badge tone={TONE[report.status]}>{t(`statuses.${report.status}`)}</Badge>
          </>
        }
        title={`${report.fromAirport} → ${report.toAirport}`}
        description={t("filedBy", {
          pilot: report.pilotName ?? t("unknownPilot"),
          date: format.dateTime(report.departsAt, {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: OPERATOR_TIME_ZONE,
          }),
        })}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardTitle className="mb-4">{t("declared")}</CardTitle>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-muted text-xs">{tp("flightTime")}</dt>
                <dd className="tabular mt-1 text-2xl font-light">{formatHours(report.flightMinutes, viewer.locale)}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">{tp("fuelLitres")}</dt>
                <dd className="tabular mt-1 text-2xl font-light">{report.fuelLitres ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">{t("expensesLabel")}</dt>
                <dd className="tabular mt-1 text-2xl font-light">{cad(expensesTotal)}</dd>
              </div>
            </dl>
            {report.notes ? <p className="text-muted mt-5 text-sm whitespace-pre-line">{report.notes}</p> : null}
            {report.reviewNote ? (
              <p className="text-warning mt-4 text-sm">
                {t("lastNote")} {report.reviewNote}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardTitle className="mb-4">{t("expensesLabel")}</CardTitle>
            {expenses.length === 0 ? (
              <p className="text-muted text-sm">{t("noExpenses")}</p>
            ) : (
              <ul className="divide-border divide-y">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    {e.receiptFileId ? (
                      <a
                        href={`/files/${e.receiptFileId}?inline=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="border-border bg-surface-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border"
                        aria-label={t("openReceipt", { category: tp(`categories.${e.category}`) })}
                      >
                        {e.receiptType?.startsWith("image/") ? (
                          // A signed, short-lived link: next/image can't optimise it.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/files/${e.receiptFileId}?inline=1`} alt="" className="size-full object-cover" />
                        ) : (
                          <FileText className="text-muted size-5" aria-hidden />
                        )}
                      </a>
                    ) : (
                      <span className="border-border text-muted flex size-14 shrink-0 items-center justify-center rounded-[10px] border border-dashed text-[10px]">
                        {t("noReceipt")}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{tp(`categories.${e.category}`)}</p>
                      <p className="text-muted text-sm">
                        {tp(`payers.${e.paidBy}`)}
                        {e.note ? ` · ${e.note}` : ""}
                      </p>
                    </div>
                    <span className="tabular font-medium">{cad(e.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-1">{t("chargesTitle")}</CardTitle>
            <p className="text-muted mb-4 text-sm">{t("chargesBody")}</p>
            {charges && rate ? (
              <dl className="divide-border divide-y text-sm">
                {charges.lines.map((l) => (
                  <div key={l.part} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-muted">
                      {tr(`parts.${l.part}`)} · {cad(l.perHourCents)} {tr("perHourShort")}
                    </dt>
                    <dd className="tabular">{cad(l.cents)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">{t("expensesAtCost")}</dt>
                  <dd className="tabular">{cad(expensesTotal)}</dd>
                </div>
                <div className="flex justify-between gap-4 pt-3 text-base">
                  <dt className="font-medium">{t("beforeTaxes")}</dt>
                  <dd className="tabular font-semibold">{cad(charges.totalCents + expensesTotal)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-warning text-sm">
                {t("noRate")}{" "}
                <Link href={`/admin/aircraft/${report.aircraftId}#rate`} className="underline underline-offset-4">
                  {t("setRate")}
                </Link>
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="h-fit">
            <CardTitle className="mb-4">{t("decision")}</CardTitle>
            {report.status === "submitted" && can(viewer, "finance:write") ? (
              <ReviewForms
                approve={approveReportAction.bind(null, report.id)}
                sendBack={returnReportAction.bind(null, report.id)}
                shareId={report.shareId}
                shares={shareOptions.map((s) => ({ id: s.id, label: `${s.ownerName} · ${pct(s.percentageBp)}` }))}
              />
            ) : (
              <p className="text-muted text-sm">
                {report.status === "approved"
                  ? t("approvedFor", { owner: report.ownerName ?? "—" })
                  : report.status === "returned"
                    ? t("returnedToPilot")
                    : t("readOnly")}
              </p>
            )}
          </Card>
          {report.invoiceId ? (
            <Card className="h-fit">
              <CardTitle className="mb-3">{t("invoiceTitle")}</CardTitle>
              <Button asChild variant="secondary">
                <Link href={`/admin/invoices/${report.invoiceId}`}>{t("openInvoice")}</Link>
              </Button>
            </Card>
          ) : report.status === "approved" ? (
            <Card className="h-fit">
              <CardTitle className="mb-3">{t("invoiceTitle")}</CardTitle>
              {draft ? (
                <InvoicePreview
                  draft={draft}
                  locale={viewer.locale}
                  issue={
                    draft.company && canIssueInvoicesFor(viewer, draft.company.id)
                      ? issueInvoiceAction.bind(null, report.id)
                      : null
                  }
                />
              ) : (
                <p className="text-warning text-sm">
                  {t("noCompany")}{" "}
                  <Link href={`/admin/aircraft/${report.aircraftId}/edit`} className="underline underline-offset-4">
                    {t("setCompany")}
                  </Link>
                </p>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
