import { PlaneTakeoff, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { FlightRowActions } from "@/components/admin/flight-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { dayStart } from "@/lib/availability-days";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { listAircraft } from "@/lib/services/aircraft";
import { listFlights } from "@/lib/services/flights";
import { zonedDay } from "@/lib/time";
import { cancelFlightAction, completeFlightAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("flights") };
}

const TONE = { scheduled: "accent", completed: "success", cancelled: "neutral" } as const;
const DAY_MS = 86_400_000;

export default async function AdminFlightsPage({ searchParams }: PageProps<"/admin/flights">) {
  const viewer = await requireStaff();
  const t = await getTranslations("flights");
  const format = await getFormatter();
  const locale = await getLocale();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = str("view") === "past" ? "past" : "upcoming";
  const aircraftId = str("aircraft");

  // Upcoming: from the start of today (local) for 30 days. Past: the 60 days before now.
  const now = new Date();
  const today = dayStart(zonedDay(now));
  const window =
    view === "upcoming"
      ? { from: today, to: new Date(today.getTime() + 31 * DAY_MS) }
      : { from: new Date(now.getTime() - 60 * DAY_MS), to: now };
  const [rows, fleet, recent] = await Promise.all([
    listFlights(db, viewer, { ...window, aircraftId: aircraftId || undefined }),
    listAircraft(db, viewer),
    // Flights that have landed but are still "Prévu": their hours aren't counted until someone closes them.
    view === "upcoming"
      ? listFlights(db, viewer, {
          from: new Date(now.getTime() - 60 * DAY_MS),
          to: now,
          aircraftId: aircraftId || undefined,
          status: "scheduled",
        })
      : Promise.resolve([]),
  ]);
  const landed = (f: { departsAt: Date; arrivesAt: Date | null }) =>
    (f.arrivesAt ?? new Date(f.departsAt.getTime() + 2 * 3_600_000)) < now;
  const toClose = recent.filter(landed);
  const planned = (f: { departsAt: Date; arrivesAt: Date | null }) =>
    f.arrivesAt ? Math.round((f.arrivesAt.getTime() - f.departsAt.getTime()) / 60_000) : null;
  if (view === "past") rows.reverse();
  const canWrite = can(viewer, "operations:write");

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = zonedDay(r.departsAt);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const todayKey = zonedDay(now);
  const dayLabel = (key: string) => {
    const label = format.dateTime(new Date(`${key}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    return key === todayKey ? `${t("today")} · ${label}` : label;
  };
  const time = (d: Date) => format.dateTime(d, { hour: "numeric", minute: "2-digit" });
  const tab = (v: "upcoming" | "past") => {
    const q = new URLSearchParams({ view: v, ...(aircraftId ? { aircraft: aircraftId } : {}) });
    return `/admin/flights?${q}`;
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <DownloadLink
              href={`/admin/flights/export?${new URLSearchParams({ view, ...(aircraftId ? { aircraft: aircraftId } : {}) })}`}
            >
              {t("exportCsv")}
            </DownloadLink>
            {canWrite ? (
              <Button asChild size="sm">
                <Link href="/admin/flights/new">
                  <Plus aria-hidden />
                  {t("new")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <nav aria-label={t("view")} className="bg-surface-muted inline-flex rounded-md p-1">
          {(["upcoming", "past"] as const).map((v) => (
            <Link
              key={v}
              href={tab(v) as never}
              aria-current={view === v ? "page" : undefined}
              className="aria-[current=page]:bg-surface rounded px-3 py-1.5 text-sm font-medium aria-[current=page]:shadow-sm"
            >
              {t(`views.${v}`)}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="view" value={view} />
          <Select name="aircraft" defaultValue={aircraftId} aria-label={t("aircraft")} className="w-44">
            <option value="">{t("allAircraft")}</option>
            {fleet.map((a) => (
              <option key={a.id} value={a.id}>
                {a.registration}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("filter")}
          </Button>
        </form>
      </div>

      {toClose.length && canWrite ? (
        <section id="to-close" aria-labelledby="to-close-title" className="mb-10 scroll-mt-28">
          <h2 id="to-close-title" className="text-2xl font-light tracking-tight">
            {t("toCloseTitle")}
          </h2>
          <p className="text-muted mt-1 mb-4 text-sm">{t("toCloseBody")}</p>
          <ul className="border-warning/40 bg-surface divide-border divide-y rounded-lg border">
            {toClose.map((f) => (
              <li key={f.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:gap-6">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/flights/${f.id}`} className="font-medium hover:underline">
                    {f.fromAirport} → {f.toAirport}
                  </Link>
                  <p className="text-muted text-sm first-letter:uppercase">
                    {format.dateTime(f.departsAt, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                    {time(f.departsAt)} · {f.registration} · {f.ownerName ?? t("noShare")}
                  </p>
                </div>
                <FlightRowActions
                  id={f.id}
                  status={f.status}
                  complete={completeFlightAction.bind(null, f.id)}
                  cancel={cancelFlightAction.bind(null, f.id)}
                  plannedMinutes={planned(f)}
                  ownerName={f.ownerName}
                  startOpen
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={PlaneTakeoff}
          title={view === "upcoming" ? t("emptyUpcomingTitle") : t("emptyPastTitle")}
          body={view === "upcoming" ? t("emptyUpcomingBody") : t("emptyPastBody")}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups].map(([key, flights]) => (
            <section key={key} aria-labelledby={`day-${key}`}>
              <h2 id={`day-${key}`} className="eyebrow mb-3 first-letter:uppercase">
                {dayLabel(key)}
              </h2>
              <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
                {flights.map((f) => (
                  <li
                    key={f.id}
                    className="hover:bg-surface-muted/60 relative flex flex-col gap-2 px-5 py-4 transition-colors md:flex-row md:items-center md:gap-5"
                  >
                    <span className="tabular w-20 shrink-0 text-xl font-light">{time(f.departsAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        {/* The whole row opens the flight; its buttons stay above the link. */}
                        <Link
                          href={`/admin/flights/${f.id}`}
                          className={`font-medium after:absolute after:inset-0 ${f.status === "cancelled" ? "text-muted line-through" : ""}`}
                        >
                          {f.fromAirport} → {f.toAirport}
                        </Link>
                        <Badge tone={TONE[f.status]}>{t(`statuses.${f.status}`)}</Badge>
                        {f.source === "sync" ? <Badge>{t("synced")}</Badge> : null}
                      </p>
                      <p className="text-muted truncate text-sm">
                        {f.registration} · {f.ownerName ?? t("noShare")}
                        {f.flightMinutes ? ` · ${t("flown", { hours: formatHours(f.flightMinutes, locale) })}` : ""}
                      </p>
                    </div>
                    {canWrite ? (
                      <div className="relative z-10">
                        <FlightRowActions
                          id={f.id}
                          status={f.status}
                          complete={completeFlightAction.bind(null, f.id)}
                          cancel={cancelFlightAction.bind(null, f.id)}
                          plannedMinutes={planned(f)}
                          ownerName={f.ownerName}
                        />
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
