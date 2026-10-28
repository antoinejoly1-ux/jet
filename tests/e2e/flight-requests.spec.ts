/**
 * "Demander un vol": an owner asks from Home, dispatch plans it from the card
 * in the inbox with everything filled in, and the owner sees it confirmed.
 */
import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("an owner requests a flight and dispatch plans it from the card", async ({ page, browser }, testInfo) => {
  // Each project gets its own date and destination so runs never collide.
  const days = testInfo.project.name === "phone" ? 40 : 30;
  const d = new Date(Date.now() + days * 86_400_000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [search, code] = testInfo.project.name === "phone" ? ["Boston", "KBOS"] : ["Teterboro", "KTEB"];

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "owner@jet.test");
  await owner.getByRole("button", { name: "Demander un vol" }).first().click();
  const sheet = owner.getByRole("dialog", { name: "Demander un vol" });
  await expect(sheet.getByText(/Saint-Hubert/)).toBeVisible();
  await sheet.getByRole("combobox", { name: "Destination" }).fill(search);
  await sheet.getByRole("option", { name: new RegExp(code) }).click();
  await sheet.getByLabel("Date", { exact: true }).fill(date);
  await sheet.getByLabel("Heure souhaitée").fill("09:15");
  await sheet.getByRole("button", { name: "Un passager de plus" }).click();
  await sheet.getByLabel("Précisions (facultatif)").fill("Deux valises par personne");
  await sheet.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(owner.getByRole("heading", { name: "Demande envoyée" })).toBeVisible();
  await owner.getByRole("button", { name: "Fermer" }).click();
  // Heard, not yet confirmed.
  await owner.goto("/flights");
  await expect(owner.getByText(`CYHU → ${code}`).first()).toBeVisible();
  await expect(owner.getByText("Demandé").first()).toBeVisible();

  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin/messages");
  await page
    .getByRole("link", { name: /Jean Tremblay/ })
    .first()
    .click();
  await page.getByRole("link", { name: "Planifier ce vol" }).last().click();
  await expect(page).toHaveURL(/\/admin\/flights\/new\?request=/);
  await expect(page.getByLabel("Départ", { exact: true })).toHaveValue("CYHU");
  await expect(page.getByLabel("Arrivée", { exact: true })).toHaveValue(code);
  await page.getByLabel("Heure d'arrivée (facultatif)").fill(`${date}T11:00`);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/\/admin\/flights/);

  await owner.goto("/flights");
  const upcoming = owner.getByRole("region", { name: "À venir" });
  await expect(upcoming.getByText(`CYHU → ${code}`).first()).toBeVisible();
  await owner.goto("/notifications");
  await expect(owner.getByText(new RegExp(`Vol confirmé\\s:\\sCYHU → ${code}`)).first()).toBeVisible();
});
