import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const systemChromiumPath = [
  process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"],
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((entry): entry is string => Boolean(entry && existsSync(entry)));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env["CI"] ? 1 : 0,
  ...(process.env["CI"] ? { workers: 2 } : {}),
  reporter: "list",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: "http://127.0.0.1:4189",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(systemChromiumPath
      ? { launchOptions: { executablePath: systemChromiumPath } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
