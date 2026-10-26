import type { ComponentProps } from "react";
import { Input } from "./input";
import { Label } from "./label";

/**
 * A labelled input with an optional hint and error. The label is always
 * visible (no placeholder-only fields) and the error is announced.
 */
export function Field({
  label,
  hint,
  error,
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string; error?: string; id: string }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...props} />
      {hint ? (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-danger text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
