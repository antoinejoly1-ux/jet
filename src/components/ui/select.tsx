import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-border bg-surface h-11 w-full rounded-md border px-3 text-base sm:text-sm",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function SelectField({
  label,
  id,
  error,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; id: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {/* Keyed on the default: React only applies a select's defaultValue on mount, and
          remounting lets a form restore the submitted choice after a failed save. */}
      <Select
        key={String(props.defaultValue ?? "")}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      >
        {children}
      </Select>
      {error ? (
        <p id={`${id}-error`} className="text-danger text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
