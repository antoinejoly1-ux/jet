import { ChevronRight, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { listManagedInvoices, listToInvoice } from "@/lib/services/billing";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("billing") };
}

const TONE = { issued: "accent", paid: "success", void: "neutral" } as const;

/**
 * For the people who run a holding company's books: flights approved by
 * Univair, ready to invoice, and the invoices already issued.
 */
export default async function BillingPage() {
  const viewer = await requireAccess();
  if (!viewer.managedCompanyIds?.length) redirect("/");
  const t = await getTranslations("billing");
  const ti = await getTranslations("invoices");
  const format = await getFormatter();
  const locale = await getLocale();
  const [toInvoice, issued] = await Promise.all([listToInvoice(db, viewer), listManagedInvoices(db, viewer)]);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeZone: OPERATOR_TIME_ZONE });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={viewer.managedCompanyIds.map((id) => (
          <Button key={id} asChild size="sm" variant="secondary">
            <Link href={`/results/${id}`}>{t("results")}</Link>
          </Button>
        ))}
      />
      <section aria-labelledby="to-invoice" className="flex flex-col gap-3">
        <h2 id="to-invoice" className="eyebrow">
          {t("toInvoice", { count: toInvoice.length })}
        </h2>
        {toInvoice.length === 0 ? (
          <EmptyState icon={Receipt} title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {toInvoice.map((r) => (
              <li key={r.id}>
                <Link href={`/billing/${r.id}`} className="hover:bg-surface-muted flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.registration} · {r.fromAirport} → {r.toAirport}
                    </p>
                    <p className="text-muted text-sm">
                      {when(r.departsAt)} · {formatHours(r.flightMinutes, locale)} · {r.ownerName ?? "—"}
                    </p>
                  </div>
                  <span className="text-accent flex items-center gap-1 text-sm font-medium">
                    {t("prepare")}
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {issued.length ? (
        <section aria-labelledby="issued" className="mt-12 flex flex-col gap-3">
          <h2 id="issued" className="eyebrow">
            {t("issued")}
          </h2>
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {issued.map((i) => (
              <li key={i.id}>
                <Link href={`/invoices/${i.id}`} className="hover:bg-surface-muted flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.number}</p>
                    <p className="text-muted text-sm">
                      {i.ownerName} · {i.registration} · {day(i.issuedOn)}
                    </p>
                  </div>
                  <span className="tabular text-sm font-semibold">{formatMoney(i.totalCents, "CAD", locale)}</span>
                  <Badge tone={TONE[i.status]}>{ti(`statuses.${i.status}`)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
