import { defineConfig, devices } from "@playwright/test";

// Runs against the full Docker stack (see docker-compose.e2e.yml).
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts", // keeps Vitest and Playwright apart
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Locally, reuse the installed Chrome instead of downloading a browser.
      use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) },
    },
  ],
});
