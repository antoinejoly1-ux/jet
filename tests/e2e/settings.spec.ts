import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("the look chosen in Settings sticks across visits", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  await page.goto("/account");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: /^Clair/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: /^Clair/ })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.goto("/account#appearance");
  await page.getByRole("button", { name: /^Sombre/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Settings shows every section, with the team a call away", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  await page.goto("/account");
  const sections = page.getByRole("navigation", { name: "Sections des réglages" });
  for (const name of ["Profil", "Apparence et langue", "Sécurité", "Notifications", "Confidentialité", "Votre équipe"])
    await expect(sections.getByRole("link", { name })).toBeVisible();
  await expect(page.getByLabel("Prénom")).toHaveValue("Jean");
  await expect(page.locator("#team").getByRole("link", { name: /^Appeler/ })).toBeVisible();
});
