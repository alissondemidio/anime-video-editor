import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4321",
    viewport: { width: 1600, height: 1000 },
    headless: true,
    actionTimeout: 20000,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (process.platform === "linux" ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node dist/server.cjs",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: false,
    env: { PORT: "4321", ANIME_STUDIO_DATA: process.cwd() + "/work/e2e-data" },
    timeout: 30000,
  },
});
