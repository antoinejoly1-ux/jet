import Image from "next/image";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ProductMark } from "@/components/brand/logo";
import hangar from "../../../public/images/hangar-pc12.webp";

/**
 * Sign-in, sign-up and the other account screens: the form on paper, and from
 * 1024px a full-height photograph of a Univair PC-12 beside it.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("brand");
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex min-h-dvh flex-col px-5 py-8 sm:px-10">
        <ProductMark />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="animate-rise bg-surface shadow-card w-full max-w-sm rounded-lg border border-(--card-border) p-6 sm:p-8">
            {children}
          </div>
        </div>
        <p className="text-muted text-xs">{t("footer")}</p>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <Image src={hangar} alt="" fill priority sizes="55vw" placeholder="blur" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
        <div className="absolute inset-x-12 bottom-12 text-white">
          <p className="mb-4 text-[11px] font-semibold tracking-[0.2em] text-white/80 uppercase">{t("eyebrow")}</p>
          <p className="max-w-lg text-4xl leading-tight font-light">
            {t("taglineLight")} <strong className="font-bold">{t("taglineBold")}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
