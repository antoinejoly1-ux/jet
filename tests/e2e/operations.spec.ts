/**
 * Phase 3 "done when": dispatch schedules and completes flights (hours follow),
 * maintenance moves aircraft in and out of service, and owners see their own
 * flights, their aircraft and when it's free, without co-owners' details.
 */
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support";

/** "YYYY-MM-DDTHH:mm", `days` from today, for datetime-local inputs. */
const local = (days: number, time: string) =>
  `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T${time}`;

async function schedule(page: Page, to: string, departsAt: string) {
  await page.goto("/admin/flights/new");
  await page.getByLabel("Appareil").selectOption({ label: "C-GJTA · Pilatus PC-24" });
  await page.getByLabel("Heures de").selectOption({ label: "Jean Tremblay (25 %)" });
  await page.getByLabel("Départ", { exact: true }).fill("cyul");
  await page.getByLabel("Arrivée", { exact: true }).fill(to);
  await page.getByLabel("Heure de départ").fill(departsAt);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Vol enregistré.")).toBeVisible();
}

test("dispatch completes a flight with its flight time and the owner sees it", async ({ page, browser }, testInfo) => {
  const to = testInfo.project.name === "phone" ? "KSUN" : "KASE";
  await signIn(page, "dispatch@jet.test");
  await schedule(page, to, local(-3, "09:00"));

  await page.goto("/admin/flights?view=past");
  const row = page
    .getByRole("listitem")
    .filter({ hasText: `CYUL → ${to}` })
    .filter({ hasText: "Prévu" })
    .first();
  await row.getByRole("button", { name: "Terminer" }).click();
  await row.getByLabel("Temps de vol").fill("1:30");
  await row.getByRole("button", { name: "Terminer" }).click();
  const done = page
    .getByRole("listitem")
    .filter({ hasText: `CYUL → ${to}` })
    .filter({ hasText: "Terminé" })
    .first();
  await expect(done).toContainText("1,5 h de vol");

  // A future flight can't be completed by mistake.
  await schedule(page, to, local(5, "10:00"));
  const future = page
    .getByRole("listitem")
    .filter({ hasText: `CYUL → ${to}` })
    .filter({ hasText: "Prévu" })
    .first();
  await future.getByRole("button", { name: "Terminer" }).click();
  await future.getByLabel("Temps de vol").fill("1:00");
  await future.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Ce vol n'est pas encore parti.")).toBeVisible();

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "owner@jet.test");
  await owner.goto("/flights");
  const past = owner.getByRole("region", { name: "Passés" });
  await expect(
    past
      .getByRole("listitem")
      .filter({ hasText: `CYUL → ${to}` })
      .first(),
  ).toContainText("1,5 h");
  await expect(owner.getByRole("region", { name: "À venir" })).toContainText(`CYUL → ${to}`);
});

test("a blocked period shows to the owner as booked, without co-owners' details", async ({
  page,
  browser,
}, testInfo) => {
  const day = testInfo.project.name === "phone" ? 40 : 41;
  const start = local(day, "08:00");
  const month = start.slice(0, 7);
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/aircraft");
  await page
    .getByRole("link", { name: /C-GJTA/ })
    .first()
    .click();
  await page.getByLabel("Du", { exact: true }).fill(start);
  await page.getByLabel("Au", { exact: true }).fill(local(day, "18:00"));
  await page.getByLabel("Affiché comme").selectOption("booked");
  await page.getByRole("button", { name: "Bloquer" }).click();
  await expect(page.getByText("Période bloquée.")).toBeVisible();

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "owner@jet.test");
  await owner.goto(`/availability?month=${month}`);
  await expect(owner.getByRole("heading", { name: "Disponibilité" })).toBeVisible();
  const taken = owner.getByRole("region", { name: "Périodes occupées" });
  await expect(taken).toContainText("Réservé");
  // Co-owners' flights on C-GJTA are only "booked": no routes or names that aren't the owner's.
  await owner.goto(`/availability`);
  await expect(owner.locator("main")).not.toContainText("Marie Gagnon");
  await expect(owner.locator("main")).not.toContainText("Groupe Laurentides");

  await owner.goto("/aircraft");
  await expect(owner.getByRole("heading", { name: "C-GJTA" })).toBeVisible();
  await expect(owner.getByText("Inspection de 600 heures")).toBeVisible();
});

test("starting and finishing maintenance takes the aircraft out of service and back", async ({ page }, testInfo) => {
  const title = `Inspection e2e ${testInfo.project.name}`;
  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin/maintenance/new");
  await page.getByLabel("Appareil").selectOption({ label: "C-GJTC · Cessna Citation CJ4" });
  await page.getByLabel("Travaux").fill(title);
  await page.getByLabel("Début").fill(local(1, "08:00"));
  await page.getByLabel("Fin", { exact: true }).fill(local(2, "17:00"));
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Maintenance enregistrée.")).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Commencer" }).click();
  await expect(row).toContainText("En cours");
  await page.goto("/admin/aircraft");
  await expect(page.getByRole("listitem").filter({ hasText: "C-GJTC" })).toContainText("En maintenance");

  await page.goto("/admin/maintenance");
  await page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByRole("region", { name: "Terminées et annulées" })).toContainText(title);
  await page.goto("/admin/aircraft");
  await expect(page.getByRole("listitem").filter({ hasText: "C-GJTC" })).toContainText("Disponible");
});
