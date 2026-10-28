/**
 * After the Univair call: aircraft belong to holding companies, and an
 * owner's executive assistant sees the schedule but not the finances.
 */
import { expect, test } from "@playwright/test";
import { signIn, unique } from "./support";

test("an admin adds a holding company and gives it an aircraft", async ({ page }) => {
  const company = `Gestion ${unique()} inc.`;
  const reg = `C-${unique()
    .slice(-4)
    .replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}`;
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/holding-companies");
  await page.getByRole("link", { name: "Nouvelle société" }).click();
  await page.getByLabel("Raison sociale").fill(company);
  await page.getByLabel("NEQ").fill("1179999999");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: company })).toBeVisible();
  await expect(page.getByText("NEQ 1179999999")).toBeVisible();

  await page.goto("/admin/aircraft/new");
  await page.getByLabel("Immatriculation").fill(reg);
  await page.getByLabel("Modèle").fill("Pilatus PC-12");
  await page.getByLabel("Société de portefeuille").selectOption({ label: company });
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: reg })).toBeVisible();
  await page.getByRole("link", { name: company }).click();

  await expect(page.getByRole("link", { name: reg })).toBeVisible();
  await page.getByRole("button", { name: "Archiver" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Cette société possède encore un appareil.")).toBeVisible();
});

test("an executive assistant sees the schedule but not the finances", async ({ page }) => {
  await signIn(page, "assistant@jet.test");
  await expect(page.getByText("C-GJTA").first()).toBeVisible();
  await expect(page.getByText("Heures restantes").first()).toBeVisible();
  await expect(page.getByText(/^Budget \d{4}$/)).toHaveCount(0);
  await expect(page.getByText("Dernière facture")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Finances" })).toHaveCount(0);

  await page.goto("/availability");
  await expect(page.getByRole("region", { name: /^(Périodes occupées|À venir)$/ })).toBeVisible();
  await page.goto("/messages");
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
});

test("staff change what an owner's login can do", async ({ page }) => {
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/owners");
  await page.getByRole("link", { name: "Jean Tremblay" }).first().click();
  const julie = page.getByRole("listitem").filter({ hasText: "Julie Assistante" });
  await expect(julie.getByLabel("Rôle de Julie Assistante")).toHaveValue("assistant");
  await expect(julie.getByLabel("Voit les finances")).not.toBeChecked();
});
