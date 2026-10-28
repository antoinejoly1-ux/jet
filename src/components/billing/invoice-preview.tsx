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
}: {
  draft: Awaited<ReturnType<typeof previewInvoice>>;
  locale: string;
  issue: ((prev: FormState, data: FormData) => Promise<FormState>) | null;
}) {
  const t = await getTranslations("invoiceDetail");
  const tr = await getTranslations("rates");
  const tp = await getTranslations("pilot.form");
  const cad = (c: number) => formatMoney(c, "CAD", locale);
  const company = draft.company!;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">
        {t("previewFrom", { company: company.legalName, owner: draft.ownerName ?? "—" })}
      </p>
      <ul className="divide-border divide-y text-sm">
        {draft.lines.map((l, i) => (
          <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
            <span className="text-muted">
              {l.kind === "hours" ? tr(`parts.${l.part}`) : `${tp(`categories.${l.part}`)} · ${t("atCost")}`}
              {l.kind === "hours" && l.minutes != null ? (
                <span className="text-muted/70 ml-2 text-xs">
                  {formatHours(l.minutes, locale)} × {cad(l.unitCents ?? 0)}
                </span>
              ) : null}
            </span>
            <span className="tabular">{cad(l.amountCents)}</span>
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
      {!draft.rate ? <p className="text-warning text-sm">{t("needsRate")}</p> : null}
      {issue && draft.rate ? <IssueInvoiceButton action={issue} /> : null}
    </div>
  );
}
