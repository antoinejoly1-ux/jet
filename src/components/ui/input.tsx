import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-border bg-surface text-text placeholder:text-muted focus-visible:border-bronze h-11 w-full rounded-md border px-3.5 text-base transition-[border-color,box-shadow] sm:text-sm",
        "aria-[invalid=true]:border-danger disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
