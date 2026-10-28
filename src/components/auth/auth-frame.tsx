import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { env } from "@/lib/env";
import { AuthPhoto } from "./auth-backdrop";
import { formatPhone, telHref } from "@/lib/phone";

/**
 * Sign-in, sign-up and every account screen: the form on the app's own
 * background at left, the screen's photograph in a rounded panel at right
 * (a short band above the form on a phone). Follows the chosen theme.
 */
export async function AuthFrame({ children, corner }: { children: ReactNode; corner?: ReactNode }) {
  const t = await getTranslations("authFrame");
  const phone = env.OPERATOR_PHONE;
  return (
    <div className="bg-background text-text min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <AuthPhoto band />
      <div className="flex min-h-[calc(100dvh-9rem)] flex-col px-6 py-6 sm:px-12 lg:min-h-dvh lg:px-16 xl:px-24">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="text-text flex flex-col items-start gap-1">
            <Logo className="h-6 w-auto" title="Univair Management" />
            <span aria-hidden className="text-muted text-[8px] font-medium tracking-[0.55em] uppercase">
              Management
            </span>
          </Link>
          {corner}
        </header>
        <main id="main" className="flex flex-1 items-center py-10">
          <div className="animate-rise mx-auto w-full max-w-[400px] lg:mx-0">{children}</div>
        </main>
        <footer className="text-muted flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer")}</p>
          <p className="flex items-center gap-4">
            {phone ? (
              <a href={telHref(phone)} className="hover:text-text">
                {t("help", { phone: formatPhone(phone, await getLocale()) })}
              </a>
            ) : null}
            <Link href="/privacy" className="hover:text-text">
              {t("privacy")}
            </Link>
          </p>
        </footer>
      </div>
      <AuthPhoto />
    </div>
  );
}
