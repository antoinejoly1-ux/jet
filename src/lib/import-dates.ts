/**
 * Dates in imported spreadsheets. ISO (2026-03-01) is never ambiguous; 01/03/2026
 * is the 1st of March in Quebec but January 3rd in a US export. The file tells
 * which when some day is above 12; otherwise finance is asked.
 */
export type DateOrder = "dmy" | "mdy";

const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** 2026-03-01, or day/month/year (or month/day/year) with / . or - → 2026-03-01. */
export function parseImportDate(input: string, order: DateOrder = "dmy"): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashed = s.match(SLASHED);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (slashed && order === "dmy") [d, m, y] = [Number(slashed[1]), Number(slashed[2]), Number(slashed[3])];
  else if (slashed) [m, d, y] = [Number(slashed[1]), Number(slashed[2]), Number(slashed[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Which order a column of dates is in: "dmy" or "mdy" when some value settles
 * it, "ambiguous" when every slashed date could be either (both parts ≤ 12 and
 * not equal), null when there's nothing to decide (ISO dates, or none).
 */
export function detectDateOrder(values: string[]): DateOrder | "ambiguous" | null {
  let dmy = false;
  let mdy = false;
  let ambiguous = false;
  for (const v of values) {
    const m = v.trim().match(SLASHED);
    if (!m) continue;
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) mdy = true;
    else if (a !== b) ambiguous = true;
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return ambiguous || (dmy && mdy) ? "ambiguous" : null;
}
