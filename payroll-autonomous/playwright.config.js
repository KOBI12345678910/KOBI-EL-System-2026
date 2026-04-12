// @ts-check
/**
 * Playwright configuration for payroll-autonomous E2E tests
 *
 * - Chromium-only, headless
 * - Screenshots on failure
 * - Auto-starts Vite dev server on :5174
 * - All /api/payroll/** calls are mocked inside each test (page.route).
 *   No live backend is required for the suite to pass.
 *
 * NOTE: @playwright/test is intentionally NOT listed in package.json.
 * Install it manually with `npm i -D @playwright/test` before first run.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.(js|ts)$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 900 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
