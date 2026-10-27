import {
  Bell,
  CalendarClock,
  CalendarDays,
  Clock3,
  FileText,
  Lightbulb,
  MessageSquare,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Timer,
  TriangleAlert,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Star } from "@/components/brand/logo";
import { ContactButtons } from "@/components/common/contact-buttons";
import { LiveAircraft } from "@/components/tracking/live-aircraft";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconMotion } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { daysFrom, dayStart, type DayStatus } from "@/lib/availability-days";
import type { Actor } from "@/lib/auth/policy";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney, formatMoneyRounded } from "@/lib/format";
import { insightsFor, type Insight } from "@/lib/insights";
import { getAvailability } from "@/lib/services/availability";
import { getOwnerActivity, getOwnerHome, type ActivityItem, type ShareSummary } from "@/lib/services/dashboard";
import { getAircraftLive } from "@/lib/services/tracking";
import { OPERATOR_TIME_ZONE, zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import terminal from "../../../public/images/terminal.webp";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("home") };
}

/** Morning, afternoon or evening in Montreal, where Univair and its owners are. */
function partOfDay(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { hour: "numeric", hour12: false, timeZone: OPERATOR_TIME_ZONE }).format(now),
  );
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

export default async function HomePage() {
  const viewer = await requireAccess();
  const t = await getTranslations("home");
  const format = await getFormatter();
  const [summaries, activity] = await Promise.all([getOwnerHome(db, viewer), getOwnerActivity(db, viewer)]);
  const firstName = viewer.name.split(" ")[0] ?? "";
  const now = new Date();
  const today = format.dateTime(now, { weekday: "long", day: "numeric", month: "long", timeZone: OPERATOR_TIME_ZONE });

  return (
    <>
      <PageHeader
        hero
        eyebrow={
          <>
            <Star className="text-bronze h-2.5 w-auto" />
            <span>
              {t(`greetings.${partOfDay(now)}`, { name: firstName })} ·{" "}
              <span className="first-letter:uppercase">{today}</span>
            </span>
          </>
        }
        title={
          <>
            <span className="font-light">{summaries.length > 1 ? t("heroMany") : t("heroOne")}</span>{" "}
            <span>{t("heroNow")}</span>
          </>
        }
        actions={viewer.viewingAs ? null : <ContactButtons />}
      />
      {summaries.length === 0 ? (
        <EmptyState
          icon={Plane}
          title={t("noShareTitle")}
          body={viewer.staffRole ? t("noShareStaffBody") : t("noShareBody")}
        />
      ) : (
        <div className="flex flex-col gap-12">
          {summaries.map((s) => (
            <ShareSection key={s.shareId} summary={s} showOwner={summaries.length > 1} viewer={viewer} />
          ))}
          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityFeed items={activity} className="lg:col-span-2" />
            <TeamCard />
          </div>
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
  const [{ periods }, live] = await Promise.all([
    getAvailability(db, viewer, s.aircraft.id, from, new Date(from.getTime() + (AHEAD + 1) * 86_400_000), {
      ownerView: true,
    }),
    getAircraftLive(db, viewer, s.aircraft.id, { ownerView: true }),
  ]);
  const ahead = daysFrom(first, AHEAD, periods);
  // The tracker knows better than the stored status whether the aircraft is flying.
  const liveStatus = (live.state === "in_flight" ? "flying" : s.aircraft.status) as keyof typeof STATUS_TONE;
  const freeDays = ahead.filter((d) => d.status === "free").length;
  const locale = await getLocale();
  const format = await getFormatter();
  const year = new Date().getFullYear();
  const remaining = s.annualMinutes ? Math.min(1, Math.max(0, s.minutesRemaining / s.annualMinutes)) : null;
  const budgetUsed = s.budget && s.budget.plannedCents > 0 ? s.budget.spentCents / s.budget.plannedCents : null;
  const shortDay = (d: Date) => format.dateTime(d, { day: "numeric", month: "short" });
  const dateTime = (d: Date) =>
    format.dateTime(d, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <section aria-labelledby={`share-${s.shareId}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={`share-${s.shareId}`} className="text-lg font-bold tracking-tight">
          {s.aircraft.registration} <span className="text-muted font-medium">· {s.aircraft.model}</span>
        </h2>
        <Badge tone={STATUS_TONE[liveStatus] ?? "neutral"}>{t(`status.${liveStatus}`)}</Badge>
        <span className="text-muted text-sm">
          {t("shareOf", { percent: format.number(s.percentageBp / 10000, { style: "percent" }) })}
          {showOwner ? ` · ${s.ownerName}` : ""}
        </span>
      </div>

      <LiveAircraft initial={live} photo={aircraftPhoto(s.aircraft.model)} className="animate-rise" />

      <Insights
        items={insightsFor({
          now: new Date(),
          minutesRemaining: s.minutesRemaining,
          usedThisYearMinutes: s.usedThisYearMinutes,
          budget: s.budget,
        })}
      />

      <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          icon={Timer}
          anim="pulse"
          value={formatHours(s.minutesRemaining, locale)}
          label={
            <>
              {t("hoursRemaining")}
              {s.annualMinutes ? (
                <span className="block">{t("ofAnnual", { hours: formatHours(s.annualMinutes, locale) })}</span>
              ) : null}
            </>
          }
          footer={<Meter value={remaining} label={t("hoursRemaining")} tone="hours" />}
        />
        <StatTile
          icon={PlaneTakeoff}
          anim="plane"
          value={formatHours(s.usedThisYearMinutes, locale)}
          label={t("flownThisYear", { year })}
        />
        {s.showFinances ? (
          <StatTile
            icon={Wallet}
            anim="bounce"
            value={s.budget ? formatMoneyRounded(s.budget.spentCents, s.budget.currency, locale) : "—"}
            label={
              s.budget ? (
                <>
                  {t("spentThisYear", { year })}
                  <span className="block">
                    {t("ofPlannedShort", {
                      amount: formatMoneyRounded(s.budget.plannedCents, s.budget.currency, locale),
                    })}
                  </span>
                </>
              ) : (
                t("budgetEmpty")
              )
            }
            footer={<Meter value={budgetUsed} label={t("budget", { year })} tone="budget" />}
          />
        ) : (
          <StatTile
            icon={CalendarDays}
            anim="flip"
            value={t("freeDaysShort", { count: freeDays })}
            label={t("freeDaysLabel", { days: AHEAD })}
          />
        )}
        <StatTile
          icon={Wrench}
          anim="twist"
          value={s.nextMaintenance ? shortDay(s.nextMaintenance.startsAt) : "—"}
          label={
            s.nextMaintenance ? (
              <>
                {t("nextMaintenance")}
                {s.nextMaintenance.endsAt ? (
                  <span className="block">{t("maintenanceEnds", { date: shortDay(s.nextMaintenance.endsAt) })}</span>
                ) : null}
              </>
            ) : (
              t("nextMaintenanceEmpty")
            )
          }
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="group">
          <div className="mb-3 flex items-center gap-2">
            <Icon icon={CalendarClock} anim="flip" className="text-muted size-4" />
            <CardTitle>{t("availability")}</CardTitle>
          </div>
          <p className="text-lg font-semibold">{t("freeDays", { count: freeDays, days: AHEAD })}</p>
          <ol className="mt-4 grid grid-cols-14 gap-1" aria-hidden>
            {ahead.map((d) => (
              <li key={d.day} className={cn("h-7 rounded-full", DOT[d.status])} title={d.day} />
            ))}
          </ol>
          <Link
            href={`/availability?aircraft=${s.aircraft.id}`}
            className="text-accent mt-4 inline-block text-sm font-semibold hover:underline"
          >
            {t("seeCalendar")}
          </Link>
        </Card>

        {s.showFinances ? (
          <Card className="group">
            <div className="mb-3 flex items-center gap-2">
              <Icon icon={FileText} anim="slide" className="text-muted size-4" />
              <CardTitle>{t("latestInvoice")}</CardTitle>
            </div>
            {s.latestInvoice ? (
              <>
                <p className="tabular text-2xl font-bold tracking-tight">
                  {formatMoney(s.latestInvoice.totalCents, s.latestInvoice.currency, locale)}
                </p>
                <p className="text-muted text-sm">
                  {s.latestInvoice.number} ·{" "}
                  {format.dateTime(new Date(`${s.latestInvoice.issuedOn}T12:00:00`), { dateStyle: "long" })}
                </p>
                <Link href="/invoices" className="text-accent mt-4 inline-block text-sm font-semibold hover:underline">
                  {t("seeInvoices")}
                </Link>
              </>
            ) : (
              <p className="text-muted text-sm">{t("latestInvoiceEmpty")}</p>
            )}
          </Card>
        ) : (
          <Card className="group">
            <div className="mb-3 flex items-center gap-2">
              <Icon icon={PlaneTakeoff} anim="plane" className="text-muted size-4" />
              <CardTitle>{t("nextFlight")}</CardTitle>
            </div>
            {s.nextFlight ? (
              <>
                <p className="text-2xl font-bold tracking-tight">
                  {s.nextFlight.fromAirport} → {s.nextFlight.toAirport}
                </p>
                <p className="text-muted text-sm">{dateTime(s.nextFlight.departsAt)}</p>
              </>
            ) : (
              <p className="text-muted text-sm">{t("nextFlightEmpty")}</p>
            )}
          </Card>
        )}
      </div>
    </section>
  );
}

const NOTICE_ICON: Record<string, [LucideIcon, IconMotion]> = {
  "invoice.issued": [FileText, "slide"],
  "budget.published": [Wallet, "bounce"],
  "hours.low": [Clock3, "pulse"],
  "maintenance.planned": [Wrench, "twist"],
  "message.from_dispatch": [MessageSquare, "wiggle"],
};

/** "En direct": the latest things that happened, Pop Bunny style, with a live dot on what's new. */
async function ActivityFeed({ items, className }: { items: ActivityItem[]; className?: string }) {
  const t = await getTranslations("home");
  const tn = await getTranslations("notifications");
  const format = await getFormatter();
  return (
    <Card className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-bold">
          <span className="bg-live relative inline-flex size-2.5 rounded-full" aria-hidden>
            <span className="bg-live absolute inset-0 rounded-full motion-safe:animate-[live-ping_1.8s_ease-out_infinite]" />
          </span>
          {t("activityTitle")}
        </h2>
        <Link href="/notifications" className="text-accent text-sm font-semibold hover:underline">
          {t("activityAll")}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-muted py-6 text-sm">{t("activityEmpty")}</p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((item) => {
            const [glyph, anim] =
              item.kind === "flight"
                ? [PlaneLanding, "drop" as IconMotion]
                : (NOTICE_ICON[item.type] ?? [Bell, "ring" as IconMotion]);
            const body =
              item.kind === "flight" ? (
                <>
                  <span className="font-semibold">{t("flightCompleted")}</span>{" "}
                  <span className="whitespace-nowrap">
                    {item.from} → {item.to}
                  </span>
                  <span className="text-muted block text-xs">
                    {item.registration}
                    {item.minutes
                      ? ` · ${t("flightLength", { hours: Math.floor(item.minutes / 60), minutes: String(item.minutes % 60).padStart(2, "0") })}`
                      : ""}
                  </span>
                </>
              ) : (
                <span className={cn(item.unread && "font-semibold")}>{tn(`types.${item.type}`, item.data)}</span>
              );
            const row = (
              <>
                <span className="bg-surface-muted text-text relative flex size-10 shrink-0 items-center justify-center rounded-full">
                  <Icon icon={glyph} anim={anim} className="size-4" />
                  {item.kind === "notice" && item.unread ? (
                    <span
                      className="bg-live border-surface absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2"
                      aria-hidden
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug">{body}</span>
                <time dateTime={item.at.toISOString()} className="text-muted shrink-0 text-xs">
                  {format.relativeTime(item.at)}
                </time>
              </>
            );
            return (
              <li key={`${item.kind}-${item.id}`}>
                {item.kind === "notice" ? (
                  <Link
                    href={item.href as Route}
                    className="group hover:bg-surface-muted/60 -mx-3 flex items-center gap-3 rounded-[14px] px-3 py-3"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="group flex items-center gap-3 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The team behind the aircraft, with a photograph of the terminal and the ways to reach them. */
async function TeamCard() {
  const t = await getTranslations("home");
  return (
    <section className="bg-primary text-primary-foreground shadow-card relative flex min-h-80 flex-col justify-end overflow-hidden rounded-lg p-6">
      <Image
        src={terminal}
        alt=""
        fill
        sizes="(min-width: 1024px) 33vw, 100vw"
        placeholder="blur"
        className="object-cover opacity-55"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" aria-hidden />
      <div className="relative">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-white/75 uppercase">{t("teamEyebrow")}</p>
        <h2 className="text-2xl leading-tight font-bold text-white">{t("teamTitle")}</h2>
        <p className="mt-2 text-sm text-white/80">{t("teamBody")}</p>
        <div className="mt-5 [&_a]:border-white/30 [&_a:last-child]:bg-white/10 [&_a:last-child]:text-white">
          <ContactButtons />
        </div>
      </div>
    </section>
  );
}

function Meter({ value, label, tone }: { value: number | null; label: string; tone: "hours" | "budget" }) {
  if (value === null) return null;
  const pct = Math.min(100, Math.round(value * 100));
  const color =
    tone === "hours"
      ? value < 0.1
        ? "bg-warning"
        : "bg-bronze"
      : value >= 1
        ? "bg-danger"
        : value >= 0.9
          ? "bg-warning"
          : "bg-bronze";
  return (
    <div
      className="bg-surface-muted h-1.5 overflow-hidden rounded-full"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className={`h-full rounded-full ${color} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
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
    <ul className="flex flex-col gap-2" aria-label={t("label")}>
      {items.map((i) => {
        const Glyph = i.tone === "warning" ? TriangleAlert : Lightbulb;
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
              "flex items-start gap-3 rounded-[18px] border-l-2 px-4 py-3 text-sm",
              i.tone === "warning" ? "border-warning bg-warning/10 text-warning" : "border-bronze bg-accent/[0.07]",
            )}
          >
            <Glyph className={cn("mt-0.5 size-4 shrink-0", i.tone !== "warning" && "text-accent")} aria-hidden />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
