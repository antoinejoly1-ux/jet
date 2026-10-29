"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { Select } from "@/components/ui/select";

/** Switches the page to another year, keeping everything else. */
export function YearPicker({ year, years }: { year: number; years: number[] }) {
  const t = useTranslations("pnl");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select
      aria-label={t("year")}
      value={year}
      onChange={(e) => router.push(`${pathname}?year=${e.target.value}` as Route)}
      className="h-9 w-28"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  );
}
