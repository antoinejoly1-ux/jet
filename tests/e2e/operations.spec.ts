/**
 * Phase 3 "done when": dispatch schedules and completes flights (hours follow),
 * maintenance moves aircraft in and out of service, and owners see their own
 * flights, their aircraft and when it's free, without co-owners' details.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn } from "./support";

/** "YYYY-MM-DDTHH:mm", `days` from today, for datetime-local inputs. */
const local = (days: number, time: string) =>
  `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T${time}`;

async function schedule(page: Page, to: string, departsAt: string) {
  await page.goto("/admin/flights/new");
  await page.getByLabel("Appareil").selectOption({ label: "C-GJTA · Pilatus PC-12 NGX" });
  await page.getByLabel("Facturé à", { exact: true }).selectOption({ label: "Jean Tremblay (25 %)" });
  await page.getByLabel("Départ", { exact: true }).fill("cyul");
  await page.getByLabel("Arrivée", { exact: true }).fill(to);
  await page.getByLabel("Heure de départ").fill(departsAt);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
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
    .filter({ hasText: "À clôturer" })
    .first();
  await row.getByRole("button", { name: "Terminer" }).click();
  await row.getByLabel("Temps de vol").fill("1:30");
  await row.getByRole("button", { name: "Terminer" }).click();
  const done = page
    .getByRole("listitem")
    .filter({ hasText: `CYUL → ${to}` })
    .filter({ hasText: "Terminé" })
    .first();
  await expect(done).toContainText("1 h 30 de vol");

  // A future flight can't be completed by mistake.
  await schedule(page, to, local(5, "10:00"));
  const future = page
    .getByRole("listitem")
    .filter({ hasText: `CYUL → ${to}` })
    .filter({ hasText: "Prévu" })
    .first();
  await expect(future).toBeVisible();
  await expect(future.getByRole("button", { name: "Terminer" })).toHaveCount(0);

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "owner@jet.test");
  await owner.goto("/flights");
  const past = owner.getByRole("region", { name: "Passés" });
  await expect(
    past
      .getByRole("listitem")
      .filter({ hasText: `CYUL → ${to}` })
      .first(),
  ).toContainText("1 h 30");
  await expect(owner.getByRole("region", { name: "À venir" })).toContainText(`CYUL → ${to}`);
});

test("a blocked period shows to the owner as booked, and co-owners' flights by name", async ({
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
  await expect(owner.getByRole("heading", { name: "Calendrier" })).toBeVisible();
  const taken = owner.getByRole("region", { name: /^(Périodes occupées|À venir)$/ });
  await expect(taken).toContainText("Réservé");
  // Co-owners know each other: their flights on C-GJTA show as booked with their name.
  // The seed's first co-owner flight is six days out, so it's in this month or the next.
  const now = new Date();
  let seen = "";
  for (const d of [now, new Date(now.getFullYear(), now.getMonth() + 1, 1)]) {
    await owner.goto(`/availability?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    seen += await owner.getByRole("region", { name: /^(Périodes occupées|À venir)$/ }).innerText();
  }
  expect(seen).toContain("Réservé · Marie Gagnon");

  await owner.goto("/aircraft");
  await expect(owner.getByRole("heading", { name: "C-GJTA" })).toBeVisible();
  // Owners see when the aircraft is in maintenance, not what the work is.
  await expect(owner.getByText(/^Maintenance du /).first()).toBeVisible();
  await expect(owner.locator("main")).not.toContainText("Inspection de 600 heures");
});

test("starting and finishing maintenance takes the aircraft out of service and back", async ({ page }, testInfo) => {
  const title = `Inspection e2e ${testInfo.project.name}`;
  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin/maintenance/new");
  await page.getByLabel("Appareil").selectOption({ label: "C-GJTC · Cessna Citation CJ4" });
  await page.getByLabel("Travaux").fill(title);
  await page.getByLabel("Début").fill(local(1, "08:00"));
  await page.getByLabel("Fin", { exact: true }).fill(local(2, "17:00"));
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Maintenance enregistrée.")).toBeVisible();

  // The board: each job moves one column at a time.
  const card = () => page.getByRole("listitem").filter({ hasText: title });
  await card().getByRole("button", { name: "Commencer" }).click();
  await expect(page.getByRole("region", { name: /^En cours/ })).toContainText(title);
  await page.goto("/admin/aircraft");
  await expect(page.getByRole("listitem").filter({ hasText: "C-GJTC" })).toContainText("En maintenance");

  await page.goto("/admin/maintenance");
  await card().getByRole("button", { name: "Envoyer en vérification" }).click();
  await expect(page.getByRole("region", { name: /^En vérification/ })).toContainText(title);
  // Someone else approves: whoever sent the job to review can't sign it off.
  await expect(card().getByRole("button", { name: "Approuver" })).toHaveCount(0);
  await page.context().clearCookies();
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/maintenance");
  await card().getByRole("button", { name: "Approuver" }).click();
  await expect(page.getByRole("region", { name: /^Terminé/ })).toContainText(title);
  await page.goto("/admin/aircraft");
  await expect(page.getByRole("listitem").filter({ hasText: "C-GJTC" })).toContainText("Disponible");
});

/** Presses on `from`, moves in small steps to `to` (a point inside it) and lets go, as a mouse would. */
async function dragTo(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  const width = page.viewportSize()?.width ?? 1440;
  if (!a || !b) throw new Error("drag: element not visible");
  // On a phone the next column is only partly on screen: aim at its visible part.
  const x = Math.min(b.x + b.width / 2, width - 60);
  const y = b.y + Math.min(b.height / 2, 120);
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + 24, { steps: 3 });
  await page.mouse.move(x, y, { steps: 15 });
  await page.mouse.up();
}

test("dragging a card from Planifié to En cours starts the job", async ({ page }, testInfo) => {
  const title = `Glisser e2e ${testInfo.project.name} ${Date.now()}`;
  await signIn(page, "dispatch@jet.test");
  await page.goto("/admin/maintenance/new");
  await page.getByLabel("Appareil").selectOption({ label: "C-GUVR · Beechcraft King Air 350i" });
  await page.getByLabel("Travaux").fill(title);
  await page.getByLabel("Début").fill(local(20, "08:00"));
  await page.getByLabel("Fin", { exact: true }).fill(local(21, "17:00"));
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Maintenance enregistrée.")).toBeVisible();

  const planned = page.getByRole("region", { name: /^Planifié/ });
  const inProgress = page.getByRole("region", { name: /^En cours/ });
  const card = planned.getByRole("listitem").filter({ hasText: title });
  await expect(card).toBeVisible();

  if (testInfo.project.name === "desktop") {
    // A jump of two columns is refused, with the reason, and the card stays put.
    await dragTo(page, card.getByText(title), page.getByRole("region", { name: /^Terminé/ }));
    await expect(page.getByRole("alert").filter({ hasText: "une colonne à la fois" })).toBeVisible();
    await expect(planned).toContainText(title);
  }

  await dragTo(page, card.getByText(title), inProgress);
  await expect(inProgress).toContainText(title);
  await expect(planned).not.toContainText(title);
  // It sticks: the server moved it, not only the screen.
  await page.reload();
  await expect(page.getByRole("region", { name: /^En cours/ })).toContainText(title);

  // Leave the aircraft as it was for the other tests.
  await page
    .getByRole("region", { name: /^En cours/ })
    .getByRole("listitem")
    .filter({ hasText: title })
    .getByRole("button", { name: "Autres actions" })
    .click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Annuler les travaux" }).click();
  await page.getByRole("button", { name: "Annuler les travaux" }).last().click();
  await expect(page.getByRole("region", { name: /^En cours/ })).not.toContainText(title);
});
