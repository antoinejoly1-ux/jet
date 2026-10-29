import { Plus, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { MaintenanceBoard, type BoardItem } from "@/components/admin/maintenance-board";
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
import { listMaintenance, sentToReviewByMe } from "@/lib/services/maintenance";
import { zonedDay } from "@/lib/time";
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

/**
 * Maintenance as a board: Planifié · En cours · En vérification · Terminé.
 * Each card moves to the next column with one button or by dragging it
 * (MaintenanceBoard); cancelled jobs sit below. Jobs synced from CAMP carry its badge.
 */
export default async function AdminMaintenancePage() {
  const viewer = await requireStaff();
  const t = await getTranslations("maintenance");
  const format = await getFormatter();
  const { open, closed } = await listMaintenance(db, viewer);
  const mine = await sentToReviewByMe(
    db,
    viewer,
    open.filter((r) => r.status === "review").map((r) => r.id),
  );
  const canWrite = can(viewer, "operations:write");
  const dt = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const hm = (d: Date) => format.dateTime(d, { hour: "numeric", minute: "2-digit" });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  type Row = (typeof open)[number];
  // A window on one day reads « 28 oct., 9 h – 15 h 02 »; a same-minute window is just its time.
  const range = (a: Date, b: Date) =>
    Math.abs(b.getTime() - a.getTime()) < 60_000
      ? dt(a)
      : zonedDay(a) === zonedDay(b)
        ? `${dt(a)} – ${hm(b)}`
        : `${dt(a)} – ${dt(b)}`;
  /** The dates that matter at each stage; a deadline stays in view until the job is done. */
  const when = (r: Row) => {
    const due = r.dueOn ? t("dueOnDate", { date: day(r.dueOn) }) : null;
    if (r.status === "done") return r.endsAt ? t("doneOn", { date: dt(r.endsAt) }) : (due ?? t("notScheduled"));
    const window = r.startsAt
      ? r.endsAt
        ? range(r.startsAt, r.endsAt)
        : r.status === "planned"
          ? t("from", { date: dt(r.startsAt) })
          : t("startedOn", { date: dt(r.startsAt) })
      : null;
    return [window, due].filter(Boolean).join(" · ") || t("notScheduled");
  };
  const all = [...open, ...closed];
  const byColumn = (c: (typeof COLUMNS)[number]) => all.filter((r) => r.status === c).slice(0, c === "done" ? 30 : 100);
  const cancelled = closed.filter((r) => r.status === "cancelled");
  const status = (id: string, s: "in_progress" | "review" | "done" | "cancelled") =>
    setMaintenanceStatusAction.bind(null, id, s);
  const card = (r: Row, c: (typeof COLUMNS)[number]) => {
    const photo = aircraftPhotoUrl(r.aircraftId, r.photoFileId);
    return (
      <>
        <div className="flex items-start gap-3">
          <Link
            href={`/admin/aircraft/${r.aircraftId}#maintenance`}
            className="relative size-10 shrink-0 overflow-hidden rounded-[10px]"
            aria-label={r.registration}
            draggable={false}
          >
            <Image
              src={photo ?? aircraftPhoto(r.model)}
              unoptimized={Boolean(photo)}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
              draggable={false}
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
        {c === "done" ? (
          // Finished work leads to the aircraft's history, where it's signed off.
          <div className="border-border mt-3 border-t pt-3">
            <Link
              href={`/admin/aircraft/${r.aircraftId}#history`}
              className="text-muted hover:text-text text-xs font-medium underline-offset-4 hover:underline"
            >
              {t("seeHistory")}
            </Link>
          </div>
        ) : null}
        {canWrite && c !== "done" ? (
          <div className="border-border mt-3 border-t pt-3">
            <MaintenanceRowActions
              id={r.id}
              status={r.status}
              awaitingOther={mine.has(r.id)}
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
      </>
    );
  };
  const items: BoardItem[] = COLUMNS.flatMap((c) =>
    byColumn(c).map((r) => ({ id: r.id, status: c, title: r.title, awaitingOther: mine.has(r.id), card: card(r, c) })),
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={canWrite ? t("boardSubtitleDrag") : t("boardSubtitle")}
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
        <MaintenanceBoard canWrite={canWrite} moveAction={setMaintenanceStatusAction} items={items} />
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
