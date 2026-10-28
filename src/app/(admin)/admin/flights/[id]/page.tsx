import {
  ChevronLeft,
  ClipboardCheck,
  FileText,
  Fuel,
  PlaneLanding,
  PlaneTakeoff,
  Timer,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { FlightRowActions } from "@/components/admin/flight-row-actions";
import { RouteMap } from "@/components/tracking/route-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { LiveDot } from "@/components/ui/live-dot";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { NotFoundError } from "@/lib/services/errors";
import { getFlightDetail } from "@/lib/services/flight-detail";
import { FLIGHT_STATUS_TONE, flightDisplayStatus } from "@/lib/flight-status";
import { OPERATOR_TIME_ZONE } from "@/lib/time";
import { cancelFlightAction, completeFlightAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("flightDetail"))("title") };
}

const REPORT_TONE = { submitted: "accent", returned: "warning", approved: "success" } as const;

/** A flight opened from the list: the route on the map, the times, and what the pilot reported. */
export default async function FlightDetailPage({ params }: PageProps<"/admin/flights/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const t = await getTranslations("flightDetail");
  const tf = await getTranslations("flights");
  const tr = await getTranslations("flightReports");
  const tp = await getTranslations("pilot.form");
  const format = await getFormatter();
  const { flight, photoUrl, route, inAir, report, expenses, seesMoney } = await getFlightDetail(db, viewer, id).catch(
    (e) => (e instanceof NotFoundError ? notFound() : Promise.reject(e)),
  );
  const when = (d: Date) =>
    format.dateTime(d, {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZone: OPERATOR_TIME_ZONE,
    });
  const time = (d: Date) => format.dateTime(d, { hour: "numeric", minute: "2-digit", timeZone: OPERATOR_TIME_ZONE });
  const canOperate = can(viewer, "operations:write");
  // The same status the list and the aircraft page show: « En vol », « À clôturer »…
  const shown = flightDisplayStatus(flight);
  const minutes =
    flight.flightMinutes ??
    (flight.arrivesAt ? Math.round((flight.arrivesAt.getTime() - flight.departsAt.getTime()) / 60_000) : null);

  return (
    <>
      <Link
        href="/admin/flights"
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-5">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-[18px]">
            <Image
              src={photoUrl ?? aircraftPhoto(flight.model)}
              unoptimized={Boolean(photoUrl)}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
            />
          </span>
          <div className="min-w-0">
            <p className="eyebrow flex flex-wrap items-center gap-2">
              <Link href={`/admin/aircraft/${flight.aircraftId}`} className="hover:underline">
                {flight.registration}
              </Link>
              <span aria-hidden>·</span>
              <span>{flight.model}</span>
              {inAir ? (
                <span className="text-live flex items-center gap-1.5">
                  <LiveDot tone="live" /> {t("inAir")}
                </span>
              ) : (
                <Badge tone={FLIGHT_STATUS_TONE[shown]}>{tf(`statuses.${shown}`)}</Badge>
              )}
            </p>
            <h1 className="mt-2 text-3xl font-light tracking-tight sm:text-[2.6rem]">
              {flight.fromAirport} <span className="text-muted">→</span> {flight.toAirport}
            </h1>
            <p className="text-muted mt-1 text-sm first-letter:uppercase">{when(flight.departsAt)}</p>
          </div>
        </div>
        {canOperate ? (
          <div className="flex flex-wrap gap-2">
            <FlightRowActions
              id={flight.id}
              status={flight.status}
              departed={flight.departsAt <= new Date()}
              complete={completeFlightAction.bind(null, flight.id)}
              cancel={cancelFlightAction.bind(null, flight.id)}
              plannedMinutes={minutes}
              ownerName={flight.ownerName}
            />
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="border-border bg-surface relative h-72 overflow-hidden rounded-[22px] border sm:h-96 lg:h-[460px]">
          {route ? (
            <RouteMap route={route} label={`${flight.fromAirport} → ${flight.toAirport}`} />
          ) : (
            <p className="text-muted flex h-full items-center justify-center text-sm">{t("noMap")}</p>
          )}
        </div>

        <Card>
          <CardTitle className="mb-4">{t("summary")}</CardTitle>
          <dl className="flex flex-col gap-4 text-sm">
            <Fact icon={<PlaneTakeoff className="size-4" />} label={t("departure")}>
              {flight.fromAirport} · {time(flight.departsAt)}
            </Fact>
            <Fact icon={<PlaneLanding className="size-4" />} label={t("arrival")}>
              {flight.arrivesAt ? `${flight.toAirport} · ${time(flight.arrivesAt)}` : flight.toAirport}
            </Fact>
            <Fact icon={<Timer className="size-4" />} label={t("flightTime")}>
              {minutes != null ? formatHours(minutes, viewer.locale) : "—"}
              {flight.status === "scheduled" && minutes != null ? (
                <span className="text-muted"> · {t("planned")}</span>
              ) : null}
            </Fact>
            <Fact icon={<UserRound className="size-4" />} label={t("billedTo")}>
              {flight.ownerName ?? tf("noShare")}
            </Fact>
          </dl>
        </Card>
      </div>

      <section aria-labelledby="report-title" className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="report-title" className="text-2xl font-light tracking-tight">
            {t("reportTitle")}
          </h2>
          {report && seesMoney ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href={`/admin/flight-reports/${report.id}`}>
                  <ClipboardCheck aria-hidden />
                  {t("openReport")}
                </Link>
              </Button>
              {report.invoiceId ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/admin/invoices/${report.invoiceId}`}>
                    <FileText aria-hidden />
                    {t("openInvoice")}
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!report ? (
          <p className="border-border text-muted rounded-lg border px-6 py-10 text-center text-sm">
            {flight.status === "cancelled" ? t("noReportCancelled") : t("noReport")}
          </p>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={REPORT_TONE[report.status]}>{tr(`statuses.${report.status}`)}</Badge>
              <span className="text-muted text-sm">
                {t("filedBy", {
                  pilot: report.pilotName ?? tr("unknownPilot"),
                  date: format.dateTime(report.submittedAt, { dateStyle: "medium", timeZone: OPERATOR_TIME_ZONE }),
                })}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-muted text-xs">{tp("flightTime")}</dt>
                <dd className="tabular mt-1 text-2xl font-light">{formatHours(report.flightMinutes, viewer.locale)}</dd>
              </div>
              <div>
                <dt className="text-muted flex items-center gap-1 text-xs">
                  <Fuel className="size-3" aria-hidden /> {tp("fuelLitres")}
                </dt>
                <dd className="tabular mt-1 text-2xl font-light">{report.fuelLitres ?? "—"}</dd>
              </div>
            </dl>
            {report.notes ? <p className="text-muted mt-4 text-sm whitespace-pre-line">{report.notes}</p> : null}
            {expenses.length ? (
              <ul className="divide-border border-border mt-5 divide-y border-t">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 py-3">
                    {e.receiptFileId ? (
                      <a
                        href={`/files/${e.receiptFileId}?inline=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="border-border bg-surface-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border"
                        aria-label={tr("openReceipt", { category: tp(`categories.${e.category}`) })}
                      >
                        {e.receiptType?.startsWith("image/") ? (
                          // A signed, short-lived link: next/image can't optimise it.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/files/${e.receiptFileId}?inline=1`} alt="" className="size-full object-cover" />
                        ) : (
                          <FileText className="text-muted size-5" aria-hidden />
                        )}
                      </a>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{tp(`categories.${e.category}`)}</p>
                      <p className="text-muted text-xs">
                        {tp(`payers.${e.paidBy}`)}
                        {e.note ? ` · ${e.note}` : ""}
                      </p>
                    </div>
                    {e.amountCents != null ? (
                      <span className="tabular text-sm">{formatMoney(e.amountCents, "CAD", viewer.locale)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        )}
      </section>
    </>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted mt-0.5" aria-hidden>
        {icon}
      </span>
      <div>
        <dt className="text-muted text-xs">{label}</dt>
        <dd className="mt-0.5 font-medium">{children}</dd>
      </div>
    </div>
  );
}
