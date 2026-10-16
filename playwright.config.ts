import { defineConfig } from "@playwright/test";
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
    serviceWorkers: "block",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: production
      ? "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100"
      : "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 90000,
  },
});
