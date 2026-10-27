/** Phase 5: an admin creates an API key, sees it once, and another app uses it. */
import { expect, test } from "@playwright/test";
import { signIn, unique } from "./support";

test("an admin creates a scoped API key that works only for its scopes", async ({ page }) => {
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/settings/developers");
  const name = `Comptabilité ${unique()}`;
  await page.getByLabel("Nom de la clé").fill(name);
  await page.getByLabel("Lire la flotte et les vols").check();
  await page.getByRole("button", { name: "Créer la clé" }).click();
  await expect(page.getByText("Copiez cette clé maintenant")).toBeVisible();
  const key = (await page.locator("code").first().textContent())!.trim();
  expect(key).toMatch(/^jet_/);

  const fleet = await page.request.get("/api/v1/aircraft", { headers: { authorization: `Bearer ${key}` } });
  expect(fleet.status()).toBe(200);
  expect((await fleet.json()).data.map((a: { registration: string }) => a.registration)).toContain("C-GJTA");

  const money = await page.request.get("/api/v1/transactions", { headers: { authorization: `Bearer ${key}` } });
  expect(money.status()).toBe(403);

  // Revoking it stops it immediately.
  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: "Révoquer" }).click();
  await row.getByRole("button", { name: "Révoquer" }).click();
  await expect(row).toContainText("Révoquée");
  expect((await page.request.get("/api/v1/aircraft", { headers: { authorization: `Bearer ${key}` } })).status()).toBe(
    401,
  );

  const spec = await page.request.get("/api/v1/openapi.json");
  expect((await spec.json()).openapi).toBe("3.1.0");
});
