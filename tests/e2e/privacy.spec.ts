/** Phase 4, Law 25: the policy is public, owners take their data and make requests, admins answer them. */
import { expect, test } from "@playwright/test";
import { signIn, unique } from "./support";

test("anyone can read the privacy policy", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vos droits" })).toBeVisible();
});

test("an owner downloads their data and makes a request that an admin answers", async ({ page, browser }) => {
  const details = `Mon numéro a changé ${unique()}`;
  await signIn(page, "owner@jet.test");
  await page.goto("/account");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Télécharger mes données (JSON)" }).click(),
  ]);
  const data = JSON.parse(Buffer.concat(await (await download.createReadStream()).toArray()).toString("utf8"));
  expect(data.account.email).toBe("owner@jet.test");
  expect(data.owners.map((o: { legalName: string }) => o.legalName)).toEqual(["Jean Tremblay"]);

  await page.getByLabel("Demande", { exact: true }).selectOption("correction");
  await page.getByRole("textbox", { name: "Précisions (facultatif)" }).fill(details);
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByText("Demande envoyée.")).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "admin@jet.test");
  await admin.goto("/admin/settings/privacy");
  const request = admin.getByRole("listitem").filter({ hasText: details });
  await expect(request).toContainText("30 jours restants");
  await request.getByLabel("Réponse à la personne").fill("Numéro corrigé sur votre fiche.");
  await request.getByRole("button", { name: "Marquer traitée" }).click();
  await expect(admin.getByText(details)).toBeHidden();

  await page.reload();
  await expect(page.getByText("Numéro corrigé sur votre fiche.").first()).toBeVisible();
});
