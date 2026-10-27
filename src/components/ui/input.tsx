import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-border bg-surface-muted/40 text-text placeholder:text-muted focus-visible:border-accent focus-visible:ring-accent/40 h-12 w-full rounded-[14px] border px-3.5 text-base transition-[border-color,box-shadow] focus-visible:ring-1 focus-visible:outline-none sm:text-sm",
        "aria-[invalid=true]:border-danger disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
