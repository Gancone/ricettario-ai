import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3100', channel: 'chrome', serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 90000 }
});
