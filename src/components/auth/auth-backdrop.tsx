"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { scenes, type Scene } from "@/lib/imagery";

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

export function AuthBackdrop() {
  const t = useTranslations("authFrame");
  const pathname = usePathname();
  const [, scene, line] = SCENE.find(([p]) => pathname.startsWith(p)) ?? SCENE[SCENE.length - 1]!;
  return (
    <>
      <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <Image
          key={scene}
          src={scenes[scene]}
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          className="animate-ken-burns object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-black/5" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
      </div>
      <aside className="animate-rise hidden max-w-md text-right lg:block" key={line}>
        <p className="eyebrow text-white/65">{t(`${line}.eyebrow`)}</p>
        <p className="mt-4 text-5xl leading-[1.05] font-light tracking-[-0.03em] text-white">
          {t(`${line}.light`)} <span className="font-normal">{t(`${line}.strong`)}</span>
        </p>
      </aside>
    </>
  );
}
