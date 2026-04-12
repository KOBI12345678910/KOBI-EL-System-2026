// @ts-check
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLAYWRIGHT CONFIG — onyx-procurement
 * Agent 52 · E2E + API-contract testing for the Palantir-dark dashboards
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dashboards under test (served from /web by express.static in server.js):
 *   • index.html              — Mega Index landing page (Agent 29)
 *   • vat-dashboard.html      — VAT dashboard            (Agent 26)
 *   • bank-dashboard.html     — Bank reconciliation      (Agent 27)
 *   • annual-tax-dashboard.html — Annual tax             (Agent 28)
 *
 * The config boots a lightweight static HTTP server (see webServer section)
 * so tests can run without a live backend. All API calls are mocked via
 * page.route() in individual specs (see fixtures.js).
 *
 * USAGE
 *   npx playwright install                  # install browsers once
 *   npx playwright test                     # run full suite
 *   npx playwright test --project=desktop   # only 1920x1080
 *   npx playwright test --ui                # interactive mode
 *
 * Env vars:
 *   PW_BASE_URL   override the default http://127.0.0.1:4319
 *   PW_KEEP_OPEN  set to "1" to leave the browser open after failures
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PORT = Number(process.env.PW_PORT || 4319);
const BASE_URL = process.env.PW_BASE_URL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  testMatch: /.*\.spec\.js$/,

  // Fail fast on CI, be lenient locally.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: BASE_URL,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    ignoreHTTPSErrors: true,
    // Mark that we're in a test — dashboards can read this via
    //   window.navigator.webdriver
    // if they want to disable telemetry.
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Three viewport "projects" covering desktop, laptop, and phone widths.
  // The Hebrew-RTL + dark-theme assertions live in the shared specs and run
  // against ALL three projects automatically.
  // ─────────────────────────────────────────────────────────────────────────
  projects: [
    {
      name: 'desktop-1920',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'laptop-1280',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'mobile-375',
      use: {
        ...devices['iPhone 13'],
        // force 375 width in case of future device preset drift
        viewport: { width: 375, height: 812 },
      },
    },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // Static web server — serves /web via a tiny zero-dependency script so we
  // don't need to boot the full Express backend (which requires Supabase).
  // If you'd rather test against the real server, set PW_BASE_URL=http://... .
  // ─────────────────────────────────────────────────────────────────────────
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: `node "${path.join(__dirname, 'tests', 'e2e', 'static-server.js')}"`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 15_000,
        env: {
          PW_PORT: String(PORT),
          PW_WEB_ROOT: path.join(__dirname, 'web'),
        },
      },

  outputDir: path.join(__dirname, 'test-results'),
});
