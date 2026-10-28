import { Plus, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { MaintenanceRowActions } from "@/components/admin/maintenance-row-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listMaintenance } from "@/lib/services/maintenance";
import { setMaintenanceStatusAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("maintenance") };
}

export const STATUS_TONE = {
  planned: "accent",
  in_progress: "warning",
  done: "success",
  cancelled: "neutral",
} as const;

export default async function AdminMaintenancePage({ searchParams }: PageProps<"/admin/maintenance">) {
  const viewer = await requireStaff();
  const t = await getTranslations("maintenance");
  const format = await getFormatter();
  const sp = await searchParams;
  const { open, closed } = await listMaintenance(db, viewer);
  const canWrite = can(viewer, "operations:write");
  const dt = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  type Row = (typeof open)[number];
  const when = (r: Row) =>
    r.startsAt
      ? r.endsAt
        ? `${dt(r.startsAt)} – ${dt(r.endsAt)}`
        : t("from", { date: dt(r.startsAt) })
      : r.dueOn
        ? t("dueOnDate", { date: day(r.dueOn) })
        : t("notScheduled");

  const list = (rows: Row[], actions: boolean) => (
    <ul className="bg-surface shadow-card divide-border divide-y rounded-lg border border-(--card-border)">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.title}</span>
              <Badge tone={STATUS_TONE[r.status]}>{t(`statuses.${r.status}`)}</Badge>
              {r.source === "sync" ? <Badge>{t("synced")}</Badge> : null}
            </p>
            <p className="text-muted text-sm">
              <Link
                href={`/admin/aircraft/${r.aircraftId}`}
                className="hover:text-text underline-offset-2 hover:underline"
              >
                {r.registration}
              </Link>{" "}
              · {t.has(`types.${r.type}`) ? t(`types.${r.type}`) : r.type} · {when(r)}
            </p>
          </div>
          {actions && canWrite ? (
            <MaintenanceRowActions
              id={r.id}
              status={r.status}
              start={setMaintenanceStatusAction.bind(null, r.id, "in_progress")}
              finish={setMaintenanceStatusAction.bind(null, r.id, "done")}
              cancel={setMaintenanceStatusAction.bind(null, r.id, "cancelled")}
            />
          ) : null}
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
          canWrite ? (
            <Button asChild size="sm">
              <Link href="/admin/maintenance/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      {sp.saved ? (
        <div className="mb-4">
          <Alert tone="success">{t("saved")}</Alert>
        </div>
      ) : null}
      {open.length === 0 ? (
        <EmptyState icon={Wrench} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        list(open, true)
      )}
      {closed.length > 0 ? (
        <section className="mt-8" aria-labelledby="closed-jobs">
          <h2 id="closed-jobs" className="text-muted mb-2 text-sm font-semibold">
            {t("closed")}
          </h2>
          {list(closed, false)}
        </section>
      ) : null}
    </>
  );
}
