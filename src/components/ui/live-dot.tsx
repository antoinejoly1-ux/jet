import { cn } from "@/lib/utils";

/** A dot that keeps pulsing: something here is live. */
export function LiveDot({ tone = "live", className }: { tone?: "live" | "bronze" | "muted"; className?: string }) {
  const color = tone === "live" ? "bg-live" : tone === "bronze" ? "bg-bronze" : "bg-muted";
  return (
    <span aria-hidden className={cn("relative inline-flex size-2.5 shrink-0", className)}>
      {tone !== "muted" ? (
        <span
          className={cn("absolute inset-0 rounded-full motion-safe:animate-[live-ping_1.8s_ease-out_infinite]", color)}
        />
      ) : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", color)} />
    </span>
  );
}
