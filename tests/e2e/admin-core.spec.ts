/**
 * Phase 1 "done when": the operator's fleet and owners can be entered,
 * shares assigned (never over 100%), owners viewed as they see the portal,
 * and the team and audit log managed. Runs against the seeded demo data.
 */
import { expect, test } from "@playwright/test";
import { signIn, unique } from "./support";

test("an admin creates and edits an owner", async ({ page }) => {
  const name = `Propriétaire ${unique()}`;
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/owners");
  await page.getByRole("link", { name: "Nouveau propriétaire" }).click();
  await page.getByLabel("Nom ou raison sociale").fill(name);
  await page.getByLabel("Courriel").fill("not-an-email");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Entrez un courriel valide.")).toBeVisible();

  await page.getByLabel("Courriel").fill("Nouveau@Example.com");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("nouveau@example.com").first()).toBeVisible();

  await page.getByRole("link", { name: "Modifier" }).click();
  await page.getByLabel("Nom ou raison sociale").fill(`${name} inc.`);
  await page.getByLabel("Type").selectOption("company");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${name} inc.` })).toBeVisible();
  await expect(page.getByText("a modifié le propriétaire")).toBeVisible();

  // Search finds it.
  await page.goto(`/admin/owners?q=${encodeURIComponent(`${name} inc.`)}`);
  await expect(page.getByRole("link", { name: `${name} inc.` }).first()).toBeVisible();
});

test("shares on one aircraft can never exceed 100%", async ({ page }) => {
  const reg = `C-${unique()
    .slice(-4)
    .replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]!)}`;
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/aircraft/new");
  await page.getByLabel("Immatriculation").fill(reg.toLowerCase());
  await page.getByLabel("Modèle").fill("Cessna Citation CJ3+");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: reg })).toBeVisible();

  // Adding an owner sits behind « Ajouter une part » on the aircraft page.
  const addShare = async (owner: string, percent: string) => {
    const form = page.locator("details").filter({ hasText: "Ajouter une part" });
    if (!(await form.evaluate((d) => (d as HTMLDetailsElement).open))) await form.locator("summary").click();
    await form.getByLabel("Propriétaire", { exact: true }).selectOption({ label: owner });
    await form.getByLabel("Part (%)").fill(percent);
    await form.getByRole("button", { name: "Ajouter la part" }).click();
  };
  await addShare("Luc Bergeron", "60");
  await expect(page.getByText("Parts attribuées : 60 % (pas 100 %)")).toBeVisible();

  await addShare("Nadia Pelletier", "50");
  await expect(page.getByText("dépasseraient 100 %")).toBeVisible();

  await addShare("Nadia Pelletier", "40");
  await expect(page.getByRole("link", { name: "Nadia Pelletier" })).toBeVisible();
  await expect(page.getByText(/Parts attribuées/)).toHaveCount(0);

  // Ending a share frees its percentage (shares are ended, never deleted).
  const luc = page.getByRole("listitem").filter({ hasText: "Luc Bergeron" });
  await luc.getByRole("button", { name: "Clôturer la part" }).click();
  await luc.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Parts attribuées : 40 % (pas 100 %)")).toBeVisible();
  await expect(page.getByText("1 ancien propriétaire")).toBeVisible();
});

test("View as owner shows exactly what the owner sees, read-only, and is logged", async ({ page }) => {
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/owners");
  await page.getByRole("link", { name: "Sophie Roy" }).first().click();
  await page.getByRole("button", { name: "Voir comme ce propriétaire" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("status").filter({ hasText: "Sophie Roy" })).toContainText("lecture seule");
  await expect(page.getByText("C-GJTA").first()).toBeVisible();
  await expect(page.getByText("C-FJTB")).toHaveCount(0);

  await page.getByRole("button", { name: "Quitter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sophie Roy" })).toBeVisible();
  await expect(page.getByText("a ouvert la vue propriétaire").first()).toBeVisible();
  await expect(page.getByText("a fermé la vue propriétaire").first()).toBeVisible();
});

test("dispatchers can look but not change owners, the fleet or the team", async ({ page }) => {
  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin/owners");
  await expect(page.getByRole("link", { name: "Nouveau propriétaire" })).toHaveCount(0);
  await page.getByRole("link", { name: "Jean Tremblay" }).first().click();
  await expect(page.getByRole("link", { name: "Modifier" })).toHaveCount(0);
  await page.goto("/admin/aircraft/new");
  await expect(page).toHaveURL("/admin/aircraft");
  await page.goto("/admin/settings");
  await expect(page.getByText("Réservé aux administrateurs")).toBeVisible();
});

test("the last admin can't be demoted, and the audit log records the team's actions", async ({ page }) => {
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/settings");
  const me = page.getByRole("listitem").filter({ hasText: "admin@jet.test" });
  await me.getByLabel(/Rôle de/).selectOption("finance");
  await me.getByRole("button", { name: "Enregistrer" }).click();
  await expect(me.getByText("Il doit rester au moins un administrateur.")).toBeVisible();

  await page.getByRole("link", { name: /Journal d'audit/ }).click();
  await expect(page.getByText("s'est connecté").first()).toBeVisible();
  await page.getByRole("navigation", { name: "Filtres" }).getByRole("link", { name: "Propriétaires" }).click();
  await expect(page).toHaveURL(/action=owner\./);
});

test("staff find anything with ⌘K and see what needs doing", async ({ page }, testInfo) => {
  // The search lives in the desktop top bar (⌘K); phones use the lists.
  test.skip(testInfo.project.name === "phone");
  await signIn(page, "dispatch@jet.test");
  await expect(page.getByRole("heading", { name: "À traiter" })).toBeVisible();
  await page.getByRole("button", { name: "Rechercher" }).click();
  await page.getByRole("combobox", { name: "Rechercher" }).fill("gjta");
  // The aircraft itself, not one of its flights (those read « … → … »).
  const plane = page
    .getByRole("option", { name: /C-GJTA/ })
    .filter({ hasNotText: "→" })
    .first();
  await expect(plane).toBeVisible();
  await plane.click();
  await expect(page).toHaveURL(/\/admin\/aircraft\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "C-GJTA" })).toBeVisible();
});
