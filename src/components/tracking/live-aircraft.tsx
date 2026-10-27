"use client";

import { Gauge, MapPin, Mountain, Navigation, PlaneLanding, PlaneTakeoff, Wrench } from "lucide-react";
import dynamic from "next/dynamic";
import Image, { type StaticImageData } from "next/image";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { LiveDot } from "@/components/ui/live-dot";
import type { AircraftLive } from "@/lib/services/tracking";
import { cn } from "@/lib/utils";

/** How often the card asks where the aircraft is. The server answers from a 20 s cache. */
const POLL_MS = 15_000;

const MapCanvas = dynamic(() => import("./map-canvas"), { ssr: false });

/** Polls /api/live while the tab is visible, and ticks a clock for "seen 12 s ago" and the ETA. */
function useLive(initial: AircraftLive, side: "client" | "admin") {
  const [live, setLive] = useState(initial);
  // Starts at the server's clock so the first render matches the HTML; ticks from there.
  const [now, setNow] = useState(() => Date.parse(initial.generatedAt));
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/live/${initial.aircraftId}?side=${side}`, { cache: "no-store" });
        if (res.ok && !stopped) setLive((await res.json()) as AircraftLive);
      } catch {
        // Offline for a moment: keep showing the last answer.
      }
    };
    const timer = setInterval(poll, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial.aircraftId, side]);
  return { live, now };
}

function Metric({ icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string; hint?: string }) {
  return (
    <div className="group min-w-0">
      <dt className="text-muted flex items-center gap-1.5 text-xs font-medium">
        <Icon icon={icon} anim="bounce" className="size-3.5" />
        {label}
      </dt>
      <dd className="tabular mt-1 truncate text-lg font-semibold">
        {value}
        {hint ? <span className="text-muted block text-xs font-medium">{hint}</span> : null}
      </dd>
    </div>
  );
}

/**
 * "Where is my plane": the live map with a status panel beside it (below it
 * on phones). The map is fetched only once this card is on screen.
 */
export function LiveAircraft({
  initial,
  photo,
  side = "client",
  className,
}: {
  initial: AircraftLive;
  photo: StaticImageData;
  side?: "client" | "admin";
  className?: string;
}) {
  const t = useTranslations("live");
  const format = useFormatter();
  const locale = useLocale();
  const { live, now } = useLive(initial, side);
  const flying = live.state === "in_flight";
  const seenAgo = live.position ? Math.max(0, Math.round((now - Date.parse(live.position.seenAt)) / 1000)) : null;
  const eta = live.leg?.eta ? Date.parse(live.leg.eta) : null;
  const time = (ms: number) => format.dateTime(new Date(ms), { hour: "2-digit", minute: "2-digit" });
  const inMinutes = eta ? Math.max(0, Math.round((eta - now) / 60_000)) : null;

  const headline = flying
    ? live.leg
      ? `${live.leg.from.city || live.leg.from.icao} → ${live.leg.to.city || live.leg.to.icao}`
      : live.flightOf === "co_owner" && live.coOwnerName
        ? t("coOwnerFlight", { name: live.coOwnerName })
        : t("inFlight")
    : live.state === "maintenance"
      ? t("inMaintenance")
      : live.place
        ? t("onGroundAt", { city: live.place.city || live.place.icao })
        : t("unknown");

  const status = flying ? (live.stale ? t("signalLost") : t("states.in_flight")) : t(`states.${live.state}`);

  return (
    <section
      aria-labelledby={`live-${live.aircraftId}`}
      className={cn(
        "bg-surface shadow-card grid overflow-hidden rounded-lg border border-(--card-border) lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]",
        className,
      )}
    >
      <div className="bg-surface-muted relative h-72 sm:h-96 lg:h-auto lg:min-h-[440px]">
        {/* The photo shows while the map loads, and stays if WebGL isn't available. */}
        <Image
          src={photo}
          alt=""
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          placeholder="blur"
          className="object-cover opacity-90"
        />
        <div className="absolute inset-0">
          <MapCanvas
            aircraft={[live]}
            focusId={live.aircraftId}
            locale={locale}
            label={`${live.registration} · ${headline}`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <LiveDot tone={flying && !live.stale ? "live" : "muted"} />
            <span>{status}</span>
            <span aria-hidden>·</span>
            <span>{live.registration}</span>
          </p>
          <h2 id={`live-${live.aircraftId}`} className="mt-3 text-2xl leading-tight font-bold sm:text-3xl">
            {headline}
          </h2>
          {live.leg ? (
            <p className="text-muted mt-1 text-sm">
              {live.leg.from.icao} → {live.leg.to.icao}
            </p>
          ) : live.place && !flying ? (
            <p className="text-muted mt-1 text-sm">{live.place.name}</p>
          ) : null}
        </div>

        {live.leg ? (
          <div>
            <div className="text-muted mb-2 flex justify-between text-xs font-semibold">
              <span>{live.leg.from.icao}</span>
              <span>{live.leg.to.icao}</span>
            </div>
            <div className="bg-surface-muted relative h-1.5 rounded-full">
              <div
                className="bg-bronze absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000"
                style={{ width: `${Math.round(live.leg.progress * 100)}%` }}
              />
              <span
                className="bg-surface border-bronze absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[left] duration-1000"
                style={{ left: `${Math.round(live.leg.progress * 100)}%` }}
                aria-hidden
              />
            </div>
            <p className="sr-only">{t("progress", { percent: Math.round(live.leg.progress * 100) })}</p>
          </div>
        ) : null}

        {flying && live.position ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Metric
              icon={Mountain}
              label={t("altitude")}
              value={
                live.position.altitudeFt != null ? t("feet", { value: format.number(live.position.altitudeFt) }) : "—"
              }
            />
            <Metric
              icon={Gauge}
              label={t("speed")}
              value={live.position.groundSpeedKt != null ? t("knots", { value: live.position.groundSpeedKt }) : "—"}
            />
            <Metric
              icon={Navigation}
              label={t("heading")}
              value={live.position.headingDeg != null ? `${live.position.headingDeg}°` : "—"}
            />
            <Metric
              icon={PlaneLanding}
              label={t("arrival")}
              value={eta ? time(eta) : "—"}
              hint={
                inMinutes != null
                  ? t("inDuration", { hours: Math.floor(inMinutes / 60), minutes: inMinutes % 60 })
                  : undefined
              }
            />
          </dl>
        ) : live.nextFlight ? (
          <div className="group bg-surface-muted rounded-[18px] p-4">
            <p className="text-muted flex items-center gap-1.5 text-xs font-medium">
              <Icon icon={PlaneTakeoff} anim="plane" className="size-3.5" />
              {t("nextFlight")}
            </p>
            <p className="mt-1 font-semibold">
              {live.nextFlight.fromCode} → {live.nextFlight.toCode}
            </p>
            <p className="text-muted text-sm">
              {format.dateTime(new Date(live.nextFlight.departsAt), {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ) : live.state === "maintenance" ? (
          <p className="text-muted flex items-center gap-2 text-sm">
            <Wrench className="size-4" aria-hidden />
            {t("maintenanceBody")}
          </p>
        ) : (
          <p className="text-muted flex items-center gap-2 text-sm">
            <MapPin className="size-4" aria-hidden />
            {t("parkedBody")}
          </p>
        )}

        <p className="text-muted mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-live="off">
          {seenAgo != null ? (
            <span className="tabular">
              {seenAgo < 60
                ? t("seenSeconds", { seconds: seenAgo })
                : t("seenMinutes", { minutes: Math.round(seenAgo / 60) })}
            </span>
          ) : (
            <span>{t("noSignal")}</span>
          )}
          {live.source ? (
            <>
              <span aria-hidden>·</span>
              <span>{t(`sources.${live.source}`)}</span>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
