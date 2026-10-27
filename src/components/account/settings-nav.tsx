"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The sections of Settings: a sticky list beside them on desktop, a row of
 * chips above them on phones. The section in view is highlighted.
 */
export function SettingsNav({ label, sections }: { label: string; sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = sections.find((s) => seen.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={label} className="min-w-0 lg:sticky lg:top-28 lg:self-start">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
        {sections.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              className={cn(
                "block rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors lg:rounded-md lg:border-0 lg:px-3 lg:py-2.5",
                active === s.id
                  ? "border-text bg-text text-background lg:bg-surface-muted lg:text-text font-medium"
                  : "border-border text-muted hover:text-text lg:hover:bg-surface-muted/60",
              )}
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
