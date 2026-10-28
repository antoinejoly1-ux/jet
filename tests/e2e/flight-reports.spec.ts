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

test("finance checks Jean's Teterboro report and approves it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One run approves the seeded report.");
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/flight-reports");
  await page.getByRole("link", { name: /C-GJTA · CYHU → KTEB/ }).click();
  await expect(page.getByRole("heading", { name: "CYHU → KTEB" })).toBeVisible();
  // 1 h 45 at $1,400/h ($2,450) plus $1,989.60 of expenses at cost.
  await expect(page.getByText(/4\s439,60\s\$/)).toBeVisible();
  await expect(page.getByLabel("Facturé à (qui a volé)")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Approuver le rapport" }).click();
  await expect(page).toHaveURL("/admin/flight-reports");
  await expect(page.getByText("Rapport approuvé.")).toBeVisible();
});
