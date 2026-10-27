/**
 * OpenSky Network: free ADS-B positions by transponder address. One request
 * covers the whole fleet. Works without an account (low daily quota); set
 * OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET for an account's quota.
 */
import type { LivePosition, TrackingProvider, TrackingTarget } from "./types";

const API = "https://opensky-network.org/api/states/all";
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const M_TO_FT = 3.28084;
const MS_TO_KT = 1.94384;

/** One row of OpenSky's `states` array, by index. */
type State = [
  icao24: string,
  callsign: string | null,
  originCountry: string,
  timePosition: number | null,
  lastContact: number,
  lon: number | null,
  lat: number | null,
  baroAltitudeM: number | null,
  onGround: boolean,
  velocityMs: number | null,
  trueTrack: number | null,
  ...rest: unknown[],
];

export function parseOpenSky(body: unknown, targets: TrackingTarget[]): Map<string, LivePosition> {
  const out = new Map<string, LivePosition>();
  const states = (body as { states?: State[] | null })?.states ?? [];
  const byHex = new Map(targets.filter((t) => t.icaoHex).map((t) => [t.icaoHex!.toLowerCase(), t.aircraftId]));
  for (const s of states) {
    const id = byHex.get(String(s[0]).toLowerCase());
    if (!id || s[5] == null || s[6] == null) continue;
    out.set(id, {
      lat: s[6],
      lon: s[5],
      altitudeFt: s[7] == null ? null : Math.round(s[7] * M_TO_FT),
      groundSpeedKt: s[9] == null ? null : Math.round(s[9] * MS_TO_KT),
      headingDeg: s[10],
      onGround: Boolean(s[8]),
      seenAt: new Date((s[3] ?? s[4]) * 1000),
      callsign: s[1]?.trim() || null,
      origin: null,
      destination: null,
      eta: null,
    });
  }
  return out;
}

let token: { value: string; expiresAt: number } | null = null;

async function bearer(fetchImpl: typeof fetch): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new Error(`OpenSky token: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

export function openSkyProvider(fetchImpl: typeof fetch = fetch): TrackingProvider {
  return {
    name: "opensky",
    async positions(targets) {
      const hexes = targets.map((t) => t.icaoHex?.toLowerCase()).filter((h): h is string => !!h);
      if (hexes.length === 0) return new Map();
      const url = `${API}?${hexes.map((h) => `icao24=${encodeURIComponent(h)}`).join("&")}`;
      const auth = await bearer(fetchImpl);
      const res = await fetchImpl(url, {
        headers: auth ? { authorization: `Bearer ${auth}` } : {},
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`OpenSky: HTTP ${res.status}`);
      return parseOpenSky(await res.json(), targets);
    },
  };
}
