import { describe, expect, it } from "vitest";
import { utcToZonedLocal, zonedDay, zonedLocalToUtc } from "@/lib/time";

describe("Montreal local time ↔ UTC", () => {
  it("converts summer time (UTC−4)", () => {
    expect(zonedLocalToUtc("2026-07-15T08:30")!.toISOString()).toBe("2026-07-15T12:30:00.000Z");
  });

  it("converts winter time (UTC−5)", () => {
    expect(zonedLocalToUtc("2026-12-15T08:30")!.toISOString()).toBe("2026-12-15T13:30:00.000Z");
  });

  it("handles the days the clocks change", () => {
    // Clocks go back at 2:00 on Nov 1, 2026: 8:30 that morning is already winter time.
    expect(zonedLocalToUtc("2026-11-01T08:30")!.toISOString()).toBe("2026-11-01T13:30:00.000Z");
    // Clocks go forward at 2:00 on Mar 8, 2026: 8:30 is summer time.
    expect(zonedLocalToUtc("2026-03-08T08:30")!.toISOString()).toBe("2026-03-08T12:30:00.000Z");
  });

  it("round-trips", () => {
    for (const local of ["2026-01-02T00:00", "2026-07-15T23:59", "2026-11-01T08:30", "2026-03-08T12:00"]) {
      expect(utcToZonedLocal(zonedLocalToUtc(local)!)).toBe(local);
    }
  });

  it("gives the local day, not the UTC day", () => {
    expect(zonedDay(new Date("2026-07-16T02:00:00Z"))).toBe("2026-07-15");
  });

  it("rejects malformed input", () => {
    expect(zonedLocalToUtc("2026-02-30T10:00")).toBeNull();
    expect(zonedLocalToUtc("2026-13-01T10:00")).toBeNull();
    expect(zonedLocalToUtc("2026-01-01T24:00")).toBeNull();
    expect(zonedLocalToUtc("tomorrow")).toBeNull();
  });
});
