"use client";

import { ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LiveDot } from "@/components/ui/live-dot";
import type { AircraftLive } from "@/lib/services/tracking";
import { cn } from "@/lib/utils";

const MapCanvas = dynamic(() => import("./map-canvas"), { ssr: false });
const POLL_MS = 20_000;

/** The back office's fleet map: every aircraft where it is now, with a list beside it. */
export function FleetLive({ initial }: { initial: AircraftLive[] }) {
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
      className="bg-surface shadow-card grid overflow-hidden rounded-lg border border-(--card-border) lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]"
    >
      <div className="bg-surface-muted relative h-80 sm:h-[28rem] lg:h-auto lg:min-h-[480px]">
        <MapCanvas
          aircraft={fleet}
          locale={locale}
          label={t("fleetTitle")}
          onSelect={(id) => router.push(`/admin/aircraft/${id}`)}
        />
      </div>
      <div className="flex flex-col p-5 sm:p-6">
        <p className="eyebrow flex items-center gap-2">
          <LiveDot tone={airborne ? "live" : "muted"} />
          {t("airborneCount", { count: airborne, total: fleet.length })}
        </p>
        <h2 id="fleet-live" className="mt-2 text-2xl font-bold">
          {t("fleetTitle")}
        </h2>
        <ul className="divide-border mt-4 divide-y">
          {fleet.map((a) => (
            <li key={a.aircraftId}>
              <Link
                href={`/admin/aircraft/${a.aircraftId}`}
                className="group hover:bg-surface-muted/60 -mx-3 flex items-center gap-3 rounded-[14px] px-3 py-3"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    a.state === "in_flight" ? "bg-live" : a.state === "maintenance" ? "bg-warning" : "bg-muted/50",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {a.registration} <span className="text-muted font-medium">· {a.model}</span>
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
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
