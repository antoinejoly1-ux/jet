"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { rememberSide } from "@/lib/side";
import { cn } from "@/lib/utils";
import type { Side } from "./nav";

/**
 * Client | Admin switch, shown to staff only. It is a view switch, not a
 * security boundary: the server checks permissions on every request.
 * The last side used is remembered so staff land where they work.
 */
export function SideToggle({ current }: { current: Side }) {
  const t = useTranslations("toggle");
  return (
    <div role="group" aria-label={t("label")} className="bg-surface-muted inline-flex rounded-full p-1">
      {(["client", "admin"] as const).map((side) => (
        <Link
          key={side}
          href={side === "admin" ? "/admin" : "/"}
          onClick={() => rememberSide(side)}
          aria-current={current === side ? "page" : undefined}
          className={cn(
            "text-muted flex h-8 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
            current === side && "bg-surface text-text shadow-card",
          )}
        >
          {t(side)}
        </Link>
      ))}
    </div>
  );
}
