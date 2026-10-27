/**
 * Every main screen passes axe's WCAG 2.1 A and AA checks, on desktop and
 * phone, in light mode. Anything flagged fails the build.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support";

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const problems = results.violations.map(
    (v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(problems, problems.join("\n")).toEqual([]);
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
    "/admin/maintenance",
    "/admin/messages",
    "/admin/invoices",
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

test("dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await audit(page, "/sign-in");
  await signIn(page, "admin@jet.test");
  for (const path of ["/", "/availability", "/finances", "/messages", "/admin", "/admin/flights", "/admin/maintenance"])
    await audit(page, path);
});
