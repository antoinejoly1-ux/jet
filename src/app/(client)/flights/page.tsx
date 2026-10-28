import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/ui/live-dot";
import { RequestFlightButton } from "@/components/flights/request-flight";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { listOpenFlightRequests } from "@/lib/services/flight-requests";
import { listOwnerFlights } from "@/lib/services/flights";
import { scenes } from "@/lib/imagery";
import { zonedLocalToUtc } from "@/lib/time";

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
  const tr = await getTranslations("requestFlight");
  const [{ upcoming, past }, requests] = await Promise.all([
    listOwnerFlights(db, viewer),
    listOpenFlightRequests(db, viewer),
  ]);
  const now = new Date();
  const when = (d: Date) =>
    format.dateTime(d, { weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

  type Row = (typeof upcoming)[number];
  const list = (rows: Row[]) => (
    <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
      {rows.map((f) => (
        <li key={f.id} className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p
              className={`text-lg font-light tracking-wide ${f.status === "cancelled" ? "text-muted line-through" : ""}`}
            >
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
          <>
            <RequestFlightButton>
              <PlaneTakeoff aria-hidden />
              {tr("open")}
            </RequestFlightButton>
            {upcoming.length || past.length ? (
              <DownloadLink href="/flights/export">{t("exportCsv")}</DownloadLink>
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-12">
        <section aria-labelledby="upcoming">
          <h2 id="upcoming" className="mb-4 text-2xl font-light tracking-tight">
            {t("upcoming")}
          </h2>
          {requests.length ? (
            <ul className="border-warning/40 divide-border mb-4 divide-y rounded-lg border border-dashed">
              {requests.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-lg font-light tracking-wide">
                      {r.from} → {r.to}
                    </p>
                    <p className="text-muted text-sm first-letter:uppercase">
                      {format.dateTime(new Date(`${r.date}T12:00:00`), {
                        weekday: "short",
                        day: "numeric",
                        month: "long",
                      })}
                      {r.time
                        ? ` · ${format.dateTime(zonedLocalToUtc(`${r.date}T${r.time}`)!, { hour: "numeric", minute: "2-digit" })}`
                        : ""}{" "}
                      · {r.registration}
                    </p>
                  </div>
                  <Badge tone="warning">{tr("pending")}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {upcoming.length === 0 && requests.length === 0 ? (
            <EmptyState
              icon={PlaneTakeoff}
              image={scenes.boarding}
              title={t("noUpcomingTitle")}
              body={t("noUpcomingBody")}
              action={<RequestFlightButton variant="accent">{tr("open")}</RequestFlightButton>}
            />
          ) : upcoming.length ? (
            list(upcoming)
          ) : null}
        </section>
        <section aria-labelledby="past">
          <h2 id="past" className="mb-4 text-2xl font-light tracking-tight">
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
