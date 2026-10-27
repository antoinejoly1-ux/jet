import { existsSync, readFileSync } from "node:fs";
import { createOTP } from "@better-auth/utils/otp";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "demo-password-2026";
/** Same value as scripts/seed.ts. */
export const DEMO_TOTP_SECRET = "JetDemoTotpSecretForLocalUse2026";
export const DEMO_BACKUP_CODES = ["demo1-aaaaa", "demo2-bbbbb", "demo3-ccccc", "demo4-ddddd", "demo5-eeeee"];
const OUTBOX = "tmp/emails.jsonl";

export const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export const totp = (rawSecret = DEMO_TOTP_SECRET) => createOTP(rawSecret).totp();

/** The key shown during setup is base32; the TOTP helper wants the raw secret. */
export function rawFromBase32(base32: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/[\s=]/g, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString("utf8");
}

export function latestLink(to: string): string {
  if (!existsSync(OUTBOX)) throw new Error("No email outbox; start the app with EMAIL_OUTBOX_FILE set.");
  const emails = readFileSync(OUTBOX, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { to: string; text: string });
  const email = emails.filter((e) => e.to === to).at(-1);
  const url = email?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`No email with a link for ${to}`);
  return url;
}

export async function typeCode(page: Page, code: string) {
  await page.getByLabel(/^Code$/).fill(code);
}

/** Signs in with a password; for 2FA accounts, also enters the demo code. */
export async function signIn(page: Page, email: string, { secondFactor = true } = {}) {
  await page.goto("/sign-in");
  await page.getByLabel(/^(Courriel|Email)$/).fill(email);
  await page.getByLabel(/^(Mot de passe|Password)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^(Se connecter|Sign in)$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  if (secondFactor && new URL(page.url()).pathname === "/two-factor") {
    await typeCode(page, await totp());
    await page.waitForURL((url) => url.pathname !== "/two-factor");
  }
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * Goes through the welcome tour a new account sees once: name, a profile
 * photo (any real image; the browser crops and resizes it), the tour, the team.
 */
export async function completeWelcome(page: Page, { firstName }: { firstName: string }) {
  await expect(page).toHaveURL("/welcome");
  await page.getByRole("button", { name: /^(Commencer|Begin)/ }).click();
  await page.getByLabel(/^(Prénom|First name)$/).fill(firstName);
  await page.getByRole("button", { name: /^(Continuer|Continue)/ }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "me.webp",
    mimeType: "image/webp",
    buffer: readFileSync("public/images/team/marie-laurence-boisvert.webp"),
  });
  await page.getByRole("button", { name: /Enregistrer la photo|Save photo/ }).click();
  await expect(page.getByRole("button", { name: /^(Changer|Change)$/ })).toBeVisible();
  await page.getByRole("button", { name: /^(Continuer|Continue)/ }).click();
  const next = page.getByRole("button", { name: /^(Suivant|Next)/ });
  while (await next.isVisible()) await next.click();
  await page.getByRole("button", { name: /^(Continuer|Continue)/ }).click();
  await expect(page.getByRole("link", { name: /^(Appeler|Call)/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /^(Continuer|Continue)/ }).click();
  await page.getByRole("button", { name: /Entrer dans mon espace|Enter my space/ }).click();
  await expect(page).not.toHaveURL(/\/welcome/);
}
