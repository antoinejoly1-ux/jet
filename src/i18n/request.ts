import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { localeTag } from "@/lib/locale";
import { OPERATOR_TIME_ZONE } from "@/lib/time";

export const LOCALES = ["fr", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "locale";

/**
 * French by default; the choice is a cookie so every page, signed in or not,
 * honours it. next-intl runs as fr-CA / en-CA so its formatting is Canadian;
 * use `lang()` from @/lib/locale to compare.
 */
export default getRequestConfig(async () => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = chosen === "en" ? "en" : "fr";
  return {
    locale: localeTag(locale),
    timeZone: OPERATOR_TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
