import { AlertTriangle, BarChart3, Building2, ChevronRight, MailPlus, Pencil, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SettingsNav } from "@/components/account/settings-nav";
import { History } from "@/components/admin/history";
import { AddBlockForm, RemoveBlockButton } from "@/components/admin/block-forms";
import { AddShareForm, EndShareForm } from "@/components/admin/share-forms";
import { RateForm } from "@/components/billing/rate-form";
import { ReserveBars } from "@/components/billing/reserve-bars";
import { ReserveTargetForm, ReserveWorkForm } from "@/components/billing/reserve-forms";
import { AircraftPhotoPicker } from "@/components/fleet/aircraft-photo-picker";
import { AvailabilityCalendar } from "@/components/operations/availability-calendar";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { aircraftPhotoUrl } from "@/lib/aircraft-photo-url";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { isMonth, monthRange } from "@/lib/availability-days";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { getAircraft } from "@/lib/services/aircraft";
import { getAvailability } from "@/lib/services/availability";
import { listManagers } from "@/lib/services/billing";
import { NotFoundError } from "@/lib/services/errors";
import { listFlights } from "@/lib/services/flights";
import { getHoldingCompany } from "@/lib/services/holding-companies";
import { listMaintenance } from "@/lib/services/maintenance";
import { listOwners } from "@/lib/services/owners";
import { hourlyTotal, listRates, perHour, RATE_PARTS } from "@/lib/services/rates";
import { getAircraftReserves } from "@/lib/services/reserves";
import { OPERATOR_TIME_ZONE, zonedDay } from "@/lib/time";
import {
  addBlockAction,
  addShareAction,
  endShareAction,
  payFromReserveAction,
  removeBlockAction,
  setAircraftPhotoAction,
  setRateAction,
  setReserveTargetAction,
} from "../actions";

export async function generateMetadata({ params }: PageProps<"/admin/aircraft/[id]">): Promise<Metadata> {
  const { id } = await params;
  const viewer = await requireStaff();
  const detail = await getAircraft(db, viewer, id).catch(() => null);
  return { title: detail?.aircraft.registration ?? "" };
}

const STATUS_TONE = { available: "success", flying: "accent", maintenance: "warning", inactive: "neutral" } as const;
const FLIGHT_TONE = { scheduled: "accent", completed: "success", cancelled: "neutral" } as const;
const JOB_TONE = {
  planned: "accent",
  in_progress: "warning",
  review: "warning",
  done: "success",
  cancelled: "neutral",
} as const;

/** One section of the aircraft page: a title, a line of context, then its content. */
function Section({ id, title, body, children }: { id: string; title: string; body?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <h2 id={`${id}-title`} className="text-2xl font-light tracking-tight">
        {title}
      </h2>
      {body ? <p className="text-muted mt-1.5 max-w-2xl text-sm leading-relaxed">{body}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Everything about one aircraft in one place: its owners (and inviting them),
 * the company that owns it, its rate and reserves, budgets and hours, flights,
 * maintenance and availability.
 */
export default async function AircraftDetailPage({ params, searchParams }: PageProps<"/admin/aircraft/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : zonedDay(new Date()).slice(0, 7);
  const ta = await getTranslations("availability");
  const t = await getTranslations("aircraft");
  const th = await getTranslations("aircraftHub");
  const tf = await getTranslations("flights");
  const tm = await getTranslations("maintenance");
  const tr = await getTranslations("rates");
  const tres = await getTranslations("reserves");
  const format = await getFormatter();
  const {
    aircraft: plane,
    shares,
    assignedBp,
    history,
  } = await getAircraft(db, viewer, id).catch((e) => (e instanceof NotFoundError ? notFound() : Promise.reject(e)));
  const canWrite = can(viewer, "fleet:write");
  const canOperate = can(viewer, "operations:write");
  const seesMoney = can(viewer, "finance:read");
  const canSetRate = can(viewer, "finance:write");
  const now = new Date();
  const { from, to } = monthRange(month);
  const [{ periods }, owners, [rates, reserves], company, managers, flights, jobs] = await Promise.all([
    getAvailability(db, viewer, id, from, to),
    canWrite ? listOwners(db, viewer) : Promise.resolve([]),
    seesMoney
      ? Promise.all([listRates(db, viewer, id), getAircraftReserves(db, viewer, id)])
      : Promise.resolve([[], null] as const),
    plane.holdingCompanyId ? getHoldingCompany(db, viewer, plane.holdingCompanyId).catch(() => null) : null,
    plane.holdingCompanyId ? listManagers(db, viewer, plane.holdingCompanyId) : Promise.resolve([]),
    listFlights(db, viewer, {
      from: new Date(now.getTime() - 60 * 86_400_000),
      to: new Date(now.getTime() + 60 * 86_400_000),
      aircraftId: id,
    }),
    listMaintenance(db, viewer, { aircraftId: id }),
  ]);
  const todayLocal = zonedDay(now);
  const current = rates.find((r) => r.effectiveFrom <= todayLocal) ?? null;
  const upcomingRates = rates.filter((r) => r.effectiveFrom > todayLocal);
  const cad = (cents: number) => formatMoney(cents, "CAD", viewer.locale);
  const dollars = (cents: number) => (cents / 100).toFixed(2).replace(".", viewer.locale === "fr" ? "," : ".");
  const active = shares.filter((s) => !s.endsOn || s.endsOn > todayLocal);
  const past = shares.filter((s) => s.endsOn && s.endsOn <= todayLocal);
  const pct = (bp: number) => format.number(bp / 10000, { style: "percent", maximumFractionDigits: 2 });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  const when = (d: Date) =>
    format.dateTime(d, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: OPERATOR_TIME_ZONE,
    });
  const upcomingFlights = flights.filter((f) => f.departsAt >= now && f.status === "scheduled").slice(0, 5);
  const recentFlights = flights
    .filter((f) => f.departsAt < now)
    .reverse()
    .slice(0, 5);
  const openJobs = jobs.open;
  const photoUrl = aircraftPhotoUrl(plane.id, plane.photoFileId);

  const sections = [
    { id: "owners", title: th("sections.owners") },
    { id: "company", title: th("sections.company") },
    ...(seesMoney ? [{ id: "rate", title: th("sections.rate") }] : []),
    { id: "flights", title: th("sections.flights") },
    { id: "maintenance", title: th("sections.maintenance") },
    { id: "availability", title: th("sections.availability") },
    { id: "history", title: th("sections.history") },
  ];

  return (
    <>
      {/* The aircraft itself, large. */}
      <div className="bg-surface-muted relative -mx-4 mb-8 h-80 overflow-hidden sm:mx-0 sm:h-72 sm:rounded-[28px] lg:h-80">
        <Image
          src={photoUrl ?? aircraftPhoto(plane.model)}
          unoptimized={Boolean(photoUrl)}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 1200px, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-5 text-white sm:p-7">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-white/80 uppercase">
              {[plane.model, plane.homeBase].filter(Boolean).join(" · ")}
            </p>
            <h1 className="mt-1 text-4xl font-light tracking-tight sm:text-5xl">{plane.registration}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[plane.status]} className="bg-surface/90 border-transparent">
              {t(`statuses.${plane.status}`)}
            </Badge>
            {canWrite ? <AircraftPhotoPicker save={setAircraftPhotoAction.bind(null, plane.id)} /> : null}
            {canWrite ? (
              <Button asChild size="sm" variant="glass">
                <Link href={`/admin/aircraft/${plane.id}/edit`}>
                  <Pencil aria-hidden />
                  {t("edit")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <SettingsNav label={th("sectionsLabel")} sections={sections} />

        <div className="flex min-w-0 flex-col gap-14">
          <Section id="owners" title={th("sections.owners")} body={th("ownersBody")}>
            {assignedBp !== 10_000 ? (
              <p className="text-warning mb-4 flex items-center gap-1.5 text-sm font-medium">
                <AlertTriangle className="size-4" aria-hidden />
                {t("assignedWarning", { percent: pct(assignedBp) })}
              </p>
            ) : null}
            {active.length === 0 ? (
              <p className="text-muted text-sm">{t("noShares")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {active.map((s) => (
                  <li key={s.id} className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.ownerName} image={s.ownerImage} className="size-12 text-sm" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/owners/${s.ownerId}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {s.ownerName}
                        </Link>
                        <p className="text-muted text-xs">
                          {s.annualHoursMinutes
                            ? t("perYear", { hours: formatHours(s.annualHoursMinutes, viewer.locale) })
                            : t("since", { date: day(s.startsOn) })}
                        </p>
                      </div>
                      <span className="tabular text-2xl font-light">{pct(s.percentageBp)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {s.logins === 0 && can(viewer, "owners:invite") ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href={`/admin/invitations?owner=${s.ownerId}`}>
                            <MailPlus aria-hidden />
                            {th("invite")}
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-muted text-xs">{th("logins", { count: s.logins })}</span>
                      )}
                      {seesMoney ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/admin/budgets?share=${s.id}`}>
                            <BarChart3 aria-hidden />
                            {th("budget")}
                          </Link>
                        </Button>
                      ) : null}
                      {canWrite ? (
                        <span className="ml-auto">
                          <EndShareForm action={endShareAction.bind(null, plane.id, s.id)} ownerName={s.ownerName} />
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {past.length > 0 ? (
              <details className="mt-4">
                <summary className="text-muted cursor-pointer text-sm">
                  {t("pastOwners", { count: past.length })}
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {past.map((s) => (
                    <li key={s.id} className="text-muted">
                      {s.ownerName} · {pct(s.percentageBp)} · {day(s.startsOn)} – {day(s.endsOn!)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {canWrite ? (
              <details className="border-border bg-surface mt-4 rounded-lg border p-5">
                <summary className="cursor-pointer text-sm font-medium">{t("addShareTitle")}</summary>
                <div className="mt-4">
                  <AddShareForm
                    action={addShareAction.bind(null, plane.id)}
                    owners={owners
                      .filter((o) => !active.some((s) => s.ownerId === o.id))
                      .map(({ id, legalName }) => ({ id, legalName }))}
                    remainingPercent={(10_000 - assignedBp) / 100}
                  />
                </div>
              </details>
            ) : null}
          </Section>

          <Section id="company" title={th("sections.company")} body={th("companyBody")}>
            {company ? (
              <Card>
                <div className="flex flex-wrap items-start gap-4">
                  <span className="border-border text-muted flex size-12 items-center justify-center rounded-full border">
                    <Building2 className="size-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/holding-companies/${company.company.id}`}
                      className="text-lg font-medium hover:underline"
                    >
                      {company.company.legalName}
                    </Link>
                    <p className="text-muted text-sm">
                      {[
                        company.company.registrationNumber ? `NEQ ${company.company.registrationNumber}` : null,
                        company.company.gstNumber || company.company.qstNumber
                          ? th("taxesRegistered")
                          : th("taxesNotRegistered"),
                        th("managers", { count: managers.length }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {company.aircraft.length > 1 ? (
                      <p className="text-muted mt-1 text-xs">
                        {th("alsoOwns", {
                          list: company.aircraft
                            .filter((a) => a.id !== plane.id)
                            .map((a) => a.registration)
                            .join(", "),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {seesMoney ? (
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/admin/holding-companies/${company.company.id}/results`}>{th("results")}</Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/holding-companies/${company.company.id}#billing`}>
                        {th("companyPage")}
                        <ChevronRight aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <p className="text-muted text-sm">
                {t("noHoldingCompany")}
                {canWrite ? (
                  <>
                    {" "}
                    <Link
                      href={`/admin/aircraft/${plane.id}/edit`}
                      className="text-accent underline underline-offset-4"
                    >
                      {th("chooseCompany")}
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </Section>

          {seesMoney ? (
            <Section id="rate" title={th("sections.rate")} body={tr("body")}>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  {current ? (
                    <>
                      <p className="flex flex-wrap items-baseline gap-x-3">
                        <span className="tabular text-4xl font-light tracking-tight">{cad(hourlyTotal(current))}</span>
                        <span className="text-muted text-sm">
                          {tr("perHour")} · {tr("since", { date: day(current.effectiveFrom) })}
                        </span>
                      </p>
                      <dl className="divide-border mt-5 divide-y text-sm">
                        {RATE_PARTS.map((p) => (
                          <div key={p} className="flex justify-between gap-4 py-2.5">
                            <dt className="text-muted">{tr(`parts.${p}`)}</dt>
                            <dd className="tabular font-medium">{cad(perHour(current, p))}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : (
                    <p className="text-muted text-sm">{tr("none")}</p>
                  )}
                  {upcomingRates.length ? (
                    <p className="text-muted mt-4 text-sm">
                      {upcomingRates
                        .map((r) => tr("upcoming", { date: day(r.effectiveFrom), total: cad(hourlyTotal(r)) }))
                        .join(" · ")}
                    </p>
                  ) : null}
                  {canSetRate ? (
                    <details className="border-border mt-6 border-t pt-5">
                      <summary className="cursor-pointer text-sm font-medium">{tr("setTitle")}</summary>
                      <div className="mt-4">
                        <RateForm
                          action={setRateAction.bind(null, plane.id)}
                          today={todayLocal}
                          defaults={
                            current ? Object.fromEntries(RATE_PARTS.map((p) => [p, dollars(perHour(current, p))])) : {}
                          }
                        />
                      </div>
                    </details>
                  ) : null}
                </Card>
                {reserves ? (
                  <Card id="reserves">
                    <CardTitle className="mb-1">{tres("title")}</CardTitle>
                    <p className="text-muted mb-5 text-sm">{tres("body")}</p>
                    <ReserveBars components={reserves.components} locale={viewer.locale} />
                    {reserves.history.length ? (
                      <details className="mt-6">
                        <summary className="text-muted cursor-pointer text-sm">{tres("movements")}</summary>
                        <ul className="divide-border mt-2 divide-y text-sm">
                          {reserves.history.map((h) => (
                            <li key={h.id} className="flex justify-between gap-4 py-2">
                              <span className="text-muted">
                                {day(h.occurredOn)} · {tres(`components.${h.component}`)} · {h.note}
                              </span>
                              <span className="tabular">{cad(h.amountCents)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {canSetRate ? (
                      <>
                        <details className="border-border mt-6 border-t pt-5">
                          <summary className="cursor-pointer text-sm font-medium">{tres("payTitle")}</summary>
                          <div className="mt-4">
                            <ReserveWorkForm action={payFromReserveAction.bind(null, plane.id)} today={todayLocal} />
                          </div>
                        </details>
                        <details className="border-border mt-4 border-t pt-5">
                          <summary className="cursor-pointer text-sm font-medium">{tres("targetTitle")}</summary>
                          <div className="mt-4">
                            <ReserveTargetForm action={setReserveTargetAction.bind(null, plane.id)} />
                          </div>
                        </details>
                      </>
                    ) : null}
                  </Card>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section id="flights" title={th("sections.flights")}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[
                { key: "upcoming", list: upcomingFlights },
                { key: "recent", list: recentFlights },
              ].map(({ key, list }) => (
                <Card key={key}>
                  <CardTitle className="mb-3">{th(`flights.${key}`)}</CardTitle>
                  {list.length === 0 ? (
                    <p className="text-muted text-sm">{th(`flights.${key}Empty`)}</p>
                  ) : (
                    <ul className="divide-border divide-y">
                      {list.map((f) => (
                        <li key={f.id}>
                          <Link
                            href={`/admin/flights/${f.id}`}
                            className="hover:bg-surface-muted/60 -mx-2 flex items-center gap-3 rounded-[12px] px-2 py-2.5"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                {f.fromAirport} → {f.toAirport}
                              </span>
                              <span className="text-muted block truncate text-xs first-letter:uppercase">
                                {when(f.departsAt)} · {f.ownerName ?? tf("noShare")}
                              </span>
                            </span>
                            <Badge tone={FLIGHT_TONE[f.status]}>{tf(`statuses.${f.status}`)}</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </Section>

          <Section id="maintenance" title={th("sections.maintenance")}>
            <Card>
              {openJobs.length === 0 ? (
                <p className="text-muted text-sm">{th("noJobs")}</p>
              ) : (
                <ul className="divide-border divide-y">
                  {openJobs.map((j) => (
                    <li key={j.id} className="flex items-center gap-3 py-2.5">
                      <Wrench className="text-muted size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{j.title}</span>
                        <span className="text-muted block text-xs">
                          {j.startsAt ? when(j.startsAt) : j.dueOn ? day(j.dueOn) : ""}
                        </span>
                      </span>
                      <Badge tone={JOB_TONE[j.status]}>{tm(`statuses.${j.status}`)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/maintenance">
                    {th("allMaintenance")}
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </Card>
          </Section>

          <Section id="availability" title={th("sections.availability")}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Card>
                <AvailabilityCalendar
                  month={month}
                  periods={periods}
                  hrefFor={(m) => `/admin/aircraft/${plane.id}?month=${m}#availability`}
                  periodAction={(p) =>
                    canOperate && p.blockId ? (
                      <RemoveBlockButton action={removeBlockAction.bind(null, plane.id, p.blockId)} />
                    ) : null
                  }
                />
              </Card>
              {canOperate ? (
                <Card>
                  <CardTitle className="mb-1">{ta("blockTitle")}</CardTitle>
                  <p className="text-muted mb-4 text-sm">{ta("blockBody")}</p>
                  <AddBlockForm action={addBlockAction.bind(null, plane.id)} />
                </Card>
              ) : null}
            </div>
          </Section>

          <Section id="history" title={th("sections.history")}>
            <Card>
              <History entries={history} />
            </Card>
          </Section>
        </div>
      </div>
    </>
  );
}
