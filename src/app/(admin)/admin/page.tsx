import { KeyRound, MailPlus, PlaneTakeoff, UserRoundX, Users, type LucideIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Star } from "@/components/brand/logo";
import { FleetLive } from "@/components/tracking/fleet-live";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon, type IconMotion } from "@/components/ui/icon";
import { Instrument, InstrumentStrip } from "@/components/ui/instrument";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dayStart } from "@/lib/availability-days";
import { getAdminStats } from "@/lib/services/dashboard";
import { listFlights } from "@/lib/services/flights";
import { getFleetLive } from "@/lib/services/tracking";
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
  const [stats, fleet, today] = await Promise.all([
    getAdminStats(db, viewer, todayStart),
    getFleetLive(db, viewer),
    listFlights(db, viewer, { from: todayStart, to: new Date(todayStart.getTime() + 86_400_000) }),
  ]);
  const airborne = fleet.filter((a) => a.state === "in_flight").length;
  const firstName = viewer.name.split(" ")[0] ?? "";
  const date = format.dateTime(new Date(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: OPERATOR_TIME_ZONE,
  });

  const clients: { key: string; value: number; icon: LucideIcon; anim: IconMotion; href: Route }[] = [
    { key: "owners", value: stats.owners, icon: Users, anim: "bounce", href: "/admin/owners" },
    {
      key: "pendingInvitations",
      value: stats.pendingInvitations,
      icon: MailPlus,
      anim: "slide",
      href: "/admin/invitations",
    },
    {
      key: "accountsWaiting",
      value: stats.accountsWaiting,
      icon: UserRoundX,
      anim: "shake",
      href: "/admin/invitations",
    },
    {
      key: "ownersWithoutAccess",
      value: stats.ownersWithoutAccess,
      icon: KeyRound,
      anim: "twist",
      href: "/admin/invitations",
    },
  ];

  return (
    <div className="flex flex-col gap-12">
      <FleetLive
        initial={fleet}
        header={
          <header>
            <p className="eyebrow flex items-center gap-2.5">
              <Star className="text-bronze h-2.5 w-auto" />
              <span>
                {t("hello", { name: firstName })} · <span className="first-letter:uppercase">{date}</span>
              </span>
            </p>
            <h1 className="mt-4 text-4xl leading-[1.05] font-light tracking-[-0.03em] sm:text-5xl">
              {t("heroLight")} <span className="text-accent">{t("heroNow")}</span>
            </h1>
          </header>
        }
      />

      <InstrumentStrip>
        <Instrument label={t("inTheAir")} value={airborne} caption={t("ofFleet", { total: fleet.length })} />
        <Instrument label={t("flightsToday")} value={stats.flightsToday} />
        <Instrument label={t("flightsThisWeek")} value={stats.flightsThisWeek} />
        <Instrument label={t("inMaintenance")} value={stats.inMaintenance} />
      </InstrumentStrip>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section aria-labelledby="today-title">
          <div className="mb-5 flex items-end justify-between gap-3">
            <h2 id="today-title" className="text-2xl font-light tracking-tight">
              {t("todayTitle")}
            </h2>
            {can(viewer, "operations:write") ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/admin/flights/new">
                  <PlaneTakeoff aria-hidden />
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
                    <span className="tabular w-16 text-2xl font-light">
                      {format.dateTime(f.departsAt, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {f.fromAirport} <span className="text-muted">→</span> {f.toAirport}
                      </span>
                      <span className="text-muted block text-sm">
                        {f.registration} · {f.ownerName ?? t("charter")}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[f.status]}>{tf(`statuses.${f.status}`)}</Badge>
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
            {clients.map(({ key, value, icon, anim, href }) => (
              <li key={key}>
                <Link
                  href={href}
                  className="group hover:bg-surface-muted/60 flex items-center gap-4 px-6 py-4 transition-colors"
                >
                  <span className="border-border text-muted group-hover:text-text flex size-9 items-center justify-center rounded-full border transition-colors">
                    <Icon icon={icon} anim={anim} className="size-4" />
                  </span>
                  <span className="flex-1 text-sm">{t(key)}</span>
                  <span className="tabular text-2xl font-light">{value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
