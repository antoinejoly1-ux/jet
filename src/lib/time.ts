/**
 * Times are stored in UTC and typed and shown in the operator's time zone.
 * These helpers convert a form's "2026-11-01T08:30" (no zone) to and from
 * UTC, correctly across daylight-saving changes, without a date library.
 */
export const OPERATOR_TIME_ZONE = "America/Montreal";

/** Minutes the zone is ahead of UTC at this instant (Montreal: -240 in summer, -300 in winter). */
function offsetMinutes(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-11-01T08:30" in the operator's zone → the UTC instant. Null when malformed. */
export function zonedLocalToUtc(local: string, zone = OPERATOR_TIME_ZONE): Date | null {
  const m = LOCAL.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23) return null;
  // Guess with the offset at the naive instant, then correct once if a DST change sits in between.
  let utc = naive - offsetMinutes(new Date(naive), zone) * 60_000;
  const corrected = naive - offsetMinutes(new Date(utc), zone) * 60_000;
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

/** A UTC instant → "2026-11-01T08:30" in the operator's zone, for datetime-local inputs. */
export function utcToZonedLocal(at: Date, zone = OPERATOR_TIME_ZONE): string {
  const shifted = new Date(at.getTime() + offsetMinutes(at, zone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** The calendar day ("2026-11-01") an instant falls on in the operator's zone. */
export function zonedDay(at: Date, zone = OPERATOR_TIME_ZONE): string {
  return utcToZonedLocal(at, zone).slice(0, 10);
}
