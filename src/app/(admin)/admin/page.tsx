import {
  CalendarRange,
  KeyRound,
  MailPlus,
  Plane,
  PlaneTakeoff,
  UserRoundX,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Star } from "@/components/brand/logo";
import { FleetLive } from "@/components/tracking/fleet-live";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon, type IconMotion } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dayStart } from "@/lib/availability-days";
import { getAdminStats } from "@/lib/services/dashboard";
import { listFlights } from "@/lib/services/flights";
import { getFleetLive } from "@/lib/services/tracking";
import { OPERATOR_TIME_ZONE, zonedDay } from "@/lib/time";

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

  const primary: { key: string; value: number; icon: LucideIcon; anim: IconMotion; href: Route }[] = [
    { key: "inTheAir", value: airborne, icon: PlaneTakeoff, anim: "plane", href: "/admin/flights" },
    { key: "flightsToday", value: stats.flightsToday, icon: CalendarRange, anim: "flip", href: "/admin/flights" },
    { key: "flightsThisWeek", value: stats.flightsThisWeek, icon: Plane, anim: "drop", href: "/admin/flights" },
    { key: "inMaintenance", value: stats.inMaintenance, icon: Wrench, anim: "twist", href: "/admin/maintenance" },
  ];
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
    <>
      <PageHeader
        hero
        eyebrow={
          <>
            <Star className="text-bronze h-2.5 w-auto" />
            <span>
              {t("hello", { name: firstName })} · <span className="first-letter:uppercase">{date}</span>
            </span>
          </>
        }
        title={
          <>
            <span className="font-light">{t("heroLight")}</span> <span>{t("heroNow")}</span>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {primary.map(({ key, value, icon, anim, href }) => (
            <Link key={key} href={href} className="rounded-lg">
              <StatTile icon={icon} anim={anim} value={value} label={t(key)} className="h-full" />
            </Link>
          ))}
        </div>

        <FleetLive initial={fleet} />

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{t("todayTitle")}</h2>
              {can(viewer, "operations:write") ? (
                <Link href="/admin/flights/new" className="text-accent text-sm font-semibold hover:underline">
                  {t("newFlight")}
                </Link>
              ) : null}
            </div>
            {today.length === 0 ? (
              <p className="text-muted py-6 text-sm">{t("todayEmpty")}</p>
            ) : (
              <ul className="divide-border divide-y">
                {today.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <span className="tabular w-14 text-sm font-semibold">
                      {format.dateTime(f.departsAt, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {f.fromAirport} → {f.toAirport}
                      </span>
                      <span className="text-muted block text-xs">
                        {f.registration} · {f.ownerName ?? t("charter")}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[f.status]}>{tf(`statuses.${f.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold">{t("clientsTitle")}</h2>
            <ul className="flex flex-col gap-1">
              {clients.map(({ key, value, icon, anim, href }) => (
                <li key={key}>
                  <Link
                    href={href}
                    className="group hover:bg-surface-muted/60 -mx-3 flex items-center gap-3 rounded-[14px] px-3 py-2.5"
                  >
                    <span className="bg-accent/10 text-accent flex size-9 items-center justify-center rounded-full">
                      <Icon icon={icon} anim={anim} className="size-4" />
                    </span>
                    <span className="flex-1 text-sm">{t(key)}</span>
                    <span className="tabular text-lg font-bold">{value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
