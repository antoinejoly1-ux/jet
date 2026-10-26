import { PlaneTakeoff, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { FlightRowActions } from "@/components/admin/flight-row-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
  const [rows, fleet] = await Promise.all([
    listFlights(db, viewer, { ...window, aircraftId: aircraftId || undefined }),
    listAircraft(db, viewer),
  ]);
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
  const time = (d: Date) => format.dateTime(d, { hour: "2-digit", minute: "2-digit" });
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
          canWrite ? (
            <Button asChild size="sm">
              <Link href="/admin/flights/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      {str("saved") ? (
        <div className="mb-4">
          <Alert tone="success">{t("saved")}</Alert>
        </div>
      ) : null}

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
              <h2 id={`day-${key}`} className="text-muted mb-2 text-sm font-semibold first-letter:uppercase">
                {dayLabel(key)}
              </h2>
              <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
                {flights.map((f) => (
                  <li key={f.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
                    <span className="tabular w-14 shrink-0 font-semibold">{time(f.departsAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${f.status === "cancelled" ? "text-muted line-through" : ""}`}>
                          {f.fromAirport} → {f.toAirport}
                        </span>
                        <Badge tone={TONE[f.status]}>{t(`statuses.${f.status}`)}</Badge>
                        {f.source === "sync" ? <Badge>{t("synced")}</Badge> : null}
                      </p>
                      <p className="text-muted truncate text-sm">
                        {f.registration} · {f.ownerName ?? t("noShare")}
                        {f.blockMinutes ? ` · ${t("block", { hours: formatHours(f.blockMinutes, locale) })}` : ""}
                      </p>
                    </div>
                    {canWrite ? (
                      <FlightRowActions
                        id={f.id}
                        status={f.status}
                        complete={completeFlightAction.bind(null, f.id)}
                        cancel={cancelFlightAction.bind(null, f.id)}
                      />
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
