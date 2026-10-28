"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { scenes, type Scene } from "@/lib/imagery";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** Each account screen has its own photograph and line, like the pages of a brochure. */
const SCENE: [prefix: string, scene: Scene, line: string][] = [
  ["/sign-up", "cabinLifestyle", "signUp"],
  ["/invite", "boarding", "invite"],
  ["/forgot-password", "rampDusk", "password"],
  ["/reset-password", "rampDusk", "password"],
  ["/two-factor", "cockpit", "security"],
  ["/setup-2fa", "cockpit", "security"],
  ["/pending", "terminal", "pending"],
  ["/sign-in", "hangar", "signIn"],
];

/**
 * The screen's photograph: a rounded panel filling the right half on a
 * desktop with its line at the foot, or (`band`) a short strip above the form
 * on a phone.
 */
export function AuthPhoto({ band = false }: { band?: boolean }) {
  const t = useTranslations("authFrame");
  const pathname = usePathname();
  const [, scene, line] = SCENE.find(([p]) => pathname.startsWith(p)) ?? SCENE[SCENE.length - 1]!;
  return (
    <div
      className={cn(band ? "h-36 p-2 sm:h-44 lg:hidden" : "sticky top-0 hidden h-dvh p-4 lg:block")}
      aria-hidden={band}
    >
      <div className="relative isolate h-full overflow-hidden rounded-[22px] lg:rounded-[28px]">
        <Image
          key={scene}
          src={scenes[scene]}
          alt=""
          fill
          // Both are in the page and CSS hides one, so neither is preloaded (a
          // preload would fetch the hidden one too); the visible one jumps the queue.
          fetchPriority="high"
          sizes={band ? "100vw" : "55vw"}
          placeholder="blur"
          className="animate-ken-burns object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        {band ? null : (
          // The logo sits on the photograph, as it does in the welcome tour.
          <span className="absolute top-6 left-6 flex flex-col items-start gap-1 text-white lg:top-8 lg:left-10">
            <Logo className="h-5 w-auto" title="Univair Management" />
            <span aria-hidden className="text-[8px] font-medium tracking-[0.55em] text-white/70 uppercase">
              Management
            </span>
          </span>
        )}
        {band ? null : (
          <div
            className="animate-rise absolute inset-x-10 bottom-10 max-w-md text-white xl:inset-x-14 xl:bottom-14"
            key={line}
          >
            <p className="eyebrow text-white/75">{t(`${line}.eyebrow`)}</p>
            <p className="mt-3 text-4xl leading-[1.08] font-light tracking-[-0.03em] xl:text-5xl">
              {t(`${line}.light`)} <span className="font-normal">{t(`${line}.strong`)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
