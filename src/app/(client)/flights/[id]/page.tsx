import { ChevronLeft, FileText, PlaneLanding, PlaneTakeoff, Timer, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { RouteLabel, routeText } from "@/components/flights/route-label";
import { RouteMap } from "@/components/tracking/route-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveDot } from "@/components/ui/live-dot";
import { Person } from "@/components/ui/person";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { airport } from "@/lib/airports";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { NotFoundError } from "@/lib/services/errors";
import { getOwnerFlightDetail } from "@/lib/services/flight-detail";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("flights") };
}

const STATUS_TONE = { scheduled: "accent", completed: "success", cancelled: "neutral" } as const;

/** One of the owner's flights: the route on the map, the times, who flew it and its invoice. */
export default async function OwnerFlightPage({ params }: PageProps<"/flights/[id]">) {
  const viewer = await requireAccess();
  const { id } = await params;
  const t = await getTranslations("ownerFlightDetail");
  const tf = await getTranslations("flights");
  const format = await getFormatter();
  const locale = await getLocale();
  const { flight, photoUrl, route, inAir, pilotName, pilotImage, reportedMinutes, invoiceId } =
    await getOwnerFlightDetail(db, viewer, id).catch((e) =>
      e instanceof NotFoundError ? notFound() : Promise.reject(e),
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
  const minutes =
    reportedMinutes ??
    flight.flightMinutes ??
    (flight.arrivesAt ? Math.round((flight.arrivesAt.getTime() - flight.departsAt.getTime()) / 60_000) : null);
  const place = (code: string) => airport(code)?.name ?? code;

  return (
    <>
      <Link
        href="/flights"
        className="text-muted hover:text-text mb-2 -ml-1 inline-flex h-11 items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <header className="mb-8 flex items-center gap-5">
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
            <span className="whitespace-nowrap">{flight.registration}</span>
            <span aria-hidden>·</span>
            <span>{flight.model}</span>
            {inAir ? (
              <span className="text-live flex items-center gap-1.5">
                <LiveDot tone="live" /> {t("inAir")}
              </span>
            ) : (
              <Badge tone={STATUS_TONE[flight.status]}>{tf(`statuses.${flight.status}`)}</Badge>
            )}
          </p>
          <h1 className="mt-2 text-3xl font-light tracking-tight sm:text-[2.6rem]">
            <RouteLabel from={flight.fromAirport} to={flight.toAirport} />
          </h1>
          <p className="text-muted mt-1 text-sm first-letter:uppercase">{when(flight.departsAt)}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="border-border bg-surface relative h-72 overflow-hidden rounded-[22px] border sm:h-96 lg:h-[460px]">
          {route ? (
            <RouteMap route={route} label={routeText(flight.fromAirport, flight.toAirport)} />
          ) : (
            <p className="text-muted flex h-full items-center justify-center text-sm">{t("noMap")}</p>
          )}
        </div>

        <Card>
          <dl className="flex flex-col gap-5 text-sm">
            <Fact icon={<PlaneTakeoff className="size-4" />} label={t("departure")}>
              {place(flight.fromAirport)} · {time(flight.departsAt)}
            </Fact>
            <Fact icon={<PlaneLanding className="size-4" />} label={t("arrival")}>
              {place(flight.toAirport)}
              {flight.arrivesAt ? ` · ${time(flight.arrivesAt)}` : ""}
            </Fact>
            <Fact icon={<Timer className="size-4" />} label={t("flightTime")}>
              {minutes != null ? formatHours(minutes, locale) : "—"}
              {flight.status === "scheduled" && minutes != null ? (
                <span className="text-muted"> · {t("planned")}</span>
              ) : null}
            </Fact>
            {pilotName ? (
              <Fact icon={<UserRound className="size-4" />} label={t("pilot")}>
                <Person name={pilotName} image={pilotImage} />
              </Fact>
            ) : null}
          </dl>
          <div className="border-border mt-6 flex flex-col gap-3 border-t pt-5">
            {invoiceId ? (
              <Button asChild variant="secondary">
                <Link href={`/invoices/${invoiceId}`}>
                  <FileText aria-hidden />
                  {t("invoice")}
                </Link>
              </Button>
            ) : null}
            <Link href="/messages" className="text-accent text-sm font-medium hover:underline">
              {t("question")}
            </Link>
          </div>
        </Card>
      </div>
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
