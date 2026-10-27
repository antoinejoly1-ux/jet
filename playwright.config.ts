import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Lets a machine with a pre-installed Chromium skip `playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // 360px: the narrow end of common phones, so layouts that only just fit fail here, not in CI.
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } } },
  ],
  webServer: {
    command: "pnpm start",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: {
      EMAIL_OUTBOX_FILE: "tmp/emails.jsonl",
      AUTH_RATE_LIMIT: "off",
      REQUIRE_STAFF_2FA: "true",
      OPERATOR_PHONE: "+1 514 555-0100",
    },
  },
});
