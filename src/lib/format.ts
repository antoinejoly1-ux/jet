/** Display helpers. Money is integer cents, durations are integer minutes. */

const localeTag = (locale: string) => (locale === "en" ? "en-CA" : "fr-CA");

export function formatMoney(cents: number, currency: "CAD" | "USD", locale: string): string {
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency }).format(cents / 100);
}

/** 1602 minutes → "26,7 h" (fr) or "26.7 h" (en). */
export function formatHours(minutes: number, locale: string): string {
  const hours = new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(minutes / 60);
  return `${hours} h`;
}
