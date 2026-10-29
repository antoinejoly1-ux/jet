import type { ComponentProps } from "react";
import { Label } from "./label";

export function TextareaField({ label, id, ...props }: ComponentProps<"textarea"> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={4}
        className="border-border bg-surface-muted/40 placeholder:text-muted focus-visible:border-accent focus-visible:ring-accent/40 w-full rounded-[14px] border px-3.5 py-2.5 text-base transition-[border-color,box-shadow] focus-visible:ring-1 focus-visible:outline-none sm:text-sm"
        {...props}
      />
    </div>
  );
}
