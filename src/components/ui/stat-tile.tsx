import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconMotion } from "./icon";

/** A big number with a short label under it, Pop Bunny style. */
export function StatTile({
  value,
  label,
  icon,
  anim,
  footer,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  icon?: LucideIcon;
  anim?: IconMotion;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group bg-surface shadow-card flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-(--card-border) p-5 transition-transform duration-300 hover:-translate-y-0.5",
        className,
      )}
    >
      {icon ? (
        <span className="bg-accent/10 text-accent flex size-9 items-center justify-center rounded-full">
          <Icon icon={icon} anim={anim} className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="tabular truncate text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-muted mt-1 text-sm leading-snug">{label}</p>
      </div>
      {footer}
    </div>
  );
}
