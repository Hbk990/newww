import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * The browser is not downloaded here.
 *
 * This environment ships Chromium at a fixed path; on a developer machine
 * `npx playwright install chromium` puts it where Playwright looks by default.
 * Probing for the first and falling back to the second means the same config
 * works in both without a per-machine edit.
 */
const preinstalled = "/opt/pw-browsers/chromium";
const executablePath = existsSync(preinstalled) ? preinstalled : undefined;

/**
 * End-to-end tests get their own database, never the working one.
 *
 * `globalSetup` resets users and clears the login throttle, which would be a
 * rude thing to do to a database someone is developing against. Point
 * `E2E_DATABASE_URL` at a scratch database migrated to head.
 */
const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One worker: the tests share three fixed accounts and the login throttle is
  // counted per identifier, so parallel logins would throttle each other.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: databaseUrl ? { DATABASE_URL: databaseUrl } : {},
  },
});
