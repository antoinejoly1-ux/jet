"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Select } from "@/components/ui/select";

/** The Vols aircraft filter: choosing an aircraft applies it straight away. */
export function AircraftFilter({
  value,
  label,
  allLabel,
  fleet,
}: {
  value: string;
  label: string;
  allLabel: string;
  fleet: { id: string; registration: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      name="aircraft"
      defaultValue={value}
      aria-label={label}
      className="w-44"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("aircraft", e.target.value);
        else next.delete("aircraft");
        // A new filter starts the "Passés" pages over.
        next.delete("before");
        next.delete("new");
        router.replace(`${pathname}?${next}` as Route);
      }}
    >
      <option value="">{allLabel}</option>
      {fleet.map((a) => (
        <option key={a.id} value={a.id}>
          {a.registration}
        </option>
      ))}
    </Select>
  );
}

/** Brings a just-saved row into view once; the row itself carries the highlight. */
export function ScrollIntoView() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const row = ref.current?.closest("li");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, []);
  return <span ref={ref} hidden />;
}
