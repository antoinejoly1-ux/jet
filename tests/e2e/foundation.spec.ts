/**
 * Phase 0 "done when" checks, run against the real app with seeded data
 * (pnpm db:seed). Email links are read from the local outbox file.
 */
import { expect, test } from "@playwright/test";
import { completeWelcome, latestLink, PASSWORD, signIn, unique } from "./support";

test("an owner sees their own aircraft on Home", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  await expect(page).toHaveURL("/");
  await expect(page.getByText(/(Bonjour|Bon après-midi|Bonsoir), Jean/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Votre .+ (est en vol|vous attend|est en maintenance)/,
  );
  await expect(page.getByText("C-GJTA").first()).toBeVisible();
  // Another owner's aircraft never appears.
  await expect(page.getByText("C-FJTB")).toHaveCount(0);
  // No toggle for owners.
  await expect(page.getByRole("group", { name: /Changer de vue|Switch view/ })).toHaveCount(0);
});

test("an owner who opens /admin is sent back to the Client side", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  await expect(page).toHaveURL("/");
  await page.goto("/admin/owners");
  await expect(page).toHaveURL("/");
});

test("staff switch between Client and Admin with the toggle", async ({ page }) => {
  await signIn(page, "admin@jet.test");
  await expect(page).toHaveURL("/admin");
  const toggle = page.getByRole("group", { name: /Changer de vue|Switch view/ });
  await toggle.getByRole("link", { name: "Client" }).click();
  await expect(page).toHaveURL("/");
  await toggle.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Les opérations|Operations/);
});

test("an invited owner signs up, verifies their email, takes the welcome tour and lands on their dashboard", async ({
  browser,
  page,
}) => {
  const email = `invitee-${unique()}@example.com`;

  // Admin sends the invitation for Marie Gagnon's share.
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/invitations");
  await page.getByLabel(/^(Courriel|Email)$/).fill(email);
  await page.getByLabel(/^(Accès|Access)$/).selectOption({ label: "Marie Gagnon" });
  await page.getByRole("button", { name: /Envoyer l'invitation|Send invitation/ }).click();
  await expect(page.getByRole("status")).toContainText(email);
  const inviteUrl = latestLink(email);

  // The invitee, in a fresh browser, creates an account from the link.
  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(inviteUrl);
  await invitee.getByRole("link", { name: /Créer mon compte|Create my account/ }).click();
  await invitee.getByLabel(/Nom complet|Full name/).fill("Marie Gagnon");
  await expect(invitee.getByLabel(/^(Courriel|Email)$/)).toHaveValue(email);
  await invitee.getByLabel(/^(Mot de passe|Password)$/).fill(PASSWORD);
  await invitee.getByRole("button", { name: /Créer un compte|Create an account/ }).click();
  await expect(invitee.getByRole("heading", { name: /Vérifiez vos courriels|Check your email/ })).toBeVisible();

  // Verifying the email signs them in and returns them to the invitation.
  await invitee.goto(latestLink(email));
  await expect(invitee).toHaveURL(/\/invite\//);
  await invitee.getByRole("button", { name: /Accepter l'invitation|Accept the invitation/ }).click();

  // First visit: the welcome tour, once, then Home with their photo in the top bar.
  await completeWelcome(invitee, { firstName: "Marie" });
  await expect(invitee).toHaveURL("/");
  await expect(invitee.getByText("C-GJTA").first()).toBeVisible();
  await expect(invitee.locator('header img[src^="/avatars/"]')).toBeVisible();
  await invitee.goto("/welcome");
  await expect(invitee).toHaveURL("/");

  // The link is single-use.
  await invitee.goto(inviteUrl);
  await expect(
    invitee.getByRole("heading", { name: /Invitation non disponible|Invitation unavailable/ }),
  ).toBeVisible();
});

test("someone who signs up without an invitation waits on the pending screen", async ({ page }) => {
  const email = `stranger-${unique()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel(/Nom complet|Full name/).fill("Sam Stranger");
  await page.getByLabel(/^(Courriel|Email)$/).fill(email);
  await page.getByLabel(/^(Mot de passe|Password)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /Créer un compte|Create an account/ }).click();
  await expect(page.getByRole("heading", { name: /Vérifiez vos courriels|Check your email/ })).toBeVisible();
  await page.goto(latestLink(email));
  await expect(page).toHaveURL("/pending");
  await page.goto("/");
  await expect(page).toHaveURL("/pending");
});
