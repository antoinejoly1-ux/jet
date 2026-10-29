"use client";

import type { ReactNode } from "react";
import { useRequestFlight } from "./request-flight";

/** A free day on the calendar that opens "Demander un vol" with that date; plain when requesting isn't possible. */
export function RequestDay({
  day,
  label,
  className,
  children,
}: {
  day: string;
  /** "Demander un vol le 28 octobre", for screen readers. */
  label: string;
  className: string;
  children: ReactNode;
}) {
  const open = useRequestFlight();
  if (!open)
    return (
      <span aria-hidden className={className}>
        {children}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => open({ date: day })}
      aria-label={label}
      className={`${className} hover:ring-success/60 cursor-pointer transition-shadow hover:ring-2`}
    >
      {children}
    </button>
  );
}
