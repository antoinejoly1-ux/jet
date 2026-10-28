import { CheckCircle2 } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Star } from "@/components/brand/logo";
import { FlightRowActions } from "@/components/admin/flight-row-actions";
import { FleetLive } from "@/components/tracking/fleet-live";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedIcon, type AnimatedIconName } from "@/components/animated-icons/AnimatedIcon";
import { Instrument, InstrumentStrip } from "@/components/ui/instrument";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dayStart } from "@/lib/availability-days";
import { getAdminQueue, getAdminStats, type QueueKey } from "@/lib/services/dashboard";
import { listFlights } from "@/lib/services/flights";
import { getFleetLive } from "@/lib/services/tracking";
import { cancelFlightAction, completeFlightAction } from "./flights/actions";
import { OPERATOR_TIME_ZONE, zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("dashboard") };
}

const STATUS_TONE = { scheduled: "accent", completed: "success", cancelled: "neutral" } as const;

export default async function AdminDashboardPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("adminDashboard");
  const tf = await getTranslations("flights");
  const format = await getFormatter();
  const todayStart = dayStart(zonedDay(new Date()));
  const [stats, fleet, today, queue] = await Promise.all([
    getAdminStats(db, viewer, todayStart),
    getFleetLive(db, viewer),
    listFlights(db, viewer, { from: todayStart, to: new Date(todayStart.getTime() + 86_400_000) }),
    getAdminQueue(db, viewer),
  ]);
  const airborne = fleet.filter((a) => a.state === "in_flight").length;
  const firstName = viewer.name.split(" ")[0] ?? "";
  const date = format.dateTime(new Date(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: OPERATOR_TIME_ZONE,
  });

  const clients: { key: string; value: number; icon: AnimatedIconName; href: Route }[] = [
    { key: "owners", value: stats.owners, icon: "people", href: "/admin/owners" },
    {
      key: "pendingInvitations",
      value: stats.pendingInvitations,
      icon: "mail",
      href: "/admin/invitations",
    },
    {
      key: "accountsWaiting",
      value: stats.accountsWaiting,
      icon: "user",
      href: "/admin/invitations",
    },
    {
      key: "ownersWithoutAccess",
      value: stats.ownersWithoutAccess,
      icon: "key",
      href: "/admin/invitations",
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <header>
        <p className="eyebrow flex items-center gap-2.5">
          <Star className="text-bronze h-2.5 w-auto" />
          <span>
            {t("hello", { name: firstName })} · <span className="first-letter:uppercase">{date}</span>
          </span>
        </p>
        <h1 className="mt-3 text-3xl leading-tight font-light tracking-[-0.025em] sm:text-[2.6rem]">
          {t("heroLight")} <span className="text-accent">{t("heroNow")}</span>
        </h1>
      </header>

      <FleetLive initial={fleet} />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section aria-labelledby="today-title">
          <div className="mb-5 flex items-end justify-between gap-3">
            <h2 id="today-title" className="text-2xl font-light tracking-tight">
              {t("todayTitle")}
            </h2>
            {can(viewer, "operations:write") ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/admin/flights/new" className="ai-trigger">
                  <AnimatedIcon name="planeTakeoff" size={18} />
                  {t("newFlight")}
                </Link>
              </Button>
            ) : null}
          </div>
          {today.length === 0 ? (
            <p className="border-border text-muted rounded-lg border px-6 py-10 text-center text-sm">
              {t("todayEmpty")}
            </p>
          ) : (
            <ol className="border-border relative ml-3 border-l">
              {today.map((f) => (
                <li key={f.id} className="relative pb-6 pl-8 last:pb-0">
                  <span
                    className={cn(
                      "ring-background absolute top-2 -left-[5px] size-[9px] rounded-full ring-4",
                      f.status === "completed" ? "bg-success" : f.status === "cancelled" ? "bg-muted/50" : "bg-accent",
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="tabular w-24 shrink-0 text-2xl font-light whitespace-nowrap">
                      {format.dateTime(f.departsAt, { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <Link href={`/admin/flights/${f.id}`} className="group min-w-0 flex-1">
                      <span className="block font-medium group-hover:underline">
                        {f.fromAirport} <span className="text-muted">→</span> {f.toAirport}
                      </span>
                      <span className="text-muted block text-sm">
                        {f.registration} · {f.ownerName ?? t("charter")}
                      </span>
                    </Link>
                    {/* Landed but still "Prévu": close it right here. */}
                    {can(viewer, "operations:write") && f.status === "scheduled" && f.departsAt < new Date() ? (
                      <FlightRowActions
                        id={f.id}
                        status={f.status}
                        complete={completeFlightAction.bind(null, f.id)}
                        cancel={cancelFlightAction.bind(null, f.id)}
                        plannedMinutes={
                          f.arrivesAt ? Math.round((f.arrivesAt.getTime() - f.departsAt.getTime()) / 60_000) : null
                        }
                        ownerName={f.ownerName}
                      />
                    ) : (
                      <Badge tone={STATUS_TONE[f.status]}>{tf(`statuses.${f.status}`)}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="clients-title">
          <h2 id="clients-title" className="mb-5 text-2xl font-light tracking-tight">
            {t("clientsTitle")}
          </h2>
          <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
            {clients.map(({ key, value, icon, href }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="group ai-trigger hover:bg-surface-muted/60 flex items-center gap-4 px-6 py-4 transition-colors"
                >
                  <span className="border-border text-muted group-hover:text-text flex size-9 items-center justify-center rounded-full border transition-colors">
                    <AnimatedIcon name={icon} size={18} />
                  </span>
                  <span className="flex-1 text-sm">{t(key)}</span>
                  <span className="tabular text-2xl font-light">{value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Queue rows={queue} />

      <InstrumentStrip>
        <Instrument label={t("inTheAir")} value={airborne} caption={t("ofFleet", { total: fleet.length })} />
        <Instrument label={t("flightsToday")} value={stats.flightsToday} href="/admin/flights" />
        <Instrument label={t("flightsThisWeek")} value={stats.flightsThisWeek} href="/admin/flights" />
        <Instrument label={t("inMaintenance")} value={stats.inMaintenance} href="/admin/maintenance" />
      </InstrumentStrip>
    </div>
  );
}

const QUEUE_ICON: Record<QueueKey, AnimatedIconName> = {
  flightReports: "clipboard",
  toInvoice: "invoice",
  flightsToClose: "plane",
  flightRequests: "planeTakeoff",
  awaitingReply: "chat",
  maintenanceOverdue: "wrench",
  maintenanceSoon: "calendar",
  lowHours: "clock",
  ownersNeverInvited: "mail",
};

/** "À traiter": what needs someone today, most urgent first, each a count and a way in. */
async function Queue({ rows }: { rows: { key: QueueKey; count: number; href: string }[] }) {
  const t = await getTranslations("adminDashboard.queue");
  return (
    <section aria-labelledby="queue-title">
      <h2 id="queue-title" className="mb-5 text-2xl font-light tracking-tight">
        {t("title")}
      </h2>
      {rows.length === 0 ? (
        <p className="border-border text-muted flex items-center gap-3 rounded-lg border px-6 py-5 text-sm">
          <CheckCircle2 className="text-success size-5" strokeWidth={1.5} aria-hidden />
          {t("empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ key, count, href }) => {
            const icon = QUEUE_ICON[key];
            return (
              <li key={key}>
                <Link
                  href={href as Route}
                  className="group ai-trigger border-border bg-surface hover:border-text/30 flex h-full items-center gap-4 rounded-lg border px-5 py-4 transition-colors"
                >
                  <span className="tabular w-10 text-3xl font-light">{count}</span>
                  <span className="min-w-0 flex-1 text-sm">{t(key, { count })}</span>
                  <AnimatedIcon name={icon} size={18} className="text-muted group-hover:text-text" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
