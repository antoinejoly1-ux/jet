import type { ComponentProps } from "react";
import { Input } from "./input";
import { Label } from "./label";

/** A labelled input with an optional hint. The label is always visible (no placeholder-only fields). */
export function Field({
  label,
  hint,
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint ? (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
