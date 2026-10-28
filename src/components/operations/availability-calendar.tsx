import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { RequestDay } from "@/components/flights/request-day";
import { monthDays, shiftMonth, type DayStatus, type Period } from "@/lib/availability-days";
import { zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";

const CELL: Record<DayStatus, string> = {
  free: "bg-success/12 text-success ring-1 ring-inset ring-success/30",
  mine: "bg-accent text-primary-foreground",
  booked: "bg-muted/35 text-text",
  maintenance: "bg-warning/25 text-warning",
};

/**
 * A month of the aircraft's days, coloured free / yours / booked /
 * maintenance, with the taken periods listed underneath (the list is what a
 * screen reader and a narrow phone rely on; the grid is the glance).
 */
export async function AvailabilityCalendar({
  month,
  periods,
  hrefFor,
  periodAction,
  requestable = false,
  staff = false,
}: {
  month: string;
  periods: Period[];
  hrefFor: (month: string) => string;
  /** Owners: a tap on a free day opens "Demander un vol" with that date. */
  requestable?: boolean;
  /** The team's view: no « Votre vol », just « Vol ». */
  staff?: boolean;
  /** Extra control per period, e.g. removing a manual block. */
  periodAction?: (p: Period) => ReactNode;
}) {
  const t = await getTranslations("availability");
  const format = await getFormatter();
  const days = monthDays(month, periods);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const title = format.dateTime(new Date(Date.UTC(y, m - 1, 15)), { month: "long", year: "numeric", timeZone: "UTC" });
  // Monday-first grid: blank cells before the 1st.
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(Date.UTC(2024, 0, 1 + i)), { weekday: "narrow", timeZone: "UTC" }),
  );
  const today = zonedDay(new Date());
  // What's still ahead matters; a month already under way lists only what hasn't ended.
  const underWay = month <= today.slice(0, 7);
  const listed = underWay ? periods.filter((p) => zonedDay(p.endsAt) >= today) : periods;
  const range = (p: Period) =>
    `${format.dateTime(p.startsAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} – ${format.dateTime(p.endsAt, zonedDay(p.startsAt) === zonedDay(p.endsAt) ? { hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
  const describe = (p: Period) => {
    if (p.kind === "maintenance") return p.label ? `${t("legend.maintenance")} · ${p.label}` : t("legend.maintenance");
    if (p.kind === "booked") return [t("legend.booked"), p.ownerName].filter(Boolean).join(" · ");
    return [p.mine ? t(staff ? "legend.flight" : "yourFlight") : null, p.label, p.ownerName]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-light tracking-tight first-letter:uppercase">{title}</h2>
          <div className="flex gap-1">
            <Link
              href={hrefFor(shiftMonth(month, -1)) as Route}
              className="hover:bg-surface-muted inline-flex size-9 items-center justify-center rounded-md"
              aria-label={t("previousMonth")}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <Link
              href={hrefFor(shiftMonth(month, 1)) as Route}
              className="hover:bg-surface-muted inline-flex size-9 items-center justify-center rounded-md"
              aria-label={t("nextMonth")}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {weekdays.map((w, i) => (
            <span key={i} aria-hidden className="text-muted pb-1 text-center text-xs font-semibold uppercase">
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((d) => {
            const className = cn(
              "tabular flex aspect-square items-start justify-end rounded-md p-1 text-xs font-semibold sm:p-2 sm:text-sm",
              // Past days go neutral but stay readable; their details remain in the list below.
              d.day < today ? "bg-surface-muted text-muted" : CELL[d.status],
              d.day === today && "ring-text ring-2 ring-offset-1 ring-offset-[var(--surface)]",
            );
            const n = Number(d.day.slice(8));
            return requestable && d.status === "free" && d.day >= today ? (
              <RequestDay
                key={d.day}
                day={d.day}
                className={className}
                label={t("requestOn", {
                  date: format.dateTime(new Date(`${d.day}T12:00:00`), { day: "numeric", month: "long" }),
                })}
              >
                {n}
              </RequestDay>
            ) : (
              <span key={d.day} aria-hidden data-status={d.status} className={className}>
                {n}
              </span>
            );
          })}
        </div>

        <ul className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t("legendLabel")}>
          {(["free", "mine", "booked", "maintenance"] as const).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className={cn("size-3 rounded-sm", CELL[s])} aria-hidden />
              {t(`legend.${staff && s === "mine" ? "flight" : s}`)}
            </li>
          ))}
        </ul>
      </div>

      <section aria-labelledby="taken-periods">
        <h3 id="taken-periods" className="mb-2 text-sm font-semibold">
          {underWay ? t("upcomingTitle") : t("takenTitle")}
        </h3>
        {listed.length === 0 ? (
          <p className="text-muted text-sm">{underWay ? t("allFreeRest") : t("allFree")}</p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-lg border">
            {listed.map((p, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    CELL[p.kind === "maintenance" ? "maintenance" : p.mine ? "mine" : "booked"],
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="tabular font-medium">{range(p)}</p>
                  <p className="text-muted">{describe(p)}</p>
                </div>
                {periodAction?.(p)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
