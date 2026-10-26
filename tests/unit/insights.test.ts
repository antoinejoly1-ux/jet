import { describe, expect, it } from "vitest";
import { insightsFor } from "@/lib/insights";

const july1 = new Date("2026-07-02T12:00:00Z"); // half the year gone

describe("at-a-glance insights", () => {
  it("projects how long hours last at this year's pace", () => {
    // 30 h used in 6 months = 5 h/month; 20 h left = 4 months, so into November.
    const [pace] = insightsFor({ now: july1, minutesRemaining: 1200, usedThisYearMinutes: 1800, budget: null });
    expect(pace).toEqual({ kind: "hoursPace", months: 4, until: "2026-11", tone: "warning" });
  });

  it("is calm when the hours outlast the year, and when none were used", () => {
    expect(
      insightsFor({ now: july1, minutesRemaining: 6000, usedThisYearMinutes: 600, budget: null })[0],
    ).toMatchObject({
      tone: "ok",
      until: "2031-07",
    });
    expect(insightsFor({ now: july1, minutesRemaining: 600, usedThisYearMinutes: 0, budget: null })).toEqual([
      { kind: "hoursUnused", tone: "ok" },
    ]);
  });

  it("flags spending well ahead of the calendar", () => {
    const ahead = insightsFor({
      now: july1,
      minutesRemaining: 0,
      usedThisYearMinutes: 0,
      budget: { plannedCents: 100_00, spentCents: 70_00 },
    });
    expect(ahead).toEqual([{ kind: "budgetPace", spentShare: 0.7, yearShare: 0.5, tone: "warning" }]);
    const onTrack = insightsFor({
      now: july1,
      minutesRemaining: 0,
      usedThisYearMinutes: 0,
      budget: { plannedCents: 100_00, spentCents: 55_00 },
    });
    expect(onTrack[0]).toMatchObject({ tone: "ok" });
  });
});
