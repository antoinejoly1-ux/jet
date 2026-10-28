/**
 * The flight report: the pilot files it from a phone with a receipt photo,
 * and finance checks it and approves it for the owner who flew.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("a pilot files the CJ4's report from a phone, with a receipt photo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Pilots file from their phone; one run files the seeded flight.");
  await signIn(page, "pilote@jet.test");
  await expect(page).toHaveURL("/pilot");
  await page.getByRole("link", { name: /KPBI → CYHU/ }).click();
  await page.getByLabel("Temps de vol").fill("2 h 50");
  await page.getByLabel("Carburant ajouté (litres)").fill("1150");
  await page.getByRole("button", { name: "Ajouter une dépense" }).click();
  await page.getByLabel("Montant ($)").fill("2 310,40");
  await page.locator("input[type=file]").setInputFiles({
    name: "recu.webp",
    mimeType: "image/webp",
    buffer: readFileSync("public/images/ramp.webp"),
  });
  await expect(page.getByText("Reçu joint")).toBeVisible();
  await page.getByRole("button", { name: "Envoyer le rapport" }).click();
  await expect(page).toHaveURL("/pilot");
  await expect(page.getByText("Rapport envoyé aux finances.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Rapports envoyés" }).getByText("KPBI → CYHU")).toBeVisible();
  // A pilot has no way into the back office or the owners' side.
  await page.goto("/admin");
  await expect(page).toHaveURL("/pilot");
  await page.goto("/finances");
  await expect(page).toHaveURL("/pilot");
});

test("finance approves Jean's Teterboro report, issues the invoice, and Jean opens it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One run approves and invoices the seeded report.");
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/flight-reports");
  await page.getByRole("link", { name: /C-GJTA · CYHU → KTEB/ }).click();
  await expect(page.getByRole("heading", { name: "CYHU → KTEB" })).toBeVisible();
  // 1 h 45 at $1,400/h ($2,450) plus $1,989.60 of expenses at cost.
  await expect(page.getByText(/4\s439,60\s\$/)).toBeVisible();
  await expect(page.getByLabel("Facturé à (qui a volé)")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Approuver le rapport" }).click();
  await expect(page.getByText("Rapport approuvé.")).toBeVisible();

  // Gestion Aviation JTA is registered: GST and QST on the $4,439.60.
  await expect(page.getByText(/221,98\s\$/)).toBeVisible();
  await expect(page.getByText(/442,85\s\$/)).toBeVisible();
  await page.getByRole("button", { name: "Émettre la facture" }).click();
  await page.getByRole("button", { name: "Oui, émettre" }).click();
  await expect(page).toHaveURL(/\/admin\/invoices\/.+/);
  await expect(page.getByRole("heading", { name: /^JTA-\d{4}-0001$/ })).toBeVisible();
  await expect(page.getByText(/5\s104,43\s\$/).first()).toBeVisible();

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "owner@jet.test");
  await owner.goto("/invoices");
  await owner.getByRole("link", { name: /Voir la facture JTA-/ }).click();
  await expect(owner.getByText("Gestion Aviation JTA inc.").first()).toBeVisible();
  await expect(owner.getByText(/CYHU → KTEB/).first()).toBeVisible();
  const download = owner.waitForEvent("download");
  await owner.getByRole("link", { name: "Télécharger le PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^JTA-\d{4}-0001\.pdf$/);
});

test("a company's manager lands on Billing and sees only their company's work", async ({ page }) => {
  await signIn(page, "gestion@jet.test");
  await expect(page).toHaveURL("/billing");
  await expect(page.getByRole("heading", { name: "Facturation" })).toBeVisible();
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});
