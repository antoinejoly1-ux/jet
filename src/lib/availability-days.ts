/**
 * Turns taken periods into a month of calendar days in the operator's time
 * zone. Pure, so the calendar's colouring can be tested without a database.
 */
import { zonedLocalToUtc } from "@/lib/time";

export type Period = {
  kind: "flight" | "booked" | "maintenance";
  startsAt: Date;
  endsAt: Date;
  /** The viewer's own flight. */
  mine: boolean;
  /** Route or job title; null when the viewer may only know the time is taken. */
  label: string | null;
  ownerName: string | null;
  /** Set for manual blocks the viewer may remove. */
  blockId?: string;
};

export type DayStatus = "free" | "mine" | "booked" | "maintenance";
export type Day = { day: string; status: DayStatus; periods: Period[] };

const pad = (n: number) => String(n).padStart(2, "0");

/** Midnight at the start of a local day, as a UTC instant. */
export const dayStart = (day: string) => zonedLocalToUtc(`${day}T00:00`)!;

/** "2026-11" → its first instant and the first instant of the next month. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  return { from: dayStart(`${month}-01`), to: dayStart(`${next}-01`) };
}

export function isMonth(value: string | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Maintenance outranks a booking; the viewer's own flight shows as theirs. */
const RANK: Record<DayStatus, number> = { free: 0, mine: 1, booked: 2, maintenance: 3 };

function statusOf(p: Period): DayStatus {
  if (p.kind === "maintenance") return "maintenance";
  return p.mine ? "mine" : "booked";
}

/** Consecutive local days starting at `first` ("2026-11-03"). */
export function daysFrom(first: string, count: number, periods: readonly Period[]): Day[] {
  const days: Day[] = [];
  const [y, m, d] = first.split("-").map(Number) as [number, number, number];
  for (let i = 0; i < count; i++) {
    const at = new Date(Date.UTC(y, m - 1, d + i));
    const next = new Date(Date.UTC(y, m - 1, d + i + 1));
    const day = at.toISOString().slice(0, 10);
    const start = dayStart(day);
    const end = dayStart(next.toISOString().slice(0, 10));
    const overlapping = periods.filter((p) => p.startsAt < end && p.endsAt > start);
    const status = overlapping.reduce<DayStatus>((s, p) => (RANK[statusOf(p)] > RANK[s] ? statusOf(p) : s), "free");
    days.push({ day, status, periods: overlapping });
  }
  return days;
}

export function monthDays(month: string, periods: readonly Period[]): Day[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return daysFrom(`${month}-01`, new Date(Date.UTC(y, m, 0)).getUTCDate(), periods);
}
