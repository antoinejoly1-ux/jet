import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The top of a page: a small uppercase eyebrow, a large light title and the
 * page's actions. `hero` gives the oversized dashboard headline.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  hero = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  hero?: boolean;
}) {
  return (
    <header className="animate-rise mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-3 flex items-center gap-2.5">{eyebrow}</div> : null}
        <h1
          className={cn(
            "font-light tracking-[-0.025em] text-balance",
            hero ? "text-4xl leading-[1.05] sm:text-6xl" : "text-3xl leading-tight sm:text-[2.6rem]",
          )}
        >
          {title}
        </h1>
        {description ? <p className="text-muted mt-3 max-w-2xl text-[15px] leading-relaxed">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
