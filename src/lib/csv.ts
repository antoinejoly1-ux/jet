/**
 * Spreadsheet-friendly CSV. French files use ";" and a decimal comma, which is
 * what Excel expects on a French-Canadian computer; English files use "," and
 * a decimal point. A byte-order mark keeps accents intact when Excel opens it.
 */
export type CsvLocale = "fr" | "en";
export type Cell = string | number | null | undefined;

const separator = (locale: CsvLocale) => (locale === "fr" ? ";" : ",");

function text(value: string, sep: string): string {
  // A cell starting with = + - @ would run as a formula in a spreadsheet; a leading quote keeps it text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return safe.includes(sep) || /["\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][], locale: CsvLocale): string {
  const sep = separator(locale);
  const line = (row: Cell[]) =>
    row
      .map((c) => {
        if (c === null || c === undefined) return "";
        if (typeof c === "number") return locale === "fr" ? String(c).replace(".", ",") : String(c);
        return text(c, sep);
      })
      .join(sep);
  return `﻿${rows.map(line).join("\r\n")}\r\n`;
}

/** Cents as a plain number of dollars (no currency sign, no thousands separator) so spreadsheets can add it up. */
export const centsToAmount = (cents: number) => Math.round(cents) / 100;

/** Minutes as decimal hours, two decimals. */
export const minutesToHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
