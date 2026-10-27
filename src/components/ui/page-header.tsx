import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The top of a page: an optional eyebrow line, a large bold title and its
 * actions. `hero` gives the oversized dashboard headline.
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
    <header className="animate-rise mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="text-muted mb-2 flex items-center gap-2 text-sm font-medium">{eyebrow}</div> : null}
        <h1
          className={cn(
            "font-bold tracking-tight text-balance",
            hero ? "text-4xl leading-[1.05] font-extrabold sm:text-5xl" : "text-2xl sm:text-3xl",
          )}
        >
          {title}
        </h1>
        {description ? <p className="text-muted mt-2 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
