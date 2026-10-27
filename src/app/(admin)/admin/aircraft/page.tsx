import { Plane, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listAircraft } from "@/lib/services/aircraft";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("aircraft") };
}

const STATUS_TONE = { available: "success", flying: "accent", maintenance: "warning", inactive: "neutral" } as const;

export default async function AircraftListPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("aircraft");
  const format = await getFormatter();
  const rows = await listAircraft(db, viewer);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          can(viewer, "fleet:write") ? (
            <Button asChild size="sm">
              <Link href="/admin/aircraft/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Plane} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => {
            const complete = a.assignedBp === 10_000;
            return (
              <li key={a.id}>
                <Link
                  href={`/admin/aircraft/${a.id}`}
                  className="group bg-surface shadow-card block rounded-lg border border-(--card-border) p-5 transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold tracking-tight">{a.registration}</p>
                      <p className="text-muted text-sm">
                        {a.model}
                        {a.homeBase ? ` · ${a.homeBase}` : ""}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[a.status]}>{t(`statuses.${a.status}`)}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted">{t("ownersCount", { count: a.owners })}</span>
                    <span className={`tabular font-semibold ${complete ? "text-success" : "text-warning"}`}>
                      {t("assigned", {
                        percent: format.number(a.assignedBp / 10000, { style: "percent", maximumFractionDigits: 2 }),
                      })}
                    </span>
                  </div>
                  <div className="bg-surface-muted mt-2 h-1.5 overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full ${complete ? "bg-success" : "bg-warning"}`}
                      style={{ width: `${a.assignedBp / 100}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
