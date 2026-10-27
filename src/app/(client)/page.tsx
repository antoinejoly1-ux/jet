import { CalendarClock, FileText, Lightbulb, Plane, PlaneTakeoff, TriangleAlert, Wallet, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ContactButtons } from "@/components/common/contact-buttons";
import { PageHeader } from "@/components/ui/page-header";
import { daysFrom, dayStart, type DayStatus } from "@/lib/availability-days";
import type { Actor } from "@/lib/auth/policy";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { insightsFor, type Insight } from "@/lib/insights";
import { getAvailability } from "@/lib/services/availability";
import { getOwnerHome, type ShareSummary } from "@/lib/services/dashboard";
import { zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("home") };
}

export default async function HomePage() {
  const viewer = await requireAccess();
  const t = await getTranslations("home");
  const summaries = await getOwnerHome(db, viewer);
  const firstName = viewer.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={t("greeting", { name: firstName })}
        description={t("subtitle")}
        actions={viewer.viewingAs ? null : <ContactButtons />}
      />
      {summaries.length === 0 ? (
        <EmptyState
          icon={Plane}
          title={t("noShareTitle")}
          body={viewer.staffRole ? t("noShareStaffBody") : t("noShareBody")}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {summaries.map((s) => (
            <ShareSection key={s.shareId} summary={s} showOwner={summaries.length > 1} viewer={viewer} />
          ))}
        </div>
      )}
    </>
  );
}

const STATUS_TONE = { available: "success", flying: "accent", maintenance: "warning", inactive: "neutral" } as const;

const AHEAD = 14;
const DOT: Record<DayStatus, string> = {
  free: "bg-success/70",
  mine: "bg-accent",
  booked: "bg-muted/45",
  maintenance: "bg-warning",
};

async function ShareSection({
  summary: s,
  showOwner,
  viewer,
}: {
  summary: ShareSummary;
  showOwner: boolean;
  viewer: Actor;
}) {
  const t = await getTranslations("home");
  const first = zonedDay(new Date());
  const from = dayStart(first);
  const { periods } = await getAvailability(
    db,
    viewer,
    s.aircraft.id,
    from,
    new Date(from.getTime() + (AHEAD + 1) * 86_400_000),
    { ownerView: true },
  );
  const ahead = daysFrom(first, AHEAD, periods);
  const freeDays = ahead.filter((d) => d.status === "free").length;
  const locale = await getLocale();
  const format = await getFormatter();
  const remaining = s.annualMinutes ? Math.min(1, Math.max(0, s.minutesRemaining / s.annualMinutes)) : null;
  const budgetUsed = s.budget && s.budget.plannedCents > 0 ? s.budget.spentCents / s.budget.plannedCents : null;
  const dateTime = (d: Date) =>
    format.dateTime(d, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00`), { day: "numeric", month: "long", year: "numeric" });

  return (
    <section aria-labelledby={`share-${s.shareId}`}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`share-${s.shareId}`} className="text-lg font-bold tracking-tight">
          {s.aircraft.registration} <span className="text-muted font-medium">· {s.aircraft.model}</span>
        </h2>
        <Badge tone={STATUS_TONE[s.aircraft.status as keyof typeof STATUS_TONE] ?? "neutral"}>
          {t(`status.${s.aircraft.status}`)}
        </Badge>
        <span className="text-muted text-sm">
          {t("shareOf", { percent: format.number(s.percentageBp / 10000, { style: "percent" }) })}
          {showOwner ? ` · ${s.ownerName}` : ""}
        </span>
      </div>

      <Insights
        items={insightsFor({
          now: new Date(),
          minutesRemaining: s.minutesRemaining,
          usedThisYearMinutes: s.usedThisYearMinutes,
          budget: s.budget,
        })}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="flex items-center gap-5 sm:col-span-2 xl:col-span-1">
          <ProgressRing value={remaining} label={t("hoursRemaining")} />
          <div>
            <CardTitle>{t("hoursRemaining")}</CardTitle>
            <p className="tabular mt-1 text-3xl font-bold tracking-tight">{formatHours(s.minutesRemaining, locale)}</p>
            {s.annualMinutes ? (
              <p className="tabular text-muted mt-1 text-sm">
                {t("ofAnnual", { hours: formatHours(s.annualMinutes, locale) })}
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Wallet className="text-muted size-4" aria-hidden />
            <CardTitle>{t("budget", { year: new Date().getFullYear() })}</CardTitle>
          </div>
          {s.budget ? (
            <>
              <p className="tabular mt-2 text-2xl font-bold tracking-tight">
                {formatMoney(s.budget.spentCents, s.budget.currency, locale)}
              </p>
              <p className="tabular text-muted text-sm">
                {t("ofPlanned", { amount: formatMoney(s.budget.plannedCents, s.budget.currency, locale) })}
              </p>
              <Meter value={budgetUsed} label={t("budget", { year: new Date().getFullYear() })} />
            </>
          ) : (
            <p className="text-muted mt-2 text-sm">{t("budgetEmpty")}</p>
          )}
        </Card>

        <InfoCard icon={PlaneTakeoff} title={t("nextFlight")} empty={t("nextFlightEmpty")}>
          {s.nextFlight ? (
            <>
              <p className="text-lg font-semibold">
                {s.nextFlight.fromAirport} → {s.nextFlight.toAirport}
              </p>
              <p className="text-muted text-sm">{dateTime(s.nextFlight.departsAt)}</p>
            </>
          ) : null}
        </InfoCard>

        <InfoCard icon={Wrench} title={t("nextMaintenance")} empty={t("nextMaintenanceEmpty")}>
          {s.nextMaintenance ? (
            <>
              <p className="text-lg font-semibold">
                {t("maintenanceStarts", { date: dateTime(s.nextMaintenance.startsAt) })}
              </p>
              {s.nextMaintenance.endsAt ? (
                <p className="text-muted text-sm">
                  {t("maintenanceEnds", { date: dateTime(s.nextMaintenance.endsAt) })}
                </p>
              ) : null}
            </>
          ) : null}
        </InfoCard>

        <InfoCard icon={FileText} title={t("latestInvoice")} empty={t("latestInvoiceEmpty")}>
          {s.latestInvoice ? (
            <>
              <p className="tabular text-lg font-semibold">
                {formatMoney(s.latestInvoice.totalCents, s.latestInvoice.currency, locale)}
              </p>
              <p className="text-muted text-sm">
                {s.latestInvoice.number} · {day(s.latestInvoice.issuedOn)}
              </p>
            </>
          ) : null}
        </InfoCard>

        <Card>
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="text-muted size-4" aria-hidden />
            <CardTitle>{t("availability")}</CardTitle>
          </div>
          <p className="text-lg font-semibold">{t("freeDays", { count: freeDays, days: AHEAD })}</p>
          <ol className="mt-3 grid grid-cols-14 gap-1" aria-hidden>
            {ahead.map((d) => (
              <li key={d.day} className={cn("h-6 rounded-sm", DOT[d.status])} title={d.day} />
            ))}
          </ol>
          <Link
            href={`/availability?aircraft=${s.aircraft.id}`}
            className="text-accent mt-3 inline-block text-sm font-medium hover:underline"
          >
            {t("seeCalendar")}
          </Link>
        </Card>
      </div>
    </section>
  );
}

function InfoCard({
  icon: Icon,
  title,
  empty,
  children,
}: {
  icon: typeof Plane;
  title: string;
  empty: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="text-muted size-4" aria-hidden />
        <CardTitle>{title}</CardTitle>
      </div>
      {children ?? <p className="text-muted text-sm">{empty}</p>}
    </Card>
  );
}

/** Share of annual hours still available, as a ring that drains. Null when no allotment is set. */
function ProgressRing({ value, label }: { value: number | null; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 72 72"
      className="size-20 shrink-0 -rotate-90"
      role="img"
      aria-label={value === null ? undefined : `${label} ${Math.round(value * 100)}%`}
    >
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="8" />
      {value !== null ? (
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={value < 0.1 ? "var(--warning)" : "var(--accent)"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
        />
      ) : null}
    </svg>
  );
}

function Meter({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const pct = Math.min(100, Math.round(value * 100));
  const tone = value >= 1 ? "bg-danger" : value >= 0.9 ? "bg-warning" : "bg-accent";
  return (
    <div
      className="bg-surface-muted mt-3 h-2 overflow-hidden rounded-full"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** One or two plain sentences about pace, from the owner's own numbers. */
async function Insights({ items }: { items: Insight[] }) {
  const t = await getTranslations("home.insights");
  const format = await getFormatter();
  if (items.length === 0) return null;
  const pct = (n: number) => format.number(n, { style: "percent", maximumFractionDigits: 0 });
  const month = (ym: string) =>
    format.dateTime(new Date(`${ym}-15T12:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <ul className="mb-4 flex flex-col gap-2" aria-label={t("label")}>
      {items.map((i) => {
        const Icon = i.tone === "warning" ? TriangleAlert : Lightbulb;
        const text =
          i.kind === "hoursPace"
            ? t("hoursPace", { months: format.number(i.months, { maximumFractionDigits: 1 }), until: month(i.until) })
            : i.kind === "hoursUnused"
              ? t("hoursUnused")
              : t(i.tone === "warning" ? "budgetAhead" : "budgetOnTrack", {
                  spent: pct(i.spentShare),
                  year: pct(i.yearShare),
                });
        return (
          <li
            key={i.kind}
            className={cn(
              "flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm",
              i.tone === "warning" ? "bg-warning/12 text-warning" : "bg-surface-muted",
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
