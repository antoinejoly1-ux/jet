import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "@/lib/validation/finance";
import { parseImportDate } from "@/lib/services/imports";

describe("parseMoneyToCents", () => {
  it.each([
    ["1234.56", 123456],
    ["1 234,56", 123456],
    ["1 234,56 $", 123456],
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["-50", -5000],
    ["0,5", 50],
    ["12 500 $", 1250000],
    ["CAD 99.99", 9999],
  ])("%s → %d cents", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "1.2.3", "12.345", "1,234"])("rejects %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("parseImportDate", () => {
  it.each([
    ["2026-03-01", "2026-03-01"],
    ["01/03/2026", "2026-03-01"],
    ["1-3-2026", "2026-03-01"],
    ["31.12.2025", "2025-12-31"],
  ])("%s → %s", (input, iso) => {
    expect(parseImportDate(input)).toBe(iso);
  });

  it.each(["2026-02-30", "32/01/2026", "March 1", ""])("rejects %s", (input) => {
    expect(parseImportDate(input)).toBeNull();
  });
});
