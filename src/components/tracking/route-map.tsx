"use client";

import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import type { AircraftLive } from "@/lib/services/tracking";
import { lang } from "@/lib/locale";

const MapCanvas = dynamic(() => import("./map-canvas"), { ssr: false });

/** One route on the map: a flight's two airports and, while it's in the air, where the aircraft is. */
export function RouteMap({ route, label }: { route: AircraftLive; label: string }) {
  const locale = lang(useLocale());
  return <MapCanvas aircraft={[route]} focusId={route.aircraftId} locale={locale} label={label} />;
}
