import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/ui/live-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { listOwnerFlights } from "@/lib/services/flights";
import { scenes } from "@/lib/imagery";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("flights") };
}

const TONE = { scheduled: "accent", completed: "success", cancelled: "neutral" } as const;

export default async function OwnerFlightsPage() {
  const viewer = await requireAccess();
  const t = await getTranslations("ownerFlights");
  const tf = await getTranslations("flights");
  const format = await getFormatter();
  const locale = await getLocale();
  const { upcoming, past } = await listOwnerFlights(db, viewer);
  const now = new Date();
  const when = (d: Date) =>
    format.dateTime(d, { weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

  type Row = (typeof upcoming)[number];
  const list = (rows: Row[]) => (
    <ul className="bg-surface shadow-card divide-border divide-y rounded-lg border border-(--card-border)">
      {rows.map((f) => (
        <li key={f.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className={`font-semibold ${f.status === "cancelled" ? "text-muted line-through" : ""}`}>
              {f.fromAirport} → {f.toAirport}
            </p>
            <p className="text-muted text-sm first-letter:uppercase">
              {when(f.departsAt)} · {f.registration}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {f.status === "scheduled" && f.departsAt <= now ? (
              <Badge tone="success" className="gap-1.5">
                <LiveDot className="size-2" />
                {t("inFlight")}
              </Badge>
            ) : (
              <Badge tone={TONE[f.status]}>{tf(`statuses.${f.status}`)}</Badge>
            )}
            {f.flightMinutes && f.status === "completed" ? (
              <span className="tabular text-muted text-sm">{formatHours(f.flightMinutes, locale)}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          upcoming.length || past.length ? <DownloadLink href="/flights/export">{t("exportCsv")}</DownloadLink> : null
        }
      />
      <div className="flex flex-col gap-8">
        <section aria-labelledby="upcoming">
          <h2 id="upcoming" className="text-muted mb-2 text-sm font-semibold">
            {t("upcoming")}
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={PlaneTakeoff}
              image={scenes.boarding}
              title={t("noUpcomingTitle")}
              body={t("noUpcomingBody")}
            />
          ) : (
            list(upcoming)
          )}
        </section>
        <section aria-labelledby="past">
          <h2 id="past" className="text-muted mb-2 text-sm font-semibold">
            {t("past")}
          </h2>
          {past.length === 0 ? (
            <EmptyState icon={PlaneLanding} image={scenes.rampDusk} title={t("noPastTitle")} body={t("noPastBody")} />
          ) : (
            list(past)
          )}
        </section>
      </div>
    </>
  );
}
