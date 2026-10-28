/**
 * Every main screen passes axe's WCAG 2.1 A and AA checks, on desktop and
 * phone, and never scrolls sideways. Anything flagged fails the build.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support";

// Each test audits a dozen pages or more, some with a live map loading tiles.
test.describe.configure({ timeout: 120_000 });

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const problems = results.violations.map(
    (v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(problems, problems.join("\n")).toEqual([]);
  // Nothing wider than the screen: a sideways-scrolling page is broken on a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path} is ${overflow}px wider than the screen`).toBeLessThanOrEqual(0);
}

test("public screens", async ({ page }) => {
  for (const path of ["/sign-in", "/sign-up", "/forgot-password", "/privacy"]) await audit(page, path);
});

test("owner screens", async ({ page }) => {
  await signIn(page, "owner@jet.test");
  for (const path of [
    "/",
    "/flights",
    "/availability",
    "/finances",
    "/invoices",
    "/aircraft",
    "/messages",
    "/notifications",
    "/account",
  ])
    await audit(page, path);
});

test("admin screens", async ({ page }) => {
  await signIn(page, "admin@jet.test");
  for (const path of [
    "/admin",
    "/admin/owners",
    "/admin/holding-companies",
    "/admin/aircraft",
    "/admin/flights",
    "/admin/flights/new",
    "/admin/maintenance/new",
    "/admin/maintenance",
    "/admin/messages",
    "/admin/invoices",
    "/admin/flight-reports",
    "/admin/transactions",
    "/admin/budgets",
    "/admin/imports",
    "/admin/invitations",
    "/admin/settings",
    "/admin/settings/privacy",
    "/admin/settings/developers",
    "/admin/settings/audit",
  ])
    await audit(page, path);
});

test("pilot screens", async ({ page }) => {
  await signIn(page, "pilote@jet.test");
  await audit(page, "/pilot");
  // The report form of the first flight to report.
  await page.getByRole("link", { name: /→/ }).first().click();
  await audit(page, new URL(page.url()).pathname);
});

test("dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await audit(page, "/sign-in");
  await signIn(page, "admin@jet.test");
  for (const path of ["/", "/availability", "/finances", "/messages", "/admin", "/admin/flights", "/admin/maintenance"])
    await audit(page, path);
});
