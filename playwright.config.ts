import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const fakeApiUrl = "http://127.0.0.1:54321";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/e2e/fake-api-server.mjs",
      url: `${fakeApiUrl}/__test/health`,
      reuseExistingServer: false,
      timeout: 15_000,
      env: { FAKE_API_PORT: "54321" },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
      url: appUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_SUPABASE_URL: fakeApiUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
      },
    },
  ],
});
