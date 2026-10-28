import { ChevronRight, ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Person } from "@/components/ui/person";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { listToInvoice } from "@/lib/services/billing";
import { listReportsForReview } from "@/lib/services/flight-reports";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("flightReports") };
}

const TONE = { submitted: "accent", returned: "warning", approved: "success" } as const;

/** Flight reports from the pilots: those to check first, then the latest decided. */
export default async function FlightReportsPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("flightReports");
  if (!can(viewer, "finance:read"))
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={ClipboardCheck} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </>
    );
  const format = await getFormatter();
  const [{ waiting, decided }, toInvoice] = await Promise.all([
    listReportsForReview(db, viewer),
    listToInvoice(db, viewer),
  ]);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeZone: OPERATOR_TIME_ZONE });

  const Row = ({ r }: { r: (typeof waiting)[number] }) => (
    <li>
      <Link
        href={`/admin/flight-reports/${r.id}`}
        className="hover:bg-surface-muted flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {r.registration} · {r.fromAirport} → {r.toAirport}
          </p>
          <p className="text-muted text-sm">
            {when(r.departsAt)} · {r.pilotName ? <Person name={r.pilotName} image={r.pilotImage} /> : t("unknownPilot")}{" "}
            · {r.ownerName ?? t("noOwner")}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="tabular">{formatHours(r.flightMinutes, viewer.locale)}</span>
          <span className="tabular text-muted">
            {r.expenseCount
              ? t("expensesSummary", {
                  count: r.expenseCount,
                  total: r.usdCents
                    ? `${formatMoney(r.expensesCents, "CAD", viewer.locale)} + ${formatMoney(r.usdCents, "USD", viewer.locale)}`
                    : formatMoney(r.expensesCents, "CAD", viewer.locale),
                })
              : t("noExpenses")}
          </span>
          <Badge tone={TONE[r.status]}>{t(`statuses.${r.status}`)}</Badge>
          <ChevronRight className="text-muted size-4" aria-hidden />
        </div>
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <section aria-labelledby="waiting" className="flex flex-col gap-3">
        <h2 id="waiting" className="eyebrow">
          {t("waiting", { count: waiting.length })}
        </h2>
        {waiting.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {waiting.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>
      {toInvoice.length ? (
        <section aria-labelledby="to-invoice" className="mt-12 flex flex-col gap-3">
          <h2 id="to-invoice" className="eyebrow">
            {t("toInvoice", { count: toInvoice.length })}
          </h2>
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {toInvoice.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/flight-reports/${r.id}`}
                  className="hover:bg-surface-muted flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.registration} · {r.fromAirport} → {r.toAirport}
                    </p>
                    <p className="text-muted text-sm">
                      {when(r.departsAt)} · {r.ownerName ?? t("noOwner")} · {r.companyName ?? t("noCompanyShort")}
                    </p>
                  </div>
                  <span className="text-accent flex items-center gap-1 text-sm font-medium">
                    {t("toInvoiceCta")}
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {decided.length ? (
        <section aria-labelledby="decided" className="mt-12 flex flex-col gap-3">
          <h2 id="decided" className="eyebrow">
            {t("decided")}
          </h2>
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {decided.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
