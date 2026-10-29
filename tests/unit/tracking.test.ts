import { describe, expect, it } from "vitest";
import { airport, nearestAirport } from "@/lib/airports";
import { arc, bearing, distanceKm, interpolate, project } from "@/lib/geo";
import { altitudeAt, demoProvider } from "@/lib/integrations/tracking/demo";
import { currentFlight, parseAeroPosition } from "@/lib/integrations/tracking/flightaware";
import { parseOpenSky } from "@/lib/integrations/tracking/opensky";

const CYHU = { lat: 45.5175, lon: -73.4169 };
const KPBI = { lat: 26.6832, lon: -80.0956 };

describe("great circles", () => {
  it("measures, interpolates and points the way", () => {
    expect(distanceKm(CYHU.lat, CYHU.lon, KPBI.lat, KPBI.lon)).toBeCloseTo(2177, 0);
    const mid = interpolate(CYHU, KPBI, 0.5);
    expect(distanceKm(CYHU.lat, CYHU.lon, mid.lat, mid.lon)).toBeCloseTo(1088, 0);
    expect(interpolate(CYHU, KPBI, 0)).toMatchObject({ lat: expect.closeTo(CYHU.lat, 6) });
    // Florida is south-south-west of Montreal.
    expect(bearing(CYHU, KPBI)).toBeGreaterThan(185);
    expect(bearing(CYHU, KPBI)).toBeLessThan(200);
    expect(arc(CYHU, KPBI, 10)).toHaveLength(11);
  });

  it("dead-reckons: 60 knots for an hour due north is one degree of latitude", () => {
    const p = project({ lat: 45, lon: -73 }, 0, 60, 3600);
    expect(p.lat).toBeCloseTo(46, 1);
    expect(p.lon).toBeCloseTo(-73, 5);
  });
});

describe("airports", () => {
  it("are found by code and by position", () => {
    expect(airport("cyhu")).toMatchObject({ icao: "CYHU", city: "Saint-Hubert" });
    expect(airport("ZZZZ")).toBeNull();
    expect(nearestAirport(45.52, -73.42)?.icao).toBe("CYHU");
    expect(nearestAirport(47.5, -60)).toBeNull();
  });
});

describe("OpenSky", () => {
  it("reads positions for our transponders only, in feet and knots", () => {
    const body = {
      time: 1793136900,
      states: [
        [
          "c05a1b",
          "CGJTA   ",
          "Canada",
          1793136890,
          1793136893,
          -75.1,
          43.2,
          7924.8,
          false,
          144.04,
          196.5,
          -2,
          null,
          8000,
          "1234",
          false,
          0,
        ],
        [
          "c0ffee",
          "OTHER   ",
          "Canada",
          1793136890,
          1793136893,
          -73,
          45,
          1000,
          false,
          100,
          90,
          0,
          null,
          0,
          null,
          false,
          0,
        ],
        ["c05a1c", null, "Canada", null, 1793136800, null, null, null, true, 0, null, null, null, null, null, false, 0],
      ],
    };
    const out = parseOpenSky(body, [
      { aircraftId: "a", registration: "C-GJTA", icaoHex: "C05A1B" },
      { aircraftId: "b", registration: "C-GJTB", icaoHex: "c05a1c" },
    ]);
    expect([...out.keys()]).toEqual(["a"]);
    expect(out.get("a")).toMatchObject({
      lat: 43.2,
      lon: -75.1,
      altitudeFt: 26000,
      groundSpeedKt: 280,
      headingDeg: 196.5,
      onGround: false,
      callsign: "CGJTA",
      seenAt: new Date(1793136890 * 1000),
    });
    expect(parseOpenSky({ time: 1, states: null }, []).size).toBe(0);
  });
});

describe("FlightAware", () => {
  it("picks the flight in the air and reads its position", () => {
    const flights = {
      flights: [
        {
          fa_flight_id: "old",
          ident: "CGJTA",
          actual_off: "2026-10-26T12:00:00Z",
          actual_on: "2026-10-26T15:00:00Z",
          estimated_on: null,
          origin: null,
          destination: null,
        },
        {
          fa_flight_id: "now",
          ident: "CGJTA",
          actual_off: "2026-10-27T13:05:00Z",
          actual_on: null,
          estimated_on: "2026-10-27T16:10:00Z",
          origin: { code_icao: "CYHU" },
          destination: { code_icao: "KPBI" },
        },
      ],
    };
    const flight = currentFlight(flights)!;
    expect(flight.fa_flight_id).toBe("now");
    const p = parseAeroPosition(flight, {
      last_position: {
        latitude: 40.1,
        longitude: -76.2,
        altitude: 260,
        groundspeed: 285,
        heading: 200,
        timestamp: "2026-10-27T14:00:00Z",
      },
    });
    expect(p).toMatchObject({
      altitudeFt: 26000,
      groundSpeedKt: 285,
      origin: "CYHU",
      destination: "KPBI",
      eta: new Date("2026-10-27T16:10:00Z"),
    });
    expect(currentFlight({ flights: [] })).toBeNull();
  });
});

describe("demo tracker", () => {
  it("flies the scheduled leg and parks the rest at home", async () => {
    const departsAt = new Date("2026-10-27T12:00:00Z");
    const arrivesAt = new Date("2026-10-27T16:00:00Z");
    const now = new Date("2026-10-27T14:00:00Z");
    const out = await demoProvider.positions(
      [
        { aircraftId: "flying", registration: "C-GJTA", icaoHex: null },
        { aircraftId: "parked", registration: "C-GJTB", icaoHex: null },
      ],
      {
        now,
        legs: new Map([
          ["flying", { from: { icao: "CYHU", ...CYHU }, to: { icao: "KPBI", ...KPBI }, departsAt, arrivesAt }],
        ]),
        homes: new Map([["parked", CYHU]]),
      },
    );
    const flying = out.get("flying")!;
    expect(flying).toMatchObject({
      onGround: false,
      altitudeFt: 26000,
      origin: "CYHU",
      destination: "KPBI",
      eta: arrivesAt,
    });
    expect(distanceKm(CYHU.lat, CYHU.lon, flying.lat, flying.lon)).toBeCloseTo(1088, 0);
    expect(out.get("parked")).toMatchObject({ ...CYHU, onGround: true });
    expect(altitudeAt(0)).toBe(0);
    expect(altitudeAt(0.06)).toBe(13000);
  });
});
