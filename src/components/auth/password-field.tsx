"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A password input with a button to show what was typed, and an optional hint. */
export function PasswordField({
  id,
  label,
  hint,
  aside,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { id: string; label: string; hint?: string; aside?: React.ReactNode }) {
  const t = useTranslations("auth");
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="pr-12"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? t("hidePassword") : t("showPassword")}
          aria-controls={id}
          className="text-muted hover:text-text absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[14px]"
        >
          {shown ? (
            <EyeOff className="size-[18px]" strokeWidth={1.75} aria-hidden />
          ) : (
            <Eye className="size-[18px]" strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
