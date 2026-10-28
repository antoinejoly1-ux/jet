import { describe, expect, it } from "vitest";
import { detectDateOrder, parseImportDate } from "@/lib/import-dates";

describe("import dates", () => {
  it("reads slashed dates in the order chosen", () => {
    expect(parseImportDate("01/03/2026")).toBe("2026-03-01");
    expect(parseImportDate("01/03/2026", "mdy")).toBe("2026-01-03");
    expect(parseImportDate("2026-03-01", "mdy")).toBe("2026-03-01");
    expect(parseImportDate("31/01/2026", "mdy")).toBeNull();
  });

  it("settles the order from the file when a day is above 12, and asks otherwise", () => {
    expect(detectDateOrder(["01/03/2026", "31/01/2026"])).toBe("dmy");
    expect(detectDateOrder(["01/03/2026", "01/31/2026"])).toBe("mdy");
    expect(detectDateOrder(["01/03/2026", "02/04/2026"])).toBe("ambiguous");
    expect(detectDateOrder(["05/05/2026", "2026-03-01"])).toBeNull();
    expect(detectDateOrder(["13/01/2026", "01/13/2026"])).toBe("ambiguous");
  });
});
