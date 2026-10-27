import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { ContactButtons } from "@/components/common/contact-buttons";
import { team } from "@/lib/imagery";
import { cn } from "@/lib/utils";

/** The team's portraits, overlapping: the people who pick up when an owner calls. */
export function TeamFaces({ count = 4, size = 44, className }: { count?: number; size?: number; className?: string }) {
  return (
    <div className={cn("flex -space-x-3", className)}>
      {team.slice(0, count).map((m) => (
        <Image
          key={m.key}
          src={m.photo}
          alt={m.name}
          width={size}
          height={size}
          className="ring-background rounded-full object-cover object-top ring-2"
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

/** "Always here": the faces, one warm line and the ways to reach them. */
export async function TeamReach({ className }: { className?: string }) {
  const t = await getTranslations("team");
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <TeamFaces />
      <div>
        <p className="text-lg font-light">{t("title")}</p>
        <p className="text-muted mt-1 text-sm">{t("body")}</p>
      </div>
      <ContactButtons />
    </div>
  );
}

/** The team as a row of portrait cards with names and roles (onboarding, settings). */
export async function TeamGallery({ count = 4, className }: { count?: number; className?: string }) {
  const locale = (await getLocale()) === "en" ? "en" : "fr";
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {team.slice(0, count).map((m) => (
        <li key={m.key}>
          <div className="bg-surface-muted relative aspect-[5/6] overflow-hidden rounded-[18px]">
            <Image src={m.photo} alt="" fill sizes="(min-width: 640px) 200px, 45vw" className="object-cover" />
          </div>
          <p className="mt-3 text-sm font-medium">{m.name}</p>
          <p className="text-muted text-xs">{m.role[locale]}</p>
        </li>
      ))}
    </ul>
  );
}
