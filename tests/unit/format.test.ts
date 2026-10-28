import { describe, expect, it } from "vitest";
import { formatHours, formatHoursDecimal } from "@/lib/format";

describe("formatHours", () => {
  it("counts hours and minutes the way owners do", () => {
    expect(formatHours(3078, "fr-CA")).toBe("51 h 18");
    expect(formatHours(3078, "en")).toBe("51h 18m");
    expect(formatHours(4080, "fr")).toBe("68 h");
    expect(formatHours(65, "en-CA")).toBe("1h 05m");
    expect(formatHours(-90, "fr")).toBe("−1 h 30");
  });

  it("keeps tenths for statements", () => {
    expect(formatHoursDecimal(1602, "fr")).toBe("26,7 h");
    expect(formatHoursDecimal(1602, "en")).toBe("26.7 h");
  });
});
