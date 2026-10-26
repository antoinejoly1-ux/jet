import { describe, expect, it } from "vitest";
import { monthDays, monthRange, shiftMonth, type Period } from "@/lib/availability-days";

const period = (kind: Period["kind"], startsAt: string, endsAt: string, mine = false): Period => ({
  kind,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  mine,
  label: null,
  ownerName: null,
});

describe("availability calendar", () => {
  it("covers the month in Montreal time", () => {
    const { from, to } = monthRange("2026-11");
    expect(from.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(to.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(monthDays("2026-11", [])).toHaveLength(30);
    expect(monthDays("2028-02", [])).toHaveLength(29);
  });

  it("marks the local day a late-evening flight departs, not the UTC day", () => {
    // 22:00 in Montreal on July 15 is 02:00 UTC on July 16.
    const days = monthDays("2026-07", [period("booked", "2026-07-16T02:00:00Z", "2026-07-16T03:30:00Z")]);
    expect(days[14]!.status).toBe("booked");
    expect(days[15]!.status).toBe("free");
  });

  it("ranks maintenance over bookings and shows the viewer's own flights", () => {
    const days = monthDays("2026-07", [
      period("flight", "2026-07-10T14:00:00Z", "2026-07-10T16:00:00Z", true),
      period("booked", "2026-07-11T14:00:00Z", "2026-07-11T16:00:00Z"),
      period("maintenance", "2026-07-11T10:00:00Z", "2026-07-13T12:00:00Z"),
    ]);
    expect(days.slice(9, 14).map((d) => d.status)).toEqual([
      "mine",
      "maintenance",
      "maintenance",
      "maintenance",
      "free",
    ]);
  });

  it("moves between months", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
