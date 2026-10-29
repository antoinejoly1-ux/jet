/**
 * The app speaks Canadian French and Canadian English. People choose "fr" or
 * "en" (cookie, profile); formatting runs as "fr-CA" / "en-CA" so dates,
 * times and numbers follow Québec and Canadian usage (« 14 h 30 », 2:30 p.m.).
 */
export type Lang = "fr" | "en";

/** "en-CA", "en" → "en"; anything else → "fr". */
export const lang = (locale: string | null | undefined): Lang => (locale?.startsWith("en") ? "en" : "fr");

/** "fr" → "fr-CA", "en" → "en-CA". */
export const localeTag = (locale: string | null | undefined) => (lang(locale) === "en" ? "en-CA" : "fr-CA");
