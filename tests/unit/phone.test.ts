import { describe, expect, it } from "vitest";
import { e164, formatPhone, smsHref, telHref } from "@/lib/phone";

describe("phone", () => {
  it("links any North American spelling the same way", () => {
    for (const raw of ["+1 514 555-0100", "(514) 555-0100", "514.555.0100", "15145550100"])
      expect(e164(raw)).toBe("+15145550100");
    expect(telHref("514 555-0100")).toBe("tel:+15145550100");
    expect(smsHref("514 555-0100")).toBe("sms:+15145550100");
  });

  it("shows the number in each language's convention", () => {
    expect(formatPhone("+1 514 555-0100", "fr-CA")).toBe("514 555-0100");
    expect(formatPhone("+1 514 555-0100", "en")).toBe("514-555-0100");
    expect(formatPhone("+33 1 23 45 67 89", "fr")).toBe("+33 1 23 45 67 89");
  });
});
