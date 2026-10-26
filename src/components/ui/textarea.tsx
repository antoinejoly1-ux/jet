import type { ComponentProps } from "react";
import { Label } from "./label";

export function TextareaField({ label, id, ...props }: ComponentProps<"textarea"> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={4}
        className="border-border bg-surface placeholder:text-muted w-full rounded-md border px-3 py-2.5 text-base sm:text-sm"
        {...props}
      />
    </div>
  );
}
