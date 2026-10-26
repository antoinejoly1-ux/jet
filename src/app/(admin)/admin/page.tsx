import { CalendarRange, KeyRound, MailPlus, Plane, PlaneTakeoff, UserRoundX, Users, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dayStart } from "@/lib/availability-days";
import { getAdminStats } from "@/lib/services/dashboard";
import { zonedDay } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("dashboard") };
}

export default async function AdminDashboardPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("adminDashboard");
  const stats = await getAdminStats(db, viewer, dayStart(zonedDay(new Date())));
  const tiles = [
    { key: "flightsToday", value: stats.flightsToday, icon: PlaneTakeoff, href: "/admin/flights" },
    { key: "flightsThisWeek", value: stats.flightsThisWeek, icon: CalendarRange, href: "/admin/flights" },
    { key: "inMaintenance", value: stats.inMaintenance, icon: Wrench, href: "/admin/maintenance" },
    { key: "owners", value: stats.owners, icon: Users, href: "/admin/owners" },
    { key: "aircraft", value: stats.aircraft, icon: Plane, href: "/admin/aircraft" },
    { key: "pendingInvitations", value: stats.pendingInvitations, icon: MailPlus, href: "/admin/invitations" },
    { key: "accountsWaiting", value: stats.accountsWaiting, icon: UserRoundX, href: "/admin/invitations" },
    { key: "ownersWithoutAccess", value: stats.ownersWithoutAccess, icon: KeyRound, href: "/admin/invitations" },
  ] as const;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {tiles.map(({ key, value, icon: Icon, href }) => (
          <Link key={key} href={href} className="group">
            <Card className="group-hover:bg-surface-muted transition-colors">
              <div className="flex items-center gap-2">
                <Icon className="text-muted size-4" aria-hidden />
                <CardTitle>{t(key)}</CardTitle>
              </div>
              <p className="tabular mt-2 text-3xl font-bold tracking-tight">{value}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
