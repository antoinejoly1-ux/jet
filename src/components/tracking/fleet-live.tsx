"use client";

import { ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LiveDot } from "@/components/ui/live-dot";
import type { AircraftLive } from "@/lib/services/tracking";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { cn } from "@/lib/utils";
import { lang } from "@/lib/locale";

const MapCanvas = dynamic(() => import("./map-canvas"), { ssr: false });
const POLL_MS = 20_000;

/**
 * The back office's live view: the map with every aircraft where it is now,
 * and beside it the fleet, what's flying first, each with its photo.
 */
export function FleetLive({ initial }: { initial: AircraftLive[] }) {
  const t = useTranslations("live");
  const locale = lang(useLocale());
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
  // What's moving first, then what's unavailable, then what's parked, then what we can't see.
  const ORDER = { in_flight: 0, maintenance: 1, on_ground: 2, unknown: 3 } as const;
  const sorted = [...fleet].sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || a.registration.localeCompare(b.registration),
  );

  return (
    <section aria-labelledby="fleet-live" className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border-border bg-surface relative h-64 overflow-hidden rounded-[22px] border sm:h-80 lg:h-[440px]">
        <MapCanvas
          aircraft={fleet}
          locale={locale}
          label={t("fleetTitle")}
          onSelect={(id) => router.push(`/admin/aircraft/${id}`)}
        />
      </div>
      <div className="border-border bg-surface flex flex-col rounded-[22px] border p-5 lg:h-[440px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="fleet-live" className="text-lg font-light tracking-tight">
            {t("fleetTitle")}
          </h2>
          <p className="eyebrow flex items-center gap-2">
            <LiveDot tone={airborne ? "live" : "muted"} />
            {t("airborneCount", { count: airborne, total: fleet.length })}
          </p>
        </div>
        <ul className="mt-3 flex min-h-0 flex-col gap-1 overflow-y-auto">
          {sorted.map((a) => (
            <li key={a.aircraftId}>
              <Link
                href={`/admin/aircraft/${a.aircraftId}`}
                className="group hover:bg-surface-muted -mx-2 flex items-center gap-3 rounded-[14px] px-2 py-2"
              >
                <span className="relative size-12 shrink-0 overflow-hidden rounded-[12px]">
                  <Image src={a.photoUrl ?? aircraftPhoto(a.model)} alt="" fill sizes="48px" className="object-cover" />
                  <span
                    className={cn(
                      "ring-surface absolute right-1 bottom-1 size-2.5 rounded-full ring-2",
                      a.state === "in_flight" ? "bg-live" : a.state === "maintenance" ? "bg-warning" : "bg-muted",
                    )}
                    aria-hidden
                  />
                </span>
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
    </section>
  );
}
