/**
 * Captures the screens the welcome tour shows (public/images/tour/*.jpg) from
 * a running, freshly seeded build, so the tour always shows the real product.
 *
 *   pnpm build && pnpm db:seed && pnpm start   # in another terminal
 *   node scripts/capture-tour-shots.mjs [http://localhost:3000]
 *
 * Desktop screens at 1440×900, the pilot's at 390×844, in the light theme.
 */
import { mkdirSync } from "node:fs";
import { createOTP } from "@better-auth/utils/otp";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "public/images/tour";
const PASSWORD = "demo-password-2026";
const TOTP_SECRET = "JetDemoTotpSecretForLocalUse2026";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function session(email, viewport) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport === PHONE ? 2 : 1.5,
    isMobile: viewport === PHONE,
    hasTouch: viewport === PHONE,
  });
  await ctx.addCookies([{ name: "theme", value: "light", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.waitForLoadState("networkidle");
  // The form needs its JavaScript before it signs in.
  await page.waitForTimeout(1500);
  await page.getByLabel(/^(Courriel|Email)$/).fill(email);
  await page.getByLabel(/^(Mot de passe|Password)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^(Se connecter|Sign in)$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
  if (new URL(page.url()).pathname === "/two-factor") {
    await page.getByLabel(/^Code$/).fill(await createOTP(TOTP_SECRET).totp());
    await page.waitForURL((u) => u.pathname !== "/two-factor");
  }
  return page;
}

/** Opens a page, lets the map and fonts settle, optionally scrolls to an element, and saves the screen. */
async function shot(page, name, path, { scrollTo, before } = {}) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (before) await before(page);
  if (scrollTo) await page.locator(scrollTo).first().scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 80 });
  console.log("✓", name);
}

/** The first link on a page matching one of the selectors, or null. */
const firstHref = async (page, path, ...selectors) => {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  for (const selector of selectors) {
    const link = page.locator(selector).first();
    if (await link.count()) return link.getAttribute("href");
  }
  return null;
};

// Owner
{
  const p = await session("owner@jet.test", DESKTOP);
  await shot(p, "owner-live", "/", { scrollTo: "#live" });
  await shot(p, "owner-hours", "/availability");
  await shot(p, "owner-finances", "/finances");
  await shot(p, "owner-flights", await firstHref(p, "/flights", 'a[href^="/flights/0"]'));
}
// Staff
{
  const p = await session("admin@jet.test", DESKTOP);
  await shot(p, "staff-todo", "/admin");
  await shot(p, "staff-fleet", await firstHref(p, "/admin/aircraft", 'a[href^="/admin/aircraft/0"]'));
  await shot(p, "staff-ops", "/admin/maintenance");
  await shot(p, "staff-billing", await firstHref(p, "/admin/flight-reports", 'a[href^="/admin/flight-reports/0"]'));
}
// Pilot, on a phone
{
  const p = await session("pilote@jet.test", PHONE);
  const flight = await firstHref(p, "/pilot", 'a[href^="/pilot/flights/"]');
  await shot(p, "pilot-report", flight);
  await shot(p, "pilot-receipts", flight, {
    before: async (page) => {
      await page.getByRole("button", { name: /Ajouter une dépense|Add an expense/ }).click();
      await page.getByRole("button", { name: /Ajouter une dépense|Add an expense/ }).scrollIntoViewIfNeeded();
    },
  });
  await shot(p, "pilot-returned", "/pilot");
}
// Company manager
{
  const p = await session("gestion@jet.test", DESKTOP);
  await shot(p, "manager-approved", "/billing");
  // A flight to invoice shows the taxes being worked out; failing that, an issued invoice.
  const taxes = await firstHref(p, "/billing", 'a[href^="/billing/0"]', 'a[href^="/invoices/0"]');
  if (taxes) await shot(p, "manager-taxes", taxes);
  await shot(p, "manager-results", await firstHref(p, "/billing", 'a[href^="/results/"]'));
}

await browser.close();
