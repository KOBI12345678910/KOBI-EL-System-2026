// @ts-check
/**
 * Playwright configuration for techno-kol-ops client (E2E).
 * Dev server: Vite on http://localhost:3000 (see vite.config.ts).
 * All tests run against the dev server. Network responses to /api/* are
 * mocked inside each spec via page.route() — no real backend required.
 *
 * Usage:
 *   npm run test:e2e                 # headless, all projects
 *   npm run test:e2e -- --ui         # interactive UI mode
 *   npm run test:e2e -- --headed     # show browser
 *   npm run test:e2e -- tests/e2e/ops-dashboard.spec.js
 */
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: ['**/responsive.spec.js', '**/rtl-hebrew.spec.js'],
    },
  ],

  // Auto-start the Vite dev server before tests.
  // Skip by exporting E2E_SKIP_WEBSERVER=1 if you already have it running.
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
