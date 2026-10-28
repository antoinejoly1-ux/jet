import { ChevronRight, CircleAlert, PlaneLanding } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requirePilot } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { listPilotFlights } from "@/lib/services/flight-reports";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("pilot"))("title") };
}

const TONE = { submitted: "accent", returned: "warning", approved: "success" } as const;

/** Reports sent back to fix first, then landed flights to report (latest first), then the reports already sent. */
export default async function PilotHome() {
  const viewer = await requirePilot();
  const t = await getTranslations("pilot");
  const format = await getFormatter();
  const locale = await getLocale();
  const { toFix, toReport, mine } = await listPilotFlights(db, viewer);
  const when = (d: Date) =>
    format.dateTime(d, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: OPERATOR_TIME_ZONE,
    });

  return (
    <>
      <PageHeader
        eyebrow={t("hello", { name: viewer.name.split(" ")[0] ?? "" })}
        title={t("title")}
        description={t("body")}
      />

      {toFix.length ? (
        <section aria-labelledby="to-fix" className="mb-12 flex flex-col gap-3">
          <h2 id="to-fix" className="eyebrow text-warning">
            {t("toFix", { count: toFix.length })}
          </h2>
          <ul className="flex flex-col gap-3">
            {toFix.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/pilot/flights/${f.id}`}
                  className="border-warning/40 bg-warning/8 hover:border-warning flex items-center gap-4 rounded-lg border p-5 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-light tracking-tight">
                      {f.fromAirport} → {f.toAirport}
                    </p>
                    <p className="text-muted mt-1 text-sm">
                      {f.registration} · {when(f.departsAt)}
                    </p>
                    <p className="text-warning mt-2 flex items-start gap-1.5 text-sm">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        {t("returnedNote")} {f.reviewNote}
                      </span>
                    </p>
                  </div>
                  <span className="text-accent flex shrink-0 items-center gap-1 text-sm font-medium">
                    {t("fix")}
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="to-report" className="flex flex-col gap-3">
        <h2 id="to-report" className="eyebrow">
          {t("toReport")}
        </h2>
        {toReport.length === 0 ? (
          <EmptyState icon={PlaneLanding} title={t("nothingToReport")} body={t("nothingToReportBody")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {toReport.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/pilot/flights/${f.id}`}
                  className="border-border bg-surface hover:border-text/30 flex items-center gap-4 rounded-lg border p-5 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-light tracking-tight">
                      {f.fromAirport} → {f.toAirport}
                    </p>
                    <p className="text-muted mt-1 text-sm">
                      {f.registration} · {when(f.departsAt)}
                    </p>
                  </div>
                  <span className="text-accent flex shrink-0 items-center gap-1 text-sm font-medium">
                    {t("report")}
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mine.length ? (
        <section aria-labelledby="sent" className="mt-12 flex flex-col gap-3">
          <h2 id="sent" className="eyebrow">
            {t("sent")}
          </h2>
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {mine.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/pilot/flights/${r.flightId}`}
                  className="hover:bg-surface-muted flex items-center gap-4 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.fromAirport} → {r.toAirport}
                    </p>
                    <p className="text-muted text-sm">
                      {r.registration} · {when(r.departsAt)} · {formatHours(r.flightMinutes, locale)}
                    </p>
                  </div>
                  <Badge tone={TONE[r.status]}>{t(`statuses.${r.status}`)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
