import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-[0.04em]",
  {
    variants: {
      tone: {
        neutral: "border-border text-muted",
        success: "border-success/30 bg-success/8 text-success",
        warning: "border-warning/30 bg-warning/8 text-warning",
        danger: "border-danger/30 bg-danger/8 text-danger",
        accent: "border-accent/30 bg-accent/8 text-accent",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
