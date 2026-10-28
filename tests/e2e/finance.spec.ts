/**
 * Phase 2 "done when": the team enters finances without help (invoices with
 * PDFs, budgets, the ledger, spreadsheet imports) and owners see their own
 * numbers and invoices, and nobody else's.
 */
import { expect, test } from "@playwright/test";
import { signIn, unique } from "./support";

const pdf = (title: string) =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n% ${title}\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
  );

test("an invoice with its PDF is issued, and only its owner can open the PDF", async ({ page, browser }, testInfo) => {
  const number = `INV-${testInfo.project.name === "phone" ? 7 : 8}${unique().slice(-3)}-0042`;
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/invoices/new");
  await page
    .getByLabel(/Déposez un fichier/)
    .setInputFiles({ name: `${number}.pdf`, mimeType: "application/pdf", buffer: pdf(number) });
  await expect(page.getByText(`${number}.pdf`)).toBeVisible();
  await expect(page.getByLabel("Numéro de facture")).toHaveValue(number);
  await page.getByLabel("Part facturée").selectOption({ label: "C-GJTA · Jean Tremblay (25 %)" });
  await page.getByLabel("Montant total").fill("1 234,56");
  await page.getByRole("button", { name: "Émettre la facture" }).click();
  await expect(page.getByText("Facture émise. Le propriétaire a été avisé.")).toBeVisible();
  await page.getByRole("searchbox").fill(number);
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page.getByText("1 234,56 $").first()).toBeVisible();

  // Someone else's invoice, to check isolation below.
  await page.getByRole("searchbox").fill("Marie");
  await page.getByRole("button", { name: "Filtrer" }).click();
  const otherFile = await page.getByRole("link", { name: "Voir le PDF" }).first().getAttribute("href");

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "owner@jet.test");
  await owner.goto("/invoices");
  const row = owner.getByRole("listitem").filter({ hasText: number });
  await expect(row).toContainText("1 234,56 $");
  const href = await row.getByRole("link", { name: `Télécharger la facture ${number}` }).getAttribute("href");
  const mine = await owner.request.get(href!);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-type"]).toBe("application/pdf");
  expect((await mine.body()).toString()).toContain(number);

  const theirs = await owner.request.get(otherFile!.replace("?inline=1", ""));
  expect(theirs.status()).toBe(404);
});

test("a budget stays hidden until published, then the owner sees it", async ({ page }, testInfo) => {
  const year = new Date().getFullYear() + 1;
  const owner = testInfo.project.name === "phone" ? "Groupe Laurentides inc." : "Sophie Roy";
  await signIn(page, "admin@jet.test");
  await page.goto(`/admin/budgets?year=${year}`);
  await page.getByRole("link", { name: new RegExp(`C-GJTA · ${owner}`) }).click();
  await expect(page.getByText(`Aucun budget ${year}`).first()).toBeVisible();
  await page.getByLabel("Carburant").fill("50 000");
  await page.getByLabel("Hangar").fill("12000");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Budget enregistré." })).toBeVisible();
  await expect(page.getByText("Brouillon").first()).toBeVisible();

  // Before publishing, the owner doesn't see the plan.
  const ownerUrl = page.url();
  await page.goto("/admin/owners");
  await page.getByRole("link", { name: owner }).first().click();
  await page.getByRole("button", { name: "Voir comme ce propriétaire" }).click();
  await expect(page.getByRole("status").filter({ hasText: owner })).toBeVisible();
  await page.goto(`/finances?year=${year}`);
  await expect(page.getByText(`Le budget ${year} n'est pas encore publié.`)).toBeVisible();
  await page.getByRole("button", { name: "Quitter" }).click();

  await page.goto(ownerUrl);
  await page.getByRole("button", { name: "Rendre visible au propriétaire" }).click();
  await expect(page.getByText("Publié").first()).toBeVisible();

  await page.goto("/admin/owners");
  await page.getByRole("link", { name: owner }).first().click();
  await page.getByRole("button", { name: "Voir comme ce propriétaire" }).click();
  await expect(page.getByRole("status").filter({ hasText: owner })).toBeVisible();
  await page.goto(`/finances?year=${year}`);
  await expect(page.getByText("62 000,00 $").first()).toBeVisible();
  await page.getByRole("button", { name: "Quitter" }).click();
});

test("a ledger entry is corrected by reversing it, never by editing", async ({ page }) => {
  const label = `Correction test ${unique()}`;
  await signIn(page, "admin@jet.test");
  await page.goto("/admin/transactions");
  await page.getByLabel("Part", { exact: true }).last().selectOption({ label: "C-FJTB · Luc Bergeron (50 %)" });
  await page.getByLabel("Montant").fill("777,77");
  await page.getByLabel("Description").fill(label);
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Entrée ajoutée.")).toBeVisible();

  const entry = page.getByRole("listitem").filter({ hasText: label });
  await expect(entry).toContainText("777,77 $");
  await entry.getByRole("button", { name: "Contrepasser" }).click();
  await entry.getByLabel("Raison (facultatif)").fill(`Doublon ${label}`);
  await entry.getByRole("button", { name: "Contrepasser" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: label }).getByText("Contrepassée")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: `Doublon ${label}` })).toContainText("-777,77 $");
});

test("a spreadsheet is checked row by row, then imported", async ({ page }) => {
  const tag = unique();
  const csv = [
    "Date,Immatriculation,Propriétaire,Type,Montant,Catégorie,Description",
    `01/03/2026,C-GJTA,Jean Tremblay,Coût,"1 500,00",Carburant,Import ${tag} A`,
    `2026-03-02,c-gjta,jean tremblay,,250,,Import ${tag} B`,
    `31/02/2026,C-GJTA,Jean Tremblay,Coût,10,,Import ${tag} C`,
  ].join("\n");

  await signIn(page, "admin@jet.test");
  await page.goto("/admin/imports");
  await page
    .getByLabel(/Déposez un fichier/)
    .setInputFiles({ name: "mars.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("mars.csv · 3 lignes")).toBeVisible();
  // Columns are matched from the headers.
  await expect(page.getByLabel("Montant *")).toHaveValue("Montant");
  await page.getByRole("button", { name: "Vérifier les lignes" }).click();
  await expect(page.getByText("2 lignes sur 3 sont prêtes à être importées.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Date illisible" })).toContainText("4");
  await page.getByRole("button", { name: "Importer 2 lignes" }).click();
  await expect(page.getByText("2 transactions importées, 1 ligne ignorée.")).toBeVisible();

  await page.goto(`/admin/transactions?year=2026`);
  await page
    .getByRole("combobox", { name: "Part", exact: true })
    .first()
    .selectOption({ label: "C-GJTA · Jean Tremblay (25 %)" });
  await page.getByRole("button", { name: "Filtrer" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `Import ${tag} A` })).toContainText("Importée");
});
