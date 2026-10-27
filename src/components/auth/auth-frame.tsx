import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { env } from "@/lib/env";
import { AuthBackdrop } from "./auth-backdrop";

/**
 * Sign-in, sign-up and every account screen: a full-screen photograph, the
 * Univair wordmark centered above, and the form on frosted glass. Always
 * dark, whatever theme the person picks later.
 */
export async function AuthFrame({ children, corner }: { children: ReactNode; corner?: ReactNode }) {
  const t = await getTranslations("authFrame");
  const phone = env.OPERATOR_PHONE;
  return (
    <div className="theme-dark relative isolate flex min-h-dvh flex-col px-5 py-6 text-white sm:px-10 sm:py-8">
      <header className="relative flex items-center justify-center">
        <Link href="/" className="flex flex-col items-center gap-1.5 text-white">
          <Logo className="h-6 w-auto sm:h-7" title="Univair Management" />
          <span aria-hidden className="text-[9px] font-medium tracking-[0.55em] text-white/70 uppercase">
            Management
          </span>
        </Link>
        {corner ? <div className="absolute right-0">{corner}</div> : null}
      </header>
      <main id="main" className="flex flex-1 items-center justify-center py-10 lg:justify-between lg:gap-16 lg:px-6">
        <div className="animate-rise border-glass-line w-full max-w-[440px] rounded-[26px] border bg-black/55 p-7 backdrop-blur-2xl sm:p-10">
          {children}
        </div>
        <AuthBackdrop />
      </main>
      <footer className="flex flex-col items-center justify-between gap-2 text-xs text-white/60 sm:flex-row">
        <p>{t("footer")}</p>
        <p className="flex items-center gap-4">
          {phone ? (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="hover:text-white">
              {t("help", { phone })}
            </a>
          ) : null}
          <Link href="/privacy" className="hover:text-white">
            {t("privacy")}
          </Link>
        </p>
      </footer>
    </div>
  );
}
