"use client";

import { useEffect, useRef } from "react";

/** Keeps the newest message in view when the thread opens or a message arrives. */
export function ScrollToEnd({ marker }: { marker: string }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [marker]);
  return <li ref={ref} aria-hidden className="h-px" />;
}
