import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { History } from "@/components/admin/history";
import { AddBlockForm, RemoveBlockButton } from "@/components/admin/block-forms";
import { AddShareForm, EndShareForm } from "@/components/admin/share-forms";
import { AvailabilityCalendar } from "@/components/operations/availability-calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { isMonth, monthRange } from "@/lib/availability-days";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { RateForm } from "@/components/billing/rate-form";
import { hourlyTotal, listRates, perHour, RATE_PARTS } from "@/lib/services/rates";
import { getAircraft } from "@/lib/services/aircraft";
import { getAvailability } from "@/lib/services/availability";
import { NotFoundError } from "@/lib/services/errors";
import { listOwners } from "@/lib/services/owners";
import { zonedDay } from "@/lib/time";
import {
  addBlockAction,
  addShareAction,
  endShareAction,
  payFromReserveAction,
  removeBlockAction,
  setRateAction,
  setReserveTargetAction,
} from "../actions";
import { ReserveBars } from "@/components/billing/reserve-bars";
import { ReserveTargetForm, ReserveWorkForm } from "@/components/billing/reserve-forms";
import { getAircraftReserves } from "@/lib/services/reserves";

export async function generateMetadata({ params }: PageProps<"/admin/aircraft/[id]">): Promise<Metadata> {
  const { id } = await params;
  const viewer = await requireStaff();
  const detail = await getAircraft(db, viewer, id).catch(() => null);
  return { title: detail?.aircraft.registration ?? "" };
}

const STATUS_TONE = { available: "success", flying: "accent", maintenance: "warning", inactive: "neutral" } as const;

export default async function AircraftDetailPage({ params, searchParams }: PageProps<"/admin/aircraft/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : zonedDay(new Date()).slice(0, 7);
  const ta = await getTranslations("availability");
  const t = await getTranslations("aircraft");
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
  const { from, to } = monthRange(month);
  const { periods } = await getAvailability(db, viewer, id, from, to);
  const owners = canWrite ? await listOwners(db, viewer) : [];
  const seesRates = can(viewer, "finance:read");
  const canSetRate = can(viewer, "finance:write");
  const [rates, reserves] = seesRates
    ? await Promise.all([listRates(db, viewer, id), getAircraftReserves(db, viewer, id)])
    : [[], null];
  const todayLocal = zonedDay(new Date());
  const current = rates.find((r) => r.effectiveFrom <= todayLocal) ?? null;
  const upcoming = rates.filter((r) => r.effectiveFrom > todayLocal);
  const cad = (cents: number) => formatMoney(cents, "CAD", viewer.locale);
  const dollars = (cents: number) => (cents / 100).toFixed(2).replace(".", viewer.locale === "fr" ? "," : ".");
  const today = new Date().toISOString().slice(0, 10);
  const active = shares.filter((s) => !s.endsOn || s.endsOn > today);
  const past = shares.filter((s) => s.endsOn && s.endsOn <= today);
  const pct = (bp: number) => format.number(bp / 10000, { style: "percent", maximumFractionDigits: 2 });
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  const complete = assignedBp === 10_000;

  return (
    <>
      <PageHeader
        title={plane.registration}
        description={[plane.model, plane.serialNumber, plane.homeBase].filter(Boolean).join(" · ")}
        actions={
          canWrite ? (
            <Button asChild size="sm">
              <Link href={`/admin/aircraft/${plane.id}/edit`}>
                <Pencil aria-hidden />
                {t("edit")}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={STATUS_TONE[plane.status]}>{t(`statuses.${plane.status}`)}</Badge>
        <span className={`tabular text-sm font-semibold ${complete ? "text-success" : "text-warning"}`}>
          {t("assigned", { percent: pct(assignedBp) })}
        </span>
        {!complete ? <span className="text-muted text-sm">{t("notComplete")}</span> : null}
        <span className="text-muted text-sm">
          {t("ownedBy")}{" "}
          {plane.holdingCompanyId ? (
            <Link
              href={`/admin/holding-companies/${plane.holdingCompanyId}`}
              className="text-text font-medium hover:underline"
            >
              {plane.holdingCompanyName}
            </Link>
          ) : (
            t("noHoldingCompany")
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle className="mb-3">{t("currentOwners")}</CardTitle>
          {active.length === 0 ? (
            <p className="text-muted text-sm">{t("noShares")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {active.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/owners/${s.ownerId}`} className="font-semibold hover:underline">
                      {s.ownerName}
                    </Link>
                    <p className="text-muted text-xs">
                      {t("since", { date: day(s.startsOn) })}
                      {s.annualHoursMinutes
                        ? ` · ${t("perYear", { hours: formatHours(s.annualHoursMinutes, viewer.locale) })}`
                        : ""}
                      {s.endsOn ? ` · ${t("endsOnDate", { date: day(s.endsOn) })}` : ""}
                    </p>
                  </div>
                  <span className="tabular text-xl font-light">{pct(s.percentageBp)}</span>
                  {canWrite && !s.endsOn ? (
                    <EndShareForm action={endShareAction.bind(null, plane.id, s.id)} ownerName={s.ownerName} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 ? (
            <details className="mt-4">
              <summary className="text-muted cursor-pointer text-sm">{t("pastOwners", { count: past.length })}</summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {past.map((s) => (
                  <li key={s.id} className="text-muted">
                    {s.ownerName} · {pct(s.percentageBp)} · {day(s.startsOn)} – {day(s.endsOn!)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>

        {canWrite ? (
          <Card>
            <CardTitle className="mb-4">{t("addShareTitle")}</CardTitle>
            <AddShareForm
              action={addShareAction.bind(null, plane.id)}
              owners={owners
                .filter((o) => !active.some((s) => s.ownerId === o.id))
                .map(({ id, legalName }) => ({ id, legalName }))}
              remainingPercent={(10_000 - assignedBp) / 100}
            />
          </Card>
        ) : null}

        <Card className={canOperate ? "lg:col-span-2" : "lg:col-span-3"} id="availability">
          <CardTitle className="mb-3">{ta("title")}</CardTitle>
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

        {seesRates ? (
          <Card className={canSetRate ? "lg:col-span-2" : "lg:col-span-3"} id="rate">
            <CardTitle className="mb-1">{tr("title")}</CardTitle>
            <p className="text-muted mb-5 text-sm">{tr("body")}</p>
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
                      <dt className="text-muted">
                        {tr(`parts.${p}`)}
                        {p !== "fuel" && p !== "pilot" ? (
                          <span className="text-muted/70 ml-2 text-xs">{tr("reserve")}</span>
                        ) : null}
                      </dt>
                      <dd className="tabular font-medium">{cad(perHour(current, p))}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-muted text-sm">{tr("none")}</p>
            )}
            {upcoming.length ? (
              <p className="text-muted mt-4 text-sm">
                {upcoming
                  .map((r) => tr("upcoming", { date: day(r.effectiveFrom), total: cad(hourlyTotal(r)) }))
                  .join(" · ")}
              </p>
            ) : null}
          </Card>
        ) : null}

        {canSetRate ? (
          <Card>
            <CardTitle className="mb-4">{tr("setTitle")}</CardTitle>
            <RateForm
              action={setRateAction.bind(null, plane.id)}
              today={todayLocal}
              defaults={current ? Object.fromEntries(RATE_PARTS.map((p) => [p, dollars(perHour(current, p))])) : {}}
            />
          </Card>
        ) : null}

        {reserves ? (
          <Card className={canSetRate ? "lg:col-span-2" : "lg:col-span-3"} id="reserves">
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
          </Card>
        ) : null}

        {reserves && canSetRate ? (
          <Card>
            <CardTitle className="mb-4">{tres("payTitle")}</CardTitle>
            <ReserveWorkForm action={payFromReserveAction.bind(null, plane.id)} today={todayLocal} />
            <div className="border-border mt-6 border-t pt-6">
              <CardTitle className="mb-4">{tres("targetTitle")}</CardTitle>
              <ReserveTargetForm action={setReserveTargetAction.bind(null, plane.id)} />
            </div>
          </Card>
        ) : null}

        <Card className="lg:col-span-3">
          <CardTitle className="mb-3">{t("history")}</CardTitle>
          <History entries={history} />
        </Card>
      </div>
    </>
  );
}
