"use client";

import { ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { LiveDot } from "@/components/ui/live-dot";
import type { AircraftLive } from "@/lib/services/tracking";
import { cn } from "@/lib/utils";

const MapCanvas = dynamic(() => import("./map-canvas"), { ssr: false });
const POLL_MS = 20_000;

/**
 * The back office's hero: the night map edge to edge with every aircraft where
 * it is now, and a glass panel over it holding the page's headline and the fleet.
 */
export function FleetLive({ initial, header }: { initial: AircraftLive[]; header?: ReactNode }) {
  const t = useTranslations("live");
  const locale = useLocale();
  const router = useRouter();
  const [fleet, setFleet] = useState(initial);

  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (res.ok) setFleet((await res.json()) as AircraftLive[]);
      } catch {
        // Keep the last answer.
      }
    };
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const airborne = fleet.filter((a) => a.state === "in_flight").length;

  return (
    <section
      aria-labelledby="fleet-live"
      className="theme-dark border-border bg-background relative overflow-hidden rounded-[28px] border"
    >
      <div className="relative h-80 sm:h-[28rem] lg:h-[660px]">
        <MapCanvas
          aircraft={fleet}
          locale={locale}
          insetLeft={430}
          label={t("fleetTitle")}
          onSelect={(id) => router.push(`/admin/aircraft/${id}`)}
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-[520px] bg-gradient-to-r from-black/60 to-transparent lg:block"
          aria-hidden
        />
      </div>
      <div className="lg:border-glass-line lg:bg-glass-strong flex flex-col p-6 sm:p-8 lg:absolute lg:top-6 lg:bottom-6 lg:left-6 lg:w-[400px] lg:rounded-[22px] lg:border lg:p-7 lg:backdrop-blur-xl">
        {header}
        <div className={cn("flex min-h-0 flex-1 flex-col", header && "border-border mt-7 border-t pt-6")}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="fleet-live" className="text-lg font-light tracking-tight">
              {t("fleetTitle")}
            </h2>
            <p className="eyebrow flex items-center gap-2">
              <LiveDot tone={airborne ? "live" : "muted"} />
              {t("airborneCount", { count: airborne, total: fleet.length })}
            </p>
          </div>
          <ul className="divide-border mt-3 min-h-0 divide-y overflow-y-auto lg:-mr-3 lg:pr-3">
            {fleet.map((a) => (
              <li key={a.aircraftId}>
                <Link
                  href={`/admin/aircraft/${a.aircraftId}`}
                  className="group hover:bg-surface-muted/60 -mx-3 flex items-center gap-3 rounded-[14px] px-3 py-3"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      a.state === "in_flight" ? "bg-live" : a.state === "maintenance" ? "bg-warning" : "bg-muted/50",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {a.registration} <span className="text-muted font-normal">· {a.model}</span>
                    </span>
                    <span className="text-muted block truncate text-xs">
                      {a.state === "in_flight"
                        ? a.leg
                          ? `${t("states.in_flight")} · ${a.leg.from.icao} → ${a.leg.to.icao}`
                          : t("states.in_flight")
                        : a.state === "maintenance"
                          ? t("states.maintenance")
                          : a.place
                            ? t("onGroundAt", { city: a.place.icao })
                            : t("states.unknown")}
                    </span>
                  </span>
                  <ChevronRight
                    className="text-muted size-4 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
