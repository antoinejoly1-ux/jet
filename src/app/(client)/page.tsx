import {
  Bell,
  Clock3,
  FileText,
  MessageSquare,
  Plane,
  PlaneLanding,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { TeamFaces } from "@/components/brand/team";
import { ContactButtons } from "@/components/common/contact-buttons";
import { LiveAircraft } from "@/components/tracking/live-aircraft";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon, type IconMotion } from "@/components/ui/icon";
import { Instrument, InstrumentStrip } from "@/components/ui/instrument";
import { LiveDot } from "@/components/ui/live-dot";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { daysFrom, dayStart, type DayStatus } from "@/lib/availability-days";
import type { Viewer } from "@/lib/auth/session";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatHours, formatMoney, formatMoneyRounded } from "@/lib/format";
import { scenes } from "@/lib/imagery";
import { insightsFor, type Insight } from "@/lib/insights";
import { getAvailability } from "@/lib/services/availability";
import { getOwnerActivity, getOwnerHome, type ActivityItem, type ShareSummary } from "@/lib/services/dashboard";
import { listOwnerFlights } from "@/lib/services/flights";
import { getAircraftLive, type AircraftLive } from "@/lib/services/tracking";
import { OPERATOR_TIME_ZONE, zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";

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

/** "Pilatus PC-12 NGX" → "PC-12": how owners talk about their aircraft. */
const shortModel = (model: string) =>
  model
    .replace(/^(Pilatus|Beechcraft|Bombardier|Cessna|Embraer|Textron)\s+/i, "")
    .replace(/\s+(NGX|NG|i|E)$/i, "")
    .trim();

/** The hero photograph: the PC-12 with its pilot for PC-12 owners, the type's own photo otherwise. */
const heroPhoto = (model: string): StaticImageData =>
  /pc-?12/i.test(model) ? scenes.hangarPilot : aircraftPhoto(model);

export default async function HomePage() {
  const viewer = await requireAccess();
  const t = await getTranslations("home");
  const [summaries, activity, flights] = await Promise.all([
    getOwnerHome(db, viewer),
    getOwnerActivity(db, viewer),
    listOwnerFlights(db, viewer),
  ]);

  if (summaries.length === 0)
    return (
      <div className="pt-6">
        <EmptyState
          icon={Plane}
          image={scenes.hangar}
          title={t("noShareTitle")}
          body={viewer.staffRole ? t("noShareStaffBody") : t("noShareBody")}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-16 pb-8 sm:gap-20">
      {summaries.map((s, i) => (
        <ShareSection key={s.shareId} summary={s} viewer={viewer} first={i === 0} showOwner={summaries.length > 1} />
      ))}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <UpcomingFlights flights={flights.upcoming.slice(0, 4)} />
        <TeamPanel />
      </div>

      <ActivityFeed items={activity} />
    </div>
  );
}

const AHEAD = 14;
const DOT: Record<DayStatus, string> = {
  free: "bg-text/80",
  mine: "bg-accent",
  booked: "bg-text/20",
  maintenance: "bg-warning/70",
};

async function ShareSection({
  summary: s,
  viewer,
  first,
  showOwner,
}: {
  summary: ShareSummary;
  viewer: Viewer;
  first: boolean;
  showOwner: boolean;
}) {
  const t = await getTranslations("home");
  const format = await getFormatter();
  const locale = await getLocale();
  const day0 = zonedDay(new Date());
  const from = dayStart(day0);
  const [{ periods }, live] = await Promise.all([
    getAvailability(db, viewer, s.aircraft.id, from, new Date(from.getTime() + (AHEAD + 1) * 86_400_000), {
      ownerView: true,
    }),
    getAircraftLive(db, viewer, s.aircraft.id, { ownerView: true }),
  ]);
  const ahead = daysFrom(day0, AHEAD, periods);
  const freeDays = ahead.filter((d) => d.status === "free").length;
  const year = new Date().getFullYear();
  const remaining = s.annualMinutes ? Math.min(1, Math.max(0, s.minutesRemaining / s.annualMinutes)) : null;
  const shortDay = (d: Date) => format.dateTime(d, { day: "numeric", month: "short" });

  const insights = insightsFor({
    now: new Date(),
    minutesRemaining: s.minutesRemaining,
    usedThisYearMinutes: s.usedThisYearMinutes,
    budget: s.budget,
  });

  return (
    <section aria-labelledby={`share-${s.shareId}`} className="flex flex-col gap-10 sm:gap-12">
      <Hero
        summary={s}
        live={live}
        greeting={first}
        showOwner={showOwner}
        firstName={viewer.name.split(" ")[0] ?? ""}
      />

      {/* The instrument strip: four readings, hairlines between, no boxes. */}
      <InstrumentStrip>
        <Instrument
          label={t("hoursRemaining")}
          value={formatHours(s.minutesRemaining, locale)}
          caption={s.annualMinutes ? t("ofAnnual", { hours: formatHours(s.annualMinutes, locale) }) : undefined}
          meter={remaining}
        />
        <Instrument
          label={t("flownThisYear", { year })}
          value={formatHours(s.usedThisYearMinutes, locale)}
          caption={t("flownCaption")}
        />
        {s.showFinances ? (
          <Instrument
            label={t("spentThisYear", { year })}
            value={s.budget ? formatMoneyRounded(s.budget.spentCents, s.budget.currency, locale) : "—"}
            caption={
              s.budget
                ? t("ofPlannedShort", {
                    amount: formatMoneyRounded(s.budget.plannedCents, s.budget.currency, locale),
                  })
                : t("budgetEmpty")
            }
            meter={s.budget && s.budget.plannedCents > 0 ? s.budget.spentCents / s.budget.plannedCents : null}
          />
        ) : (
          <Instrument
            label={t("availability")}
            value={t("freeDaysShort", { count: freeDays })}
            caption={t("freeDaysLabel", { days: AHEAD })}
          />
        )}
        <Instrument
          label={t("nextMaintenance")}
          value={s.nextMaintenance ? shortDay(s.nextMaintenance.startsAt) : "—"}
          caption={
            s.nextMaintenance
              ? s.nextMaintenance.endsAt
                ? t("maintenanceEnds", { date: shortDay(s.nextMaintenance.endsAt) })
                : undefined
              : t("nextMaintenanceEmpty")
          }
        />
      </InstrumentStrip>

      {insights.length ? <InsightLine items={insights} /> : null}

      <LiveAircraft initial={live} photo={heroPhoto(s.aircraft.model)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="group">
          <div className="flex items-baseline justify-between gap-4">
            <CardTitle>{t("availability")}</CardTitle>
            <Link
              href={`/availability?aircraft=${s.aircraft.id}`}
              className="text-accent text-xs font-medium tracking-[0.04em] hover:underline"
            >
              {t("seeCalendar")}
            </Link>
          </div>
          <p className="mt-4 text-2xl font-light tracking-tight">{t("freeDays", { count: freeDays, days: AHEAD })}</p>
          <ol className="mt-6 grid grid-cols-14 gap-1.5" aria-hidden>
            {ahead.map((d) => (
              <li key={d.day} className="flex flex-col items-center gap-2">
                <span className={cn("h-10 w-full rounded-full", DOT[d.status])} title={d.day} />
                <span className="text-muted text-[10px]">
                  {format.dateTime(new Date(`${d.day}T12:00:00`), { day: "numeric" })}
                </span>
              </li>
            ))}
          </ol>
          <div className="text-muted mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <Legend className="bg-text/80" label={t("legendFree")} />
            <Legend className="bg-accent" label={t("legendMine")} />
            <Legend className="bg-text/20" label={t("legendBooked")} />
            <Legend className="bg-warning/70" label={t("legendMaintenance")} />
          </div>
        </Card>

        {s.showFinances ? (
          <Card className="group flex flex-col">
            <CardTitle>{t("latestInvoice")}</CardTitle>
            {s.latestInvoice ? (
              <>
                <p className="tabular mt-4 text-3xl font-light tracking-tight">
                  {formatMoney(s.latestInvoice.totalCents, s.latestInvoice.currency, locale)}
                </p>
                <p className="text-muted mt-1 text-sm">
                  {s.latestInvoice.number} ·{" "}
                  {format.dateTime(new Date(`${s.latestInvoice.issuedOn}T12:00:00`), { dateStyle: "long" })}
                </p>
                <div className="mt-auto pt-6">
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/invoices">{t("seeInvoices")}</Link>
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted mt-4 text-sm">{t("latestInvoiceEmpty")}</p>
            )}
          </Card>
        ) : null}
      </div>
    </section>
  );
}

/** The cinematic top of the page: the aircraft, where it is, and the one thing that matters now. */
async function Hero({
  summary: s,
  live,
  greeting,
  showOwner,
  firstName,
}: {
  summary: ShareSummary;
  live: AircraftLive;
  greeting: boolean;
  showOwner: boolean;
  firstName: string;
}) {
  const t = await getTranslations("home");
  const tl = await getTranslations("live");
  const format = await getFormatter();
  const now = new Date();
  const model = shortModel(s.aircraft.model);
  const today = format.dateTime(now, { weekday: "long", day: "numeric", month: "long", timeZone: OPERATOR_TIME_ZONE });
  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });

  const [headline, subline] =
    live.state === "in_flight"
      ? [
          t("hero.flying", { model }),
          live.leg
            ? t("hero.flyingTo", {
                city: live.leg.to.city || live.leg.to.icao,
                time: live.leg.eta ? time(live.leg.eta) : "—",
              })
            : live.flightOf === "co_owner" && live.coOwnerName
              ? tl("coOwnerFlight", { name: live.coOwnerName })
              : null,
        ]
      : live.state === "maintenance"
        ? [
            t("hero.maintenance", { model }),
            s.nextMaintenance?.endsAt
              ? t("hero.maintenanceUntil", {
                  date: format.dateTime(s.nextMaintenance.endsAt, { day: "numeric", month: "long" }),
                })
              : null,
          ]
        : [
            t("hero.waiting", { model }),
            live.place ? t("hero.waitingAt", { city: live.place.city || live.place.icao }) : null,
          ];

  return (
    <header className="theme-dark relative isolate -mx-4 overflow-hidden sm:mx-0 sm:rounded-[28px]">
      <div className="relative h-[78vh] min-h-[540px] sm:h-[68vh] sm:max-h-[700px]">
        <Image
          src={heroPhoto(s.aircraft.model)}
          alt=""
          fill
          priority
          sizes="(min-width: 1400px) 1320px, 100vw"
          placeholder="blur"
          className="animate-ken-burns object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/20" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/10 to-transparent" aria-hidden />

        <div className="absolute inset-x-5 top-5 flex items-center justify-between gap-3 sm:inset-x-8 sm:top-8">
          <p className="border-glass-line bg-glass rounded-full border px-4 py-2 text-[11px] font-medium tracking-[0.18em] text-white/85 uppercase backdrop-blur-md">
            <span id={`share-${s.shareId}`}>{s.aircraft.registration}</span>
            <span className="text-white/45"> · {s.aircraft.model}</span>
          </p>
          <p className="hidden text-[11px] tracking-[0.18em] text-white/70 uppercase sm:block">
            {t("shareOf", { percent: format.number(s.percentageBp / 10000, { style: "percent" }) })}
            {showOwner ? ` · ${s.ownerName}` : ""}
          </p>
        </div>

        <div className="animate-rise absolute inset-x-5 bottom-7 sm:inset-x-10 sm:bottom-10">
          {greeting ? (
            <p className="eyebrow mb-4 text-white/70">
              {t(`greetings.${partOfDay(now)}`, { name: firstName })} ·{" "}
              <span className="first-letter:uppercase">{today}</span>
            </p>
          ) : null}
          <h1 className="max-w-3xl text-[2.6rem] leading-[1.02] font-light tracking-[-0.03em] text-white sm:text-7xl">
            {headline}
          </h1>
          {subline ? <p className="mt-4 max-w-2xl text-lg font-light text-white/80 sm:text-2xl">{subline}</p> : null}

          {live.state === "in_flight" && live.leg ? (
            <div className="mt-8 max-w-xl">
              <div className="flex items-center gap-4 text-xs font-medium tracking-[0.16em] text-white/80">
                <span>{live.leg.from.icao}</span>
                <div className="relative h-px flex-1 bg-white/25">
                  <div
                    className="absolute inset-y-0 left-0 bg-white"
                    style={{ width: `${Math.round(live.leg.progress * 100)}%` }}
                  />
                  <Plane
                    className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 text-white"
                    strokeWidth={1.5}
                    style={{ left: `${Math.round(live.leg.progress * 100)}%` }}
                    aria-hidden
                  />
                </div>
                <span>{live.leg.to.icao}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild variant="primary">
              <a href="#live" className="!bg-white !text-black">
                <LiveDot tone={live.state === "in_flight" ? "live" : "muted"} />
                {t("hero.follow")}
              </a>
            </Button>
            <div className="[&_a]:border-glass-line [&_a]:bg-white/10 [&_a]:text-white [&_a]:backdrop-blur-md [&_a:first-child]:bg-white/10">
              <ContactButtons />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-2 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}

/** Upcoming flights as routes, each with its date set large like a boarding pass. */
async function UpcomingFlights({ flights }: { flights: Awaited<ReturnType<typeof listOwnerFlights>>["upcoming"] }) {
  const t = await getTranslations("home");
  const phone = env.OPERATOR_PHONE.replace(/[^\d+]/g, "");
  const format = await getFormatter();
  const now = new Date();
  return (
    <Card className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <CardTitle>{t("upcomingTitle")}</CardTitle>
        <Link href="/flights" className="text-accent text-xs font-medium tracking-[0.04em] hover:underline">
          {t("allFlights")}
        </Link>
      </div>
      {flights.length === 0 ? (
        <p className="text-muted mt-6 text-sm">{t("nextFlightEmpty")}</p>
      ) : (
        <ul className="divide-border mt-4 divide-y">
          {flights.map((f) => {
            const flying = f.status === "scheduled" && f.departsAt <= now;
            return (
              <li key={f.id} className="flex items-center gap-5 py-5">
                <div className="border-border flex w-14 shrink-0 flex-col items-center rounded-[14px] border py-2">
                  <span className="text-muted text-[10px] font-medium tracking-[0.16em] uppercase">
                    {format.dateTime(f.departsAt, { month: "short" }).replace(".", "")}
                  </span>
                  <span className="tabular text-2xl font-light">
                    {format.dateTime(f.departsAt, { day: "numeric" })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 text-lg font-light tracking-wide">
                    <span>{f.fromAirport}</span>
                    <span className="bg-border relative h-px flex-1">
                      <Plane
                        className="text-muted absolute top-1/2 left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </span>
                    <span>{f.toAirport}</span>
                  </div>
                  <p className="text-muted mt-1 text-xs">
                    {flying ? (
                      <span className="text-live inline-flex items-center gap-1.5">
                        <LiveDot className="size-2" /> {t("inTheAir")}
                      </span>
                    ) : (
                      format.dateTime(f.departsAt, { weekday: "long", hour: "2-digit", minute: "2-digit" })
                    )}
                    {" · "}
                    {f.registration}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {/* An invitation, not an empty space: planning the next flight is one call away. */}
      <div className="border-border mt-auto flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-muted max-w-xs text-sm font-light">{t("planNext")}</p>
        {phone ? (
          <Button asChild variant="accent" size="sm">
            <a href={`tel:${phone}`}>{t("planNextCta")}</a>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** The people behind the aircraft, over a photograph of a toast in the cabin. */
async function TeamPanel() {
  const t = await getTranslations("home");
  const tt = await getTranslations("teamReach");
  return (
    <section className="theme-dark relative isolate flex min-h-[420px] flex-col justify-end overflow-hidden rounded-[22px]">
      <Image
        src={scenes.toast}
        alt=""
        fill
        sizes="(min-width: 1024px) 40vw, 100vw"
        placeholder="blur"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10" aria-hidden />
      <div className="relative p-7">
        <TeamFaces />
        <p className="eyebrow mt-6 text-white/70">{t("teamEyebrow")}</p>
        <h2 className="mt-2 text-3xl leading-tight font-light text-white">{tt("title")}</h2>
        <p className="mt-2 text-sm text-white/75">{tt("body")}</p>
        <div className="[&_a]:border-glass-line mt-6 [&_a:last-child]:bg-white/10 [&_a:last-child]:text-white">
          <ContactButtons />
        </div>
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

/** "Activité": what happened lately, as a quiet hairline list. */
async function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const t = await getTranslations("home");
  const tn = await getTranslations("notifications");
  const format = await getFormatter();
  return (
    <section aria-labelledby="activity">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 id="activity" className="flex items-center gap-3 text-2xl font-light tracking-tight">
          <LiveDot />
          {t("activityTitle")}
        </h2>
        <Link href="/notifications" className="text-accent text-xs font-medium tracking-[0.04em] hover:underline">
          {t("activityAll")}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-muted py-6 text-sm">{t("activityEmpty")}</p>
      ) : (
        <ul className="divide-border border-border divide-y border-t">
          {items.map((item) => {
            const [glyph, anim] =
              item.kind === "flight"
                ? [PlaneLanding, "drop" as IconMotion]
                : (NOTICE_ICON[item.type] ?? [Bell, "ring" as IconMotion]);
            const body =
              item.kind === "flight" ? (
                <>
                  {t("flightCompleted")}{" "}
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
                <span className={cn(item.unread && "text-text")}>{tn(`types.${item.type}`, item.data)}</span>
              );
            const row = (
              <>
                <span className="border-border relative flex size-10 shrink-0 items-center justify-center rounded-full border">
                  <Icon icon={glyph} anim={anim} className="size-4" />
                  {item.kind === "notice" && item.unread ? (
                    <span
                      className="bg-accent ring-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2"
                      aria-hidden
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug font-light">{body}</span>
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
                    className="group hover:bg-surface/60 -mx-3 flex items-center gap-4 rounded-[14px] px-3 py-4"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="group flex items-center gap-4 py-4">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** One quiet line of perspective under the instruments, instead of boxes of advice. */
async function InsightLine({ items }: { items: Insight[] }) {
  const t = await getTranslations("home.insights");
  const format = await getFormatter();
  const pct = (n: number) => format.number(n, { style: "percent", maximumFractionDigits: 0 });
  const month = (ym: string) =>
    format.dateTime(new Date(`${ym}-15T12:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
  const text = (i: Insight) =>
    i.kind === "hoursPace"
      ? t("hoursPace", { months: format.number(i.months, { maximumFractionDigits: 1 }), until: month(i.until) })
      : i.kind === "hoursUnused"
        ? t("hoursUnused")
        : t(i.tone === "warning" ? "budgetAhead" : "budgetOnTrack", {
            spent: pct(i.spentShare),
            year: pct(i.yearShare),
          });
  return (
    <ul aria-label={t("label")} className="-mt-4 flex flex-col gap-2">
      {items.map((i) => (
        <li
          key={i.kind}
          className={cn("text-[15px] font-light italic", i.tone === "warning" ? "text-warning" : "text-muted")}
        >
          {text(i)}
        </li>
      ))}
    </ul>
  );
}
