import { PlaneTakeoff, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AircraftFilter, ScrollIntoView } from "@/components/admin/flight-filters";
import { FlightRowActions } from "@/components/admin/flight-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { dayStart } from "@/lib/availability-days";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { listAircraft } from "@/lib/services/aircraft";
import { listFlights } from "@/lib/services/flights";
import { type FlightDisplayStatus, FLIGHT_STATUS_TONE, flightDisplayStatus } from "@/lib/flight-status";
import { zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { cancelFlightAction, completeFlightAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("flights") };
}

const DAY_MS = 86_400_000;
const PAST_PAGE = 50;

export default async function AdminFlightsPage({ searchParams }: PageProps<"/admin/flights">) {
  const viewer = await requireStaff();
  const t = await getTranslations("flights");
  const format = await getFormatter();
  const locale = await getLocale();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = str("view") === "past" ? "past" : "upcoming";
  const aircraftId = str("aircraft");
  const before = str("before") ? new Date(str("before")) : null;
  const justSaved = str("new");

  // Upcoming: from the start of today (local) for 30 days. Past: everything flown, newest first, a page at a time.
  const now = new Date();
  const today = dayStart(zonedDay(now));
  const cursor = before && !Number.isNaN(before.getTime()) && before < now ? before : now;
  const [fetched, fleet, recent] = await Promise.all([
    view === "upcoming"
      ? listFlights(db, viewer, {
          from: today,
          to: new Date(today.getTime() + 31 * DAY_MS),
          aircraftId: aircraftId || undefined,
        })
      : listFlights(db, viewer, {
          to: cursor,
          aircraftId: aircraftId || undefined,
          latestFirst: true,
          limit: PAST_PAGE + 1,
        }),
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
  const shown = (f: (typeof fetched)[number]) => flightDisplayStatus(f, now);
  const toClose = recent.filter((f) => shown(f) === "to_close");
  const planned = (f: { departsAt: Date; arrivesAt: Date | null }) =>
    f.arrivesAt ? Math.round((f.arrivesAt.getTime() - f.departsAt.getTime()) / 60_000) : null;
  const hasMore = view === "past" && fetched.length > PAST_PAGE;
  const page = hasMore ? fetched.slice(0, PAST_PAGE) : fetched;
  // A flight in the air is still "À venir" until it lands; "Passés" is what's behind us.
  // Cancelled flights leave "À venir" and wait, muted, at the bottom.
  const rows =
    view === "upcoming" ? page.filter((f) => f.status !== "cancelled") : page.filter((f) => shown(f) !== "in_flight");
  const cancelled = view === "upcoming" ? page.filter((f) => f.status === "cancelled") : [];
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
  const href = (params: Record<string, string>) =>
    `/admin/flights?${new URLSearchParams({ ...params, ...(aircraftId ? { aircraft: aircraftId } : {}) })}`;
  const tab = (v: "upcoming" | "past") => href({ view: v });

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
        <AircraftFilter
          value={aircraftId}
          label={t("aircraft")}
          allLabel={t("allAircraft")}
          fleet={fleet.map(({ id, registration }) => ({ id, registration }))}
        />
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
                  departed={f.departsAt <= now}
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
                  <FlightRow
                    key={f.id}
                    f={f}
                    status={shown(f)}
                    highlight={f.id === justSaved}
                    canWrite={canWrite}
                    time={time(f.departsAt)}
                    owner={f.ownerName ?? t("noShare")}
                    flown={f.flightMinutes ? t("flown", { hours: formatHours(f.flightMinutes, locale) }) : null}
                    statusLabel={t(`statuses.${shown(f)}`)}
                    synced={f.source === "sync" ? t("synced") : null}
                    planned={planned(f)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {cancelled.length > 0 ? (
        <details className="mt-8">
          <summary className="text-muted cursor-pointer text-sm font-semibold">
            {t("cancelledCount", { count: cancelled.length })}
          </summary>
          <ul className="border-border bg-surface divide-border mt-3 divide-y rounded-lg border opacity-80">
            {cancelled.map((f) => (
              <FlightRow
                key={f.id}
                f={f}
                status="cancelled"
                highlight={false}
                canWrite={false}
                time={`${format.dateTime(f.departsAt, { day: "numeric", month: "short" })} · ${time(f.departsAt)}`}
                owner={f.ownerName ?? t("noShare")}
                flown={null}
                statusLabel={t("statuses.cancelled")}
                synced={null}
                planned={null}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {hasMore ? (
        <Button asChild variant="secondary" size="sm" className="mt-6">
          <Link href={href({ view: "past", before: page.at(-1)!.departsAt.toISOString() }) as never}>{t("older")}</Link>
        </Button>
      ) : null}
    </>
  );
}

type Row = Awaited<ReturnType<typeof listFlights>>[number];

/** One flight in the list: the whole row opens it; its buttons sit above the link. */
function FlightRow({
  f,
  status,
  highlight,
  canWrite,
  time,
  owner,
  flown,
  statusLabel,
  synced,
  planned,
}: {
  f: Row;
  status: FlightDisplayStatus;
  highlight: boolean;
  canWrite: boolean;
  time: string;
  owner: string;
  flown: string | null;
  statusLabel: string;
  synced: string | null;
  planned: number | null;
}) {
  const departed = status === "in_flight" || status === "to_close";
  return (
    <li
      id={`flight-${f.id}`}
      className={cn(
        "hover:bg-surface-muted/60 relative flex scroll-mt-28 flex-col gap-2 px-5 py-4 transition-colors md:flex-row md:items-center md:gap-5",
        highlight && "animate-highlight",
      )}
    >
      {highlight ? <ScrollIntoView /> : null}
      <span className="tabular shrink-0 text-xl font-light md:w-20">{time}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/flights/${f.id}`}
            className={cn(
              "font-medium after:absolute after:inset-0",
              f.status === "cancelled" && "text-muted line-through",
            )}
          >
            {f.fromAirport} → {f.toAirport}
          </Link>
          <Badge tone={FLIGHT_STATUS_TONE[status]}>{statusLabel}</Badge>
          {synced ? <Badge>{synced}</Badge> : null}
        </p>
        <p className="text-muted truncate text-sm">
          {f.registration} · {owner}
          {flown ? ` · ${flown}` : ""}
        </p>
      </div>
      {canWrite ? (
        <div className="relative z-10">
          <FlightRowActions
            id={f.id}
            status={f.status}
            departed={departed}
            complete={completeFlightAction.bind(null, f.id)}
            cancel={cancelFlightAction.bind(null, f.id)}
            plannedMinutes={planned}
            ownerName={f.ownerName}
          />
        </div>
      ) : null}
    </li>
  );
}
