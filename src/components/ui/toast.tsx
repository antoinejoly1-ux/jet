"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

/** A quiet confirmation at the bottom of the screen; clears its cookie and leaves after a few seconds. */
export function Toast({ id, message, closeLabel }: { id: string; message: string; closeLabel: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    document.cookie = "flash=; path=/; max-age=0; samesite=lax";
    const timer = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(timer);
  }, [id]);
  if (!shown) return null;
  return (
    <div
      role="status"
      className="animate-rise border-border bg-surface shadow-float fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-full border py-2 pr-2 pl-4 text-sm lg:bottom-8"
    >
      <CheckCircle2 className="text-success size-5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setShown(false)}
        aria-label={closeLabel}
        className="text-muted hover:text-text hover:bg-surface-muted flex size-9 items-center justify-center rounded-full"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
