import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on 3300 and the local Supabase stack (`pnpm db:start`).
// Sign-in emails are read from the local Mailpit inbox. Stop `pnpm dev` first: if it is running, Playwright
// reuses it, and dev-mode server actions can take over 5 s under parallel tests.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Parallel workers share one local server (and a laptop with other Docker stacks), so a page or server action
  // can take several seconds under load. Generous timeouts instead of retries keep real failures visible.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3300",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3300",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
