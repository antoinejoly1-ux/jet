import { Download, Plane } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatHours, formatMoney } from "@/lib/format";
import type { getInvoiceDetail } from "@/lib/services/billing";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

const TONE = { issued: "accent", paid: "success", void: "neutral" } as const;

/**
 * A generated invoice as the owner (or the team) reads it: who issues it,
 * the flight it bills, each line, the taxes, and the PDF.
 */
export async function InvoiceDetail({
  detail,
  locale,
}: {
  detail: Awaited<ReturnType<typeof getInvoiceDetail>>;
  locale: string;
}) {
  const t = await getTranslations("invoiceDetail");
  const ti = await getTranslations("invoices");
  const tr = await getTranslations("rates");
  const tp = await getTranslations("pilot.form");
  const format = await getFormatter();
  const { invoice, lines, report } = detail;
  const cad = (c: number) => formatMoney(c, invoice.currency, locale);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "long" });
  const issuer = invoice.issuer;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={TONE[invoice.status]}>{ti(`statuses.${invoice.status}`)}</Badge>
        <span className="text-muted text-sm">
          {t("issuedOn", { date: day(invoice.issuedOn) })}
          {invoice.dueOn && invoice.status === "issued" ? ` · ${t("dueOn", { date: day(invoice.dueOn) })}` : ""}
        </span>
        <Button asChild size="sm" variant="secondary" className="ml-auto">
          <a href={`/invoices/${invoice.id}/pdf`}>
            <Download aria-hidden />
            {t("downloadPdf")}
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="border-border bg-surface rounded-lg border p-6">
          <p className="eyebrow mb-2">{t("from")}</p>
          <p className="font-medium">{issuer?.legalName}</p>
          {issuer?.address ? <p className="text-muted mt-1 text-sm whitespace-pre-line">{issuer.address}</p> : null}
          <p className="text-muted mt-2 text-xs">
            {issuer?.gstNumber ? `${t("gst")} ${issuer.gstNumber}` : t("notRegistered")}
            {issuer?.qstNumber ? ` · ${t("qst")} ${issuer.qstNumber}` : ""}
          </p>
        </section>
        <section className="border-border bg-surface rounded-lg border p-6">
          <p className="eyebrow mb-2">{t("to")}</p>
          <p className="font-medium">{detail.ownerName}</p>
          <p className="text-muted mt-1 text-sm">
            {detail.registration} · {detail.model}
          </p>
          {report ? (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <Plane className="text-muted size-4" aria-hidden />
              {report.fromAirport} → {report.toAirport} ·{" "}
              {format.dateTime(report.departsAt, { dateStyle: "medium", timeZone: OPERATOR_TIME_ZONE })} ·{" "}
              {formatHours(report.flightMinutes, locale)}
            </p>
          ) : null}
        </section>
      </div>

      <section className="border-border bg-surface rounded-lg border">
        <ul className="divide-border divide-y">
          {lines.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-4 px-6 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {l.kind === "hours" ? tr(`parts.${l.part}`) : tp(`categories.${l.part}`)}
                  {l.kind === "expense" ? <span className="text-muted font-normal"> · {t("atCost")}</span> : null}
                </p>
                <p className="text-muted text-xs">
                  {l.kind === "hours" && l.minutes != null && l.unitCents != null
                    ? `${formatHours(l.minutes, locale)} × ${cad(l.unitCents)} ${tr("perHourShort")}`
                    : (l.description ?? "")}
                </p>
              </div>
              <span className="tabular text-sm">{cad(l.amountCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="border-border flex flex-col gap-2 border-t px-6 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t("subtotal")}</dt>
            <dd className="tabular">{cad(invoice.subtotalCents ?? invoice.totalCents)}</dd>
          </div>
          {invoice.gstCents ? (
            <div className="flex justify-between">
              <dt className="text-muted">{t("gstLine")}</dt>
              <dd className="tabular">{cad(invoice.gstCents)}</dd>
            </div>
          ) : null}
          {invoice.qstCents ? (
            <div className="flex justify-between">
              <dt className="text-muted">{t("qstLine")}</dt>
              <dd className="tabular">{cad(invoice.qstCents)}</dd>
            </div>
          ) : null}
          <div className="border-border mt-1 flex justify-between border-t pt-3 text-base">
            <dt className="font-medium">{t("total")}</dt>
            <dd className="tabular font-semibold">{cad(invoice.totalCents)}</dd>
          </div>
        </dl>
      </section>
      {issuer?.paymentInstructions ? (
        <p className="text-muted text-sm whitespace-pre-line">
          <span className="text-text font-medium">{t("howToPay")}</span> {issuer.paymentInstructions}
        </p>
      ) : null}
      {invoice.status === "void" && invoice.voidReason ? (
        <p className="text-muted text-sm">{t("voided", { reason: invoice.voidReason })}</p>
      ) : null}
    </div>
  );
}
