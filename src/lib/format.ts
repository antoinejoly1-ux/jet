/** Display helpers. Money is integer cents, durations are integer minutes. */

import { lang, localeTag } from "./locale";

export function formatMoney(cents: number, currency: "CAD" | "USD", locale: string): string {
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency }).format(cents / 100);
}

/** Whole dollars, for big headline numbers where cents are noise. */
export function formatMoneyRounded(cents: number, currency: "CAD" | "USD", locale: string): string {
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  );
}

/**
 * 1602 minutes → « 26 h 42 » (fr) or "26h 42m" (en): how owners and pilots
 * count time. Whole hours drop the minutes (« 68 h », "68h").
 */
export function formatHours(minutes: number, locale: string): string {
  const sign = minutes < 0 ? "−" : "";
  const total = Math.round(Math.abs(minutes));
  const h = new Intl.NumberFormat(localeTag(locale)).format(Math.floor(total / 60));
  const m = total % 60;
  if (lang(locale) === "en") return `${sign}${h}h${m ? ` ${String(m).padStart(2, "0")}m` : ""}`;
  return `${sign}${h}\u00a0h${m ? `\u00a0${String(m).padStart(2, "0")}` : ""}`;
}

/** 1602 minutes → "26,7 h": tenths of an hour, for statements and billing. */
export function formatHoursDecimal(minutes: number, locale: string): string {
  const hours = new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(minutes / 60);
  return `${hours}\u00a0h`;
}
