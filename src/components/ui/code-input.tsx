"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A 6-digit code field drawn as six boxes. It is one real input underneath,
 * so paste, password-manager autofill and iOS/Android "one-time code"
 * suggestions all work. Calls onComplete as soon as the last digit is typed.
 */
export function CodeInput({
  length = 6,
  label,
  onComplete,
  disabled,
  invalid,
  autoFocus = true,
}: {
  length?: number;
  label: string;
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // After a wrong code: clear and refocus so the user can just type again.
  useEffect(() => {
    if (!invalid) return;
    const id = setTimeout(() => {
      setValue("");
      ref.current?.focus();
    }, 450);
    return () => clearTimeout(id);
  }, [invalid]);

  return (
    <div className={cn("relative", invalid && "animate-[shake_0.35s_ease-in-out]")}>
      <input
        ref={ref}
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, length);
          setValue(digits);
          if (digits.length === length) onComplete(digits);
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div aria-hidden className="flex justify-between gap-2">
        {Array.from({ length }, (_, i) => {
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <div
              key={i}
              className={cn(
                "bg-surface tabular flex h-14 w-full max-w-12 items-center justify-center rounded-md border text-2xl font-semibold transition-colors",
                active ? "border-ring ring-ring/30 ring-2" : "border-border",
                invalid && "border-danger",
              )}
            >
              {value[i] ?? (active ? <span className="bg-text h-6 w-px animate-pulse" /> : null)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
