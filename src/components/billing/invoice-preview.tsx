import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatHours, formatMoney } from "@/lib/format";
import type { previewInvoice } from "@/lib/services/billing";
import { IssueInvoiceButton } from "./issue-invoice-button";
import type { FormState } from "@/lib/forms";

/** The invoice a report would become, before it's issued: who issues it, each line, the taxes. */
export async function InvoicePreview({
  draft,
  locale,
  issue,
  showReceipts = false,
}: {
  draft: Awaited<ReturnType<typeof previewInvoice>>;
  locale: string;
  issue: ((prev: FormState, data: FormData) => Promise<FormState>) | null;
  /** The receipts behind the expense lines, for whoever issues it without the report page. */
  showReceipts?: boolean;
}) {
  const t = await getTranslations("invoiceDetail");
  const tr = await getTranslations("rates");
  const tp = await getTranslations("pilot.form");
  const cad = (c: number) => formatMoney(c, "CAD", locale);
  const company = draft.company!;
  const receipts = draft.expenses.filter((e) => e.receiptFileId);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">
        {t("previewFrom", { company: company.legalName, owner: draft.ownerName ?? "—" })}
      </p>
      <ul className="divide-border divide-y text-sm">
        {draft.lines.map((l, i) => (
          <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="text-muted min-w-0">
              {l.kind === "hours"
                ? tr(`parts.${l.part}`)
                : l.kind === "included"
                  ? t("fuelIncluded")
                  : `${tp(`categories.${l.part}`)} · ${t("atCost")}`}
              {l.kind === "hours" && l.minutes != null ? (
                <span className="text-muted/70 ml-2 text-xs">
                  {formatHours(l.minutes, locale)} × {cad(l.unitCents ?? 0)} {tr("perHourShort")}
                </span>
              ) : l.description ? (
                <span className="text-muted/70 ml-2 text-xs">{l.description}</span>
              ) : null}
            </span>
            <span className={l.kind === "included" ? "text-muted text-xs" : "tabular"}>
              {l.kind === "included" ? t("notBilled") : cad(l.amountCents)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="border-border flex flex-col gap-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{t("subtotal")}</dt>
          <dd className="tabular">{cad(draft.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{t("gstLine")}</dt>
          <dd className="tabular">{company.gstNumber ? cad(draft.gstCents) : t("notCharged")}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{t("qstLine")}</dt>
          <dd className="tabular">{company.qstNumber ? cad(draft.qstCents) : t("notCharged")}</dd>
        </div>
        <div className="mt-1 flex justify-between text-base">
          <dt className="font-medium">{t("total")}</dt>
          <dd className="tabular font-semibold">{cad(draft.totalCents)}</dd>
        </div>
      </dl>
      {!company.gstNumber && !company.qstNumber ? <p className="text-muted text-xs">{t("noTaxNumbers")}</p> : null}
      {showReceipts && receipts.length ? (
        <section aria-labelledby="preview-receipts" className="border-border border-t pt-4">
          <h3 id="preview-receipts" className="eyebrow mb-3">
            {t("receipts")}
          </h3>
          <ul className="flex flex-wrap gap-3">
            {receipts.map((e) => (
              <li key={e.id}>
                <a
                  href={`/files/${e.receiptFileId}?inline=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex w-24 flex-col gap-1.5 text-xs"
                >
                  <span className="border-border bg-surface-muted flex size-24 items-center justify-center overflow-hidden rounded-[10px] border">
                    {e.receiptType?.startsWith("image/") ? (
                      // A signed, short-lived link: next/image can't optimise it.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/files/${e.receiptFileId}?inline=1`} alt="" className="size-full object-cover" />
                    ) : (
                      <FileText className="text-muted size-6" aria-hidden />
                    )}
                  </span>
                  <span className="text-muted group-hover:text-text truncate">
                    {tp(`categories.${e.category}`)} · {formatMoney(e.amountCents, e.currency, locale)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!draft.rate ? <p className="text-warning text-sm">{t("needsRate")}</p> : null}
      {draft.needsFxRate ? <p className="text-warning text-sm">{t("needsFxRate")}</p> : null}
      {issue && draft.rate && !draft.needsFxRate ? (
        <IssueInvoiceButton action={issue} taxable={!!(company.gstNumber || company.qstNumber)} />
      ) : null}
    </div>
  );
}
