import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support";

/** Replays the tour from the account menu, walks it, and returns where the last button leads. */
async function replayTour(page: Page, { title, enter }: { title: RegExp; enter: RegExp }) {
  await page.getByRole("button", { name: /Ouvrir le menu du compte|Open account menu/ }).click();
  await page.getByRole("menuitem", { name: /Revoir la visite|See the tour again/ }).click();
  await expect(page).toHaveURL("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await page.getByRole("button", { name: /^(Commencer|Begin)/ }).click();
  await page.getByRole("button", { name: /^(Continuer|Continue)/ }).click();
  const next = page.getByRole("button", { name: /^(Suivant|Next)/ });
  await expect(next).toBeVisible();
  while (await next.isVisible()) await next.click();
  await page.getByRole("button", { name: /^(Continuer|Continue)/ }).click();
  // The team step: colleagues, without the owners' call buttons.
  await expect(
    page.getByRole("heading", { name: /L'équipe avec qui vous travaillez|The team you work with/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^(Continuer|Continue)/ }).click();
  await page.getByRole("button", { name: enter }).click();
  await expect(page).not.toHaveURL(/\/welcome/);
}

test("the team sees its own tour, and can see it again from the account menu", async ({ page }) => {
  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin");
  await replayTour(page, {
    title: /Bienvenue dans l'équipe|Welcome to the team/,
    enter: /Ouvrir le tableau de bord|Open the dashboard/,
  });
  await expect(page).toHaveURL("/admin");
});

test("pilots see a tour about their reports", async ({ page }) => {
  await signIn(page, "pilote@jet.test");
  await page.goto("/pilot");
  await replayTour(page, {
    title: /Bienvenue à bord|Welcome aboard/,
    enter: /Voir mes rapports de vol|See my flight reports/,
  });
  await expect(page).toHaveURL("/pilot");
});
