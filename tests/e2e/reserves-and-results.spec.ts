/**
 * What Charles's owners asked for: how much is in the reserves, how far
 * along the big jobs are, and whether the company balances.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("an owner sees the reserves of their aircraft and the company's results", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  await page.goto("/finances");
  const reserves = page.getByRole("region", { name: "Réserves d'entretien" });
  await expect(reserves.getByText("C-GJTA")).toBeVisible();
  await expect(reserves.getByText(/Révision de l'hélice\s:\s\d+\s%\scouvert/)).toBeVisible();
  await expect(reserves.getByText(/votre part/).first()).toBeVisible();

  await page.getByRole("link", { name: "Résultats de Gestion Aviation JTA inc." }).click();
  await expect(page.getByRole("heading", { name: /^Résultats \d{4}$/ })).toBeVisible();
  await expect(page.getByText("Rémunération des pilotes")).toBeVisible();
  await expect(page.getByText("Solde des réserves")).toBeVisible();
});

test("finance records a company expense and pays a job from a reserve", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Writes to the seeded company once.");
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/holding-companies");
  await page.getByRole("link", { name: "Gestion Aviation JTA inc." }).first().click();
  await page.getByRole("link", { name: "Résultats" }).click();
  await page.getByLabel("Type").selectOption("other");
  await page.getByLabel("Montant ($)").fill("1 234,56");
  await page.getByLabel("Description (facultatif)").fill("Frais de dégivrage");
  await page.getByRole("button", { name: "Inscrire", exact: true }).click();
  await expect(page.getByText("Autres · Frais de dégivrage")).toBeVisible();

  await page.goto("/admin/aircraft");
  await page
    .getByRole("link", { name: /C-GJTA/ })
    .first()
    .click();
  await page.getByText("Payer des travaux depuis une réserve").click();
  const pay = page.locator("form", { has: page.getByRole("button", { name: "Payer depuis la réserve" }) });
  await pay.getByLabel("Réserve").selectOption("propeller");
  await pay.getByLabel("Montant ($)").fill("4 000");
  await pay.getByLabel("Travaux").fill("Inspection de l’hélice");
  await pay.getByRole("button", { name: "Payer depuis la réserve" }).click();
  await page.getByText("Travaux payés et corrections").click();
  await expect(page.getByText(/Hélice · Inspection de l’hélice/)).toBeVisible();
});
