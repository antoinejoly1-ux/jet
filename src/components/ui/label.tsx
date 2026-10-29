import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-muted text-xs font-medium tracking-[0.04em]", className)} {...props} />;
}
