import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support";

/**
 * Walks every page each kind of person can reach by following links from
 * where they land, and fails on any error status, console error or page
 * wider than the screen. Downloads, API routes and the sign-out are skipped;
 * pages with ids are sampled twice per kind (two aircraft, two flights...).
 */
const SKIP = [
  /^\/api\//,
  /^\/(files|avatars|aircraft-photos)\//,
  /^\/start$/,
  /\/(export|pdf|statement|statements|data-export)$/,
];
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const PER_PATTERN = 2;
const MAX_PAGES = 70;

/** Console noise that isn't the app's: map tiles and fonts when the network is offline. */
const IGNORED_CONSOLE = [/tile|maplibre|basemaps|fonts\.g/i, /Failed to load resource: net::ERR_/];

async function crawl(page: Page, start: string) {
  const problems: string[] = [];
  const seen = new Set<string>();
  const perPattern = new Map<string, number>();
  const queue = [start];
  let current = start;
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.some((r) => r.test(m.text())))
      problems.push(`${current}: console: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`${current}: ${e.message.slice(0, 200)}`));

  while (queue.length && seen.size < MAX_PAGES) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    const pattern = path.replace(ID, ":id");
    if ((perPattern.get(pattern) ?? 0) >= PER_PATTERN) continue;
    seen.add(path);
    perPattern.set(pattern, (perPattern.get(pattern) ?? 0) + 1);
    current = path;

    const res = await page.goto(path, { waitUntil: "load" });
    if (!res || res.status() >= 400) problems.push(`${path}: HTTP ${res?.status() ?? "none"}`);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) problems.push(`${path}: ${overflow}px wider than the screen`);

    const links = await page.$$eval("a[href]", (as) =>
      as.map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("/") && !h.startsWith("//")),
    );
    for (const href of links) {
      const next = href.split("#")[0]!.split("?")[0]!;
      if (next && !seen.has(next) && !SKIP.some((r) => r.test(next))) queue.push(next);
    }
  }
  return { problems, visited: seen.size };
}

// Finance sees a subset of admin's pages, and its demo account is seeded without 2FA so the setup flow shows first.
const PEOPLE: [email: string, start: string][] = [
  ["owner@jet.test", "/"],
  ["assistant@jet.test", "/"],
  ["gestion@jet.test", "/billing"],
  ["admin@jet.test", "/admin"],
  ["dispatch@jet.test", "/admin"],
  ["pilote@jet.test", "/pilot"],
];

for (const [email, start] of PEOPLE) {
  test(`every page ${email} can reach works`, async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, email);
    const { problems, visited } = await crawl(page, start);
    expect(visited).toBeGreaterThan(1);
    expect(problems).toEqual([]);
  });
}
