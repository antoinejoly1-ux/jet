/**
 * Live tracking with the demo provider: the seed puts Jean's PC-12 in the air
 * from Saint-Hubert to Palm Beach, and a charter on the Challenger.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("an owner sees where their aircraft is, live", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  const live = page.getByRole("region", { name: /Saint-Hubert → West Palm Beach/ }).first();
  await expect(page.getByRole("heading", { name: "Saint-Hubert → West Palm Beach" })).toBeVisible();
  await expect(page.locator("p", { hasText: /En vol.*C-GJTA/ }).first()).toBeVisible();
  await expect(page.getByText("Altitude")).toBeVisible();
  // The map itself loads (MapLibre draws into a canvas).
  await expect(live.locator("canvas")).toBeVisible({ timeout: 15_000 });
  // The status keeps itself fresh.
  await expect(page.getByText(/Vu il y a \d+ s/)).toBeVisible();
});

test("an assistant sees the map too, but no money", async ({ page }) => {
  await signIn(page, "assistant@jet.test");
  await expect(page.getByRole("heading", { name: "Saint-Hubert → West Palm Beach" })).toBeVisible();
  await expect(page.getByText(/Dépensé en \d{4}/)).toHaveCount(0);
});

test("the back office sees the whole fleet", async ({ page }) => {
  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "La flotte en direct" })).toBeVisible();
  // Other tests add aircraft, so only the number in the air is fixed.
  await expect(page.getByText(/^2 en vol sur \d+$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /C-FUNV · Bombardier/ })).toContainText("CYUL → KTEB");
});
