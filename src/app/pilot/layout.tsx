import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";
import { Toast } from "@/components/ui/toast";
import { requirePilot } from "@/lib/auth/session";
import { readFlash } from "@/lib/flash";

/**
 * The pilot's side: one column made for a phone on the ramp. Flights to
 * report and the reports sent, nothing about owners or money.
 */
export default async function PilotLayout({ children }: { children: ReactNode }) {
  const viewer = await requirePilot();
  const t = await getTranslations("pilot");
  const tToast = await getTranslations("toasts");
  const toast = await readFlash();
  return (
    <div className="min-h-dvh">
      <header className="bg-background/75 sticky top-0 z-30 grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 backdrop-blur-xl sm:px-6">
        <p className="eyebrow truncate">{t("side")}</p>
        <Link href="/pilot" className="text-text col-start-2 flex flex-col items-center gap-1">
          <Logo className="h-[18px] w-auto" title="Univair Management" />
        </Link>
        <div className="col-start-3 flex justify-end">
          <UserMenu name={viewer.name} email={viewer.email} image={viewer.image} settings={false} />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
        {children}
      </main>
      {toast ? <Toast id={toast} message={tToast(toast)} closeLabel={tToast("close")} /> : null}
    </div>
  );
}
