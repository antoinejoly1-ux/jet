/**
 * Staff two-factor authentication: required, the same on every sign-in
 * method, and smooth (auto-submit, trusted devices, backup codes, guided setup).
 * Runs with REQUIRE_STAFF_2FA=true against the seeded demo data.
 */
import { expect, test } from "@playwright/test";
import {
  completeWelcome,
  DEMO_BACKUP_CODES,
  latestLink,
  PASSWORD,
  rawFromBase32,
  signIn,
  totp,
  typeCode,
  unique,
} from "./support";

const CODE_SCREEN = /Vérification en deux étapes|Two-step verification/;

async function passwordStep(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/^(Courriel|Email)$/).fill(email);
  await page.getByLabel(/^(Mot de passe|Password)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^(Se connecter|Sign in)$/ }).click();
}

test("a password sign-in asks for the code, which submits itself at the sixth digit", async ({ page }) => {
  await passwordStep(page, "admin@jet.test");
  await expect(page.getByRole("heading", { name: CODE_SCREEN })).toBeVisible();
  await typeCode(page, await totp());
  await expect(page).toHaveURL("/admin");
});

test("a wrong code is refused and the user can simply type again", async ({ page }) => {
  await passwordStep(page, "admin@jet.test");
  await typeCode(page, "000000");
  await expect(page.getByRole("alert").filter({ hasText: /Code invalide|Invalid code/ })).toBeVisible();
  await expect(page).toHaveURL(/\/two-factor/);
  await typeCode(page, await totp());
  await expect(page).toHaveURL("/admin");
});

test("a magic link does not skip the code", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel(/^(Courriel|Email)$/).fill("dispatch@jet.test");
  await page.getByRole("button", { name: /lien de connexion|sign-in link/ }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.goto(latestLink("dispatch@jet.test"));
  await expect(page).toHaveURL(/\/two-factor/);
  // No session exists before the code: the admin side stays closed.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a trusted device is not asked again", async ({ page, context }) => {
  await signIn(page, "admin@jet.test"); // trust is checked by default
  await context.clearCookies({ name: /session_token|session_data/ });
  await passwordStep(page, "admin@jet.test");
  await expect(page).toHaveURL("/admin");
});

test("a backup code works once", async ({ page, browser }, testInfo) => {
  // Each project (desktop, phone) spends its own code, since a code works only once.
  const code = DEMO_BACKUP_CODES[testInfo.project.name === "phone" ? 1 : 0]!;
  await passwordStep(page, "dispatch@jet.test");
  await page.getByRole("button", { name: /code de secours|backup code/i }).click();
  await page.getByLabel(/Code de secours|Backup code/).fill(code);
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: /^(Vérifier|Verify)$/ }).click();
  await expect(page).toHaveURL("/admin");

  const again = await (await browser.newContext()).newPage();
  await passwordStep(again, "dispatch@jet.test");
  await again.getByRole("button", { name: /code de secours|backup code/i }).click();
  await again.getByLabel(/Code de secours|Backup code/).fill(code);
  await again.getByRole("button", { name: /^(Vérifier|Verify)$/ }).click();
  await expect(again.getByRole("alert").filter({ hasText: /secours|backup/i })).toBeVisible();
});

test("a newly invited staff member is guided through setup before reaching Admin", async ({ page, browser }) => {
  const email = `staff-${unique()}@jet.test`;
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/invitations");
  await page.getByLabel(/^(Courriel|Email)$/).fill(email);
  await page.getByLabel(/^(Accès|Access)$/).selectOption({ label: "Répartition" });
  await page.getByRole("button", { name: /Envoyer l'invitation|Send invitation/ }).click();
  await expect(page.getByRole("status")).toContainText(email);

  const staff = await (await browser.newContext()).newPage();
  await staff.goto(latestLink(email));
  await staff.getByRole("link", { name: /Créer mon compte|Create my account/ }).click();
  await staff.getByLabel(/Nom complet|Full name/).fill("Nouvelle Répartitrice");
  await staff.getByLabel(/^(Mot de passe|Password)$/).fill(PASSWORD);
  await staff.getByRole("button", { name: /Créer un compte|Create an account/ }).click();
  await expect(staff.getByRole("heading", { name: /Vérifiez vos courriels|Check your email/ })).toBeVisible();
  await staff.goto(latestLink(email));
  await staff.getByRole("button", { name: /Accepter l'invitation|Accept the invitation/ }).click();

  // Straight into the guided setup.
  await expect(staff).toHaveURL(/\/setup-2fa/);
  await staff.getByLabel(/Confirmez votre mot de passe|Confirm your password/).fill(PASSWORD);
  await staff.getByRole("button", { name: /Commencer|Get started/ }).click();
  await expect(staff.getByRole("img", { name: /Code QR|QR code/ })).toBeVisible();
  const key = rawFromBase32(await staff.getByTestId("totp-secret").innerText());
  await staff.getByRole("button", { name: /^(Continuer|Continue)$/ }).click();
  await typeCode(staff, await totp(key));

  await expect(staff.getByTestId("backup-codes").getByRole("listitem")).toHaveCount(10);
  const done = staff.getByRole("button", { name: /^(Terminer|Done)$/ });
  await expect(done).toBeDisabled();
  await staff.getByRole("checkbox").check();
  await done.click();
  // Then the welcome tour, once, like everyone; then Admin.
  await completeWelcome(staff, { firstName: "Nouvelle" });
  await expect(staff).toHaveURL("/admin");
});
