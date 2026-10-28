import { Plus, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { MaintenanceRowActions } from "@/components/admin/maintenance-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { aircraftPhotoUrl } from "@/lib/aircraft-photo-url";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listMaintenance } from "@/lib/services/maintenance";
import { cn } from "@/lib/utils";
import { setMaintenanceStatusAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("maintenance") };
}

export const STATUS_TONE = {
  planned: "accent",
  in_progress: "warning",
  review: "warning",
  done: "success",
  cancelled: "neutral",
} as const;

const COLUMNS = ["planned", "in_progress", "review", "done"] as const;
const DOT = { planned: "bg-accent", in_progress: "bg-warning", review: "bg-bronze", done: "bg-success" } as const;

/**
 * Maintenance as a board: Planifié · En cours · En vérification · Terminé.
 * Each card moves to the next column with one button; cancelled jobs sit
 * below. Jobs synced from CAMP carry its badge.
 */
export default async function AdminMaintenancePage() {
  const viewer = await requireStaff();
  const t = await getTranslations("maintenance");
  const format = await getFormatter();
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
  const all = [...open, ...closed];
  const byColumn = (c: (typeof COLUMNS)[number]) => all.filter((r) => r.status === c).slice(0, c === "done" ? 30 : 100);
  const cancelled = closed.filter((r) => r.status === "cancelled");
  const status = (id: string, s: "in_progress" | "review" | "done" | "cancelled") =>
    setMaintenanceStatusAction.bind(null, id, s);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("boardSubtitle")}
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
      {all.length === 0 ? (
        <EmptyState icon={Wrench} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          <div className="grid min-w-[1040px] grid-cols-4 gap-4 lg:min-w-0">
            {COLUMNS.map((c) => {
              const rows = byColumn(c);
              return (
                <section
                  key={c}
                  aria-labelledby={`col-${c}`}
                  className="bg-surface-muted/50 flex min-h-48 flex-col gap-3 rounded-[22px] p-3"
                >
                  <h2 id={`col-${c}`} className="flex items-center gap-2 px-2 pt-1 text-sm font-medium">
                    <span className={cn("size-2 rounded-full", DOT[c])} aria-hidden />
                    {t(`columns.${c}`)}
                    <span className="text-muted tabular ml-auto text-xs">{rows.length}</span>
                  </h2>
                  {rows.length === 0 ? (
                    <p className="text-muted px-2 py-6 text-center text-xs">{t("columnEmpty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {rows.map((r) => {
                        const photo = aircraftPhotoUrl(r.aircraftId, r.photoFileId);
                        return (
                          <li key={r.id} className="bg-surface border-border rounded-[16px] border p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                              <Link
                                href={`/admin/aircraft/${r.aircraftId}#maintenance`}
                                className="relative size-10 shrink-0 overflow-hidden rounded-[10px]"
                                aria-label={r.registration}
                              >
                                <Image
                                  src={photo ?? aircraftPhoto(r.model)}
                                  unoptimized={Boolean(photo)}
                                  alt=""
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              </Link>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm leading-snug font-medium">{r.title}</p>
                                <p className="text-muted mt-0.5 text-xs">
                                  {r.registration} · {t.has(`types.${r.type}`) ? t(`types.${r.type}`) : r.type}
                                </p>
                              </div>
                            </div>
                            <p className="text-muted mt-3 text-xs">{when(r)}</p>
                            {r.source === "sync" ? (
                              <div className="mt-2">
                                <Badge>{t("syncedFromCamp")}</Badge>
                              </div>
                            ) : null}
                            {canWrite && c !== "done" ? (
                              <div className="border-border mt-3 border-t pt-3">
                                <MaintenanceRowActions
                                  id={r.id}
                                  status={r.status}
                                  actions={{
                                    start: status(r.id, "in_progress"),
                                    review: status(r.id, "review"),
                                    done: status(r.id, "done"),
                                    back: status(r.id, "in_progress"),
                                    cancel: status(r.id, "cancelled"),
                                  }}
                                />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {cancelled.length > 0 ? (
        <details className="mt-8">
          <summary className="text-muted cursor-pointer text-sm font-semibold">
            {t("cancelledCount", { count: cancelled.length })}
          </summary>
          <ul className="bg-surface divide-border border-border mt-3 divide-y rounded-lg border">
            {cancelled.map((r) => (
              <li key={r.id} className="text-muted px-4 py-3 text-sm">
                {r.title} · {r.registration} · {when(r)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
