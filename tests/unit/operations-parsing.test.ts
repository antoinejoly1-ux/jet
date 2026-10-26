import { describe, expect, it } from "vitest";
import { flightInput, parseDurationToMinutes } from "@/lib/validation/operations";

describe("block time", () => {
  it("reads hours:minutes and decimal hours in either locale", () => {
    expect(parseDurationToMinutes("2:15")).toBe(135);
    expect(parseDurationToMinutes("0:45")).toBe(45);
    expect(parseDurationToMinutes("2.25")).toBe(135);
    expect(parseDurationToMinutes("2,5")).toBe(150);
    expect(parseDurationToMinutes(" 3 ")).toBe(180);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "2:75", "-1", "1:2", "100"]) expect(parseDurationToMinutes(bad)).toBeNull();
  });
});

describe("flight input", () => {
  const base = {
    aircraftId: "0190f5b4-7a1e-7cc0-8a52-6d0f6f2b9c11",
    shareId: "",
    fromAirport: "cyul",
    toAirport: "kpbi",
    departsAt: "2026-12-20T09:00",
    arrivesAt: "",
  };

  it("reads Montreal local time and upper-cases airports", () => {
    const f = flightInput.parse(base);
    expect(f.departsAt.toISOString()).toBe("2026-12-20T14:00:00.000Z");
    expect([f.fromAirport, f.toAirport, f.shareId, f.arrivesAt]).toEqual(["CYUL", "KPBI", null, null]);
  });

  it("refuses an arrival before departure", () => {
    const r = flightInput.safeParse({ ...base, arrivesAt: "2026-12-20T08:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["arrivesAt"]);
  });
});
