/** Phase 4: owners and the team take their numbers away as CSV and PDF. */
import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("an owner downloads their yearly statement and their transactions", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  await page.goto("/finances");
  const year = new Date().getFullYear();

  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("link", { name: `Relevé ${year} (PDF)` })
      .first()
      .click(),
  ]);
  expect(pdf.suggestedFilename()).toBe(`statement-${year}-C-GJTA.pdf`);
  const pdfBytes = await (await pdf.createReadStream()).toArray();
  expect(Buffer.concat(pdfBytes).toString("latin1", 0, 5)).toBe("%PDF-");

  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exporter (CSV)" }).click(),
  ]);
  const text = Buffer.concat(await (await csv.createReadStream()).toArray()).toString("utf8");
  expect(text.startsWith("﻿Date;Appareil;Type;Catégorie")).toBe(true);
  expect(text).toContain("C-GJTA");

  // Another owner's statement is simply not there.
  const other = await page.request.get(`/finances/statement?share=00000000-0000-7000-8000-000000000000&year=${year}`);
  expect(other.status()).toBe(404);
});

test("the team exports the ledger as filtered", async ({ page }) => {
  await signIn(page, "admin@jet.test");
  await page.goto(`/admin/transactions?year=${new Date().getFullYear()}&kind=cost`);
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exporter (CSV)" }).click(),
  ]);
  const text = Buffer.concat(await (await csv.createReadStream()).toArray()).toString("utf8");
  const lines = text.replace(/\r\n$/, "").split("\r\n");
  expect(lines[0]).toBe("﻿Date;Appareil;Propriétaire;Type;Catégorie;Description;Montant;Devise;Contrepassation");
  expect(lines.length).toBeGreaterThan(5);
  expect(lines.slice(1).every((l) => l.split(";")[3] === "Coût")).toBe(true);
});
