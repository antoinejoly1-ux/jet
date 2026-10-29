import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A quiet panel: one hairline, generous padding, no shadow. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("bg-surface border-border rounded-lg border p-6 sm:p-7", className)} {...props} />;
}

/** A small uppercase caption above a card's content. */
export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("eyebrow", className)} {...props} />;
}

/** Frosted dark glass, for panels that sit on top of photography or the map. */
export function GlassPanel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-glass border-glass-line rounded-lg border text-white backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
      {...props}
    />
  );
}
