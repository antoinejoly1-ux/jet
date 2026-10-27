import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A soft, borderless panel with generous padding; the main surface of every screen. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("bg-surface shadow-card rounded-lg border border-(--card-border) p-5 sm:p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-muted text-sm font-semibold tracking-normal", className)} {...props} />;
}
