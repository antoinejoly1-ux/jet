/** Display helpers. Money is integer cents, durations are integer minutes. */

import { localeTag } from "./locale";

export function formatMoney(cents: number, currency: "CAD" | "USD", locale: string): string {
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency }).format(cents / 100);
}

/** Whole dollars, for big headline numbers where cents are noise. */
export function formatMoneyRounded(cents: number, currency: "CAD" | "USD", locale: string): string {
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  );
}

/** 1602 minutes → "26,7 h" (fr) or "26.7 h" (en). */
export function formatHours(minutes: number, locale: string): string {
  const hours = new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(minutes / 60);
  return `${hours} h`;
}
