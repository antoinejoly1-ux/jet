"use client";

import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { arc, project } from "@/lib/geo";
import type { AircraftLive } from "@/lib/services/tracking";

/**
 * The MapLibre map itself: OpenFreeMap vector tiles tinted to Univair's paper
 * and bronze, a plane marker per aircraft turned to its heading, and the
 * route as a great-circle arc (flown part solid, the rest dashed). Between
 * polls each airborne plane keeps moving along its heading at its speed.
 * Loaded only where a map is shown (next/dynamic), so other pages never pay
 * for MapLibre.
 */

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
/** Dead reckoning stops after this long without news, so a lost signal doesn't fly on forever. */
const MAX_EXTRAPOLATE_S = 120;

const PLANE_SVG = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M16 2.5c1.1 0 1.9 1.3 1.9 3.1v7.1l10.6 6.4v2.6l-10.6-3.2v6.1l3.3 2.6v2.2L16 28.2l-5.2 1.2v-2.2l3.3-2.6v-6.1L3.5 21.7v-2.6l10.6-6.4V5.6c0-1.8.8-3.1 1.9-3.1z" fill="currentColor" stroke="white" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Warm the base map to the brand: paper land, soft water, quiet labels in the viewer's language. */
function tint(map: MapLibreMap, dark: boolean, locale: string) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "symbol" && layer.layout?.["text-field"] && !layer.id.startsWith("route-"))
      map.setLayoutProperty(layer.id, "text-field", [
        "coalesce",
        ["get", `name:${locale}`],
        ["get", "name:latin"],
        ["get", "name"],
      ]);
    if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", dark ? "#11100e" : "#f3f1ed");
    else if (layer.type === "fill" && layer.id.includes("water"))
      map.setPaintProperty(layer.id, "fill-color", dark ? "#070706" : "#dfe2e0");
    else if (layer.type === "fill" && /park|wood|glacier|ice/.test(layer.id))
      map.setPaintProperty(layer.id, "fill-color", dark ? "#1a1917" : "#ebe8e1");
    else if (layer.type === "raster") map.setLayoutProperty(layer.id, "visibility", "none");
  }
}

function displayed(a: AircraftLive, nowMs: number) {
  const p = a.position!;
  if (a.state !== "in_flight" || !p.groundSpeedKt || p.headingDeg == null || a.stale || reducedMotion())
    return { lat: p.lat, lon: p.lon };
  const seconds = Math.min(MAX_EXTRAPOLATE_S, Math.max(0, (nowMs - Date.parse(p.seenAt)) / 1000));
  return project(p, p.headingDeg, p.groundSpeedKt, seconds);
}

type Feature = {
  type: "Feature";
  properties: Record<string, string>;
  geometry: { type: "LineString"; coordinates: [number, number][] } | { type: "Point"; coordinates: [number, number] };
};

function routeData(list: AircraftLive[], nowMs: number): { type: "FeatureCollection"; features: Feature[] } {
  const features: Feature[] = [];
  for (const a of list) {
    if (!a.leg) continue;
    const here = a.position && a.state === "in_flight" ? displayed(a, nowMs) : null;
    if (here) {
      features.push({
        type: "Feature",
        properties: { part: "flown" },
        geometry: { type: "LineString", coordinates: arc(a.leg.from, here, 48) },
      });
      features.push({
        type: "Feature",
        properties: { part: "ahead" },
        geometry: { type: "LineString", coordinates: arc(here, a.leg.to, 48) },
      });
    } else {
      features.push({
        type: "Feature",
        properties: { part: "ahead" },
        geometry: { type: "LineString", coordinates: arc(a.leg.from, a.leg.to, 64) },
      });
    }
    for (const end of [a.leg.from, a.leg.to])
      features.push({
        type: "Feature",
        properties: { part: "airport", code: end.icao },
        geometry: { type: "Point", coordinates: [end.lon, end.lat] },
      });
  }
  return { type: "FeatureCollection", features };
}

function frame(map: MapLibreMap, list: AircraftLive[], focusId?: string, insetLeft = 0) {
  const focus = list.filter((a) => !focusId || a.aircraftId === focusId);
  const points: [number, number][] = [];
  for (const a of focus) {
    if (a.position) points.push([a.position.lon, a.position.lat]);
    else if (a.place) points.push([a.place.lon, a.place.lat]);
    if (a.leg) points.push([a.leg.from.lon, a.leg.from.lat], [a.leg.to.lon, a.leg.to.lat]);
  }
  if (points.length === 0) return;
  const bounds = points.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
  const single = points.every((p) => p[0] === points[0]![0] && p[1] === points[0]![1]);
  // A panel floating over the map's left side on wide screens: keep the aircraft clear of it.
  const left = 60 + (matchMedia("(min-width: 1024px)").matches ? insetLeft : 0);
  const padding = { top: 60, bottom: 60, left, right: 60 };
  if (single) map.jumpTo({ center: points[0], zoom: 9, padding });
  else map.fitBounds(bounds, { padding, maxZoom: 9, duration: 0 });
}

export default function MapCanvas({
  aircraft,
  focusId,
  label,
  locale = "fr",
  insetLeft = 0,
  onSelect,
}: {
  aircraft: AircraftLive[];
  /** Language of the place names. */
  locale?: string;
  focusId?: string;
  /** Width (px) of a panel covering the map's left side from 1024px up. */
  insetLeft?: number;
  /** Text equivalent of the map, for screen readers. */
  label: string;
  onSelect?: (aircraftId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const data = useRef(aircraft);
  const framed = useRef(false);

  useEffect(() => {
    data.current = aircraft;
  }, [aircraft]);

  useEffect(() => {
    if (!box.current) return;
    // The map follows the page: the night style in "Hangar Night", the paper style otherwise.
    const theme = document.documentElement.dataset.theme;
    const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const map = new maplibregl.Map({
      container: box.current,
      style: dark ? STYLE.dark : STYLE.light,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      // The gesture hints in the page's language, not MapLibre's English.
      locale: gestureHints(document.documentElement.lang),
      dragRotate: false,
      pitchWithRotate: false,
      center: [-73.42, 45.52],
      zoom: 5,
      fadeDuration: 0,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    // The night style names a few POI icons its sprite lacks; a blank stands in rather than a console warning.
    map.on("styleimagemissing", (e) => {
      if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    const bronze = css("--bronze") || "#9c7247";
    map.on("load", () => {
      tint(map, dark, locale);
      map.addSource("route", { type: "geojson", data: routeData(data.current, Date.now()) });
      map.addLayer({
        id: "route-ahead",
        type: "line",
        source: "route",
        filter: ["==", ["get", "part"], "ahead"],
        paint: { "line-color": bronze, "line-width": 2, "line-opacity": 0.55, "line-dasharray": [2, 2.5] },
      });
      map.addLayer({
        id: "route-flown",
        type: "line",
        source: "route",
        filter: ["==", ["get", "part"], "flown"],
        paint: { "line-color": bronze, "line-width": 3 },
        layout: { "line-cap": "round" },
      });
      map.addLayer({
        id: "route-airports",
        type: "circle",
        source: "route",
        filter: ["==", ["get", "part"], "airport"],
        paint: {
          "circle-radius": 5,
          "circle-color": dark ? "#121110" : "#ffffff",
          "circle-stroke-color": bronze,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "route-airport-codes",
        type: "symbol",
        source: "route",
        filter: ["==", ["get", "part"], "airport"],
        layout: {
          "text-field": ["get", "code"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-offset": [0, 1.3],
          "text-letter-spacing": 0.08,
        },
        paint: {
          "text-color": dark ? "#f3f1ed" : "#171615",
          "text-halo-color": dark ? "#121110" : "#ffffff",
          "text-halo-width": 1.5,
        },
      });
      frame(map, data.current, focusId, insetLeft);
      framed.current = true;
    });

    // Keep planes moving between polls; about one update a second is smooth at map scale.
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 900) return;
      last = t;
      const now = Date.now();
      const seen = new Set<string>();
      for (const a of data.current) {
        if (!a.position) continue;
        seen.add(a.aircraftId);
        const at = displayed(a, now);
        let marker = markers.current.get(a.aircraftId);
        if (!marker) {
          const el = document.createElement(onSelect ? "button" : "div");
          el.className = "um-plane";
          el.innerHTML = `<span class="um-plane-halo"></span><span class="um-plane-icon">${PLANE_SVG}</span><span class="um-plane-tag">${a.registration}</span>`;
          if (onSelect) {
            el.setAttribute("aria-label", a.registration);
            el.addEventListener("click", () => onSelect(a.aircraftId));
          } else el.setAttribute("aria-hidden", "true");
          marker = new maplibregl.Marker({ element: el, rotationAlignment: "map" })
            .setLngLat([at.lon, at.lat])
            .addTo(map);
          markers.current.set(a.aircraftId, marker);
        }
        marker.setLngLat([at.lon, at.lat]);
        const el = marker.getElement();
        el.dataset.state = a.state;
        const icon = el.querySelector<HTMLElement>(".um-plane-icon");
        if (icon) icon.style.transform = `rotate(${a.position.headingDeg ?? 0}deg)`;
      }
      for (const [id, m] of markers.current)
        if (!seen.has(id)) {
          m.remove();
          markers.current.delete(id);
        }
      const source = map.getSource("route") as GeoJSONSource | undefined;
      source?.setData(routeData(data.current, now));
    };
    raf = requestAnimationFrame(tick);

    const all = markers.current;
    return () => {
      cancelAnimationFrame(raf);
      all.clear();
      map.remove();
      mapRef.current = null;
    };
    // The map is built once; later data arrives through `data`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={box} role="region" aria-label={label} className="um-map size-full" />;
}

/** MapLibre's "use two fingers / Ctrl + scroll" hints, in French on the French site. */
function gestureHints(lang: string): Record<string, string> {
  if (!lang.startsWith("fr")) return {};
  return {
    "CooperativeGesturesHandler.WindowsHelpText": "Utilisez Ctrl + molette pour zoomer sur la carte",
    "CooperativeGesturesHandler.MacHelpText": "Utilisez ⌘ + molette pour zoomer sur la carte",
    "CooperativeGesturesHandler.MobileHelpText": "Utilisez deux doigts pour déplacer la carte",
  };
}
