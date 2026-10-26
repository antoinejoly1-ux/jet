import { describe, expect, it } from "vitest";
import { centsToAmount, minutesToHours, toCsv } from "@/lib/csv";

describe("CSV", () => {
  it("uses ; and a decimal comma in French, , and a point in English, with a BOM", () => {
    const rows = [
      ["Date", "Montant"],
      ["2026-03-01", centsToAmount(123456)],
    ];
    expect(toCsv(rows, "fr")).toBe("﻿Date;Montant\r\n2026-03-01;1234,56\r\n");
    expect(toCsv(rows, "en")).toBe("﻿Date,Montant\r\n2026-03-01,1234.56\r\n");
  });

  it("quotes separators, quotes and line breaks", () => {
    expect(toCsv([['Côté; "Holdings"', "a\nb"]], "fr")).toBe('﻿"Côté; ""Holdings""";"a\nb"\r\n');
  });

  it("neutralises cells that a spreadsheet would run as formulas, but not negative numbers", () => {
    expect(toCsv([["=HYPERLINK(1)", "+1", "@x", -50]], "en")).toBe("﻿'=HYPERLINK(1),'+1,'@x,-50\r\n");
  });

  it("converts minutes to hours", () => {
    expect(minutesToHours(135)).toBe(2.25);
    expect(minutesToHours(-90)).toBe(-1.5);
  });
});

describe("PDF text", () => {
  it("maps characters Helvetica can't draw", async () => {
    const { pdfSafe } = await import("@/lib/pdf/statement");
    expect(pdfSafe("1 234,56 $ · CYUL → KPBI « oui »")).toBe('1 234,56 $ · CYUL -> KPBI " oui "');
    expect(pdfSafe("Côté")).toBe("Côté");
  });
});
