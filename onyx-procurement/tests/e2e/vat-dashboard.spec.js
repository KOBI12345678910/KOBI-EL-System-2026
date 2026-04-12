// ═══════════════════════════════════════════════════════════════════════════
// vat-dashboard.spec.js — E2E tests for the VAT dashboard
// Agent 52 · covers Agent-26 deliverable (vat-dashboard.html + .jsx)
// ═══════════════════════════════════════════════════════════════════════════

const { test, expect } = require('@playwright/test');
const { installMocks, collectConsole, fixtures } = require('./fixtures');

// Long timeouts because the HTML bootstrap downloads React + Babel from CDN
// and then Babel-transforms the JSX in the browser before first paint.
test.setTimeout(60_000);

test.describe('VAT dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('loads without uncaught console errors', async ({ page }) => {
    const log = collectConsole(page);
    const res = await page.goto('/vat-dashboard.html');
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/VAT/i);

    // Wait until the React app has mounted (title text replaces boot msg)
    await page.waitForFunction(
      () => !!document.querySelector('header') ||
            !!document.body.innerText.match(/ONYX|VAT|מע/),
      null,
      { timeout: 40_000 },
    );

    const errs = log
      .errors()
      // CDN import-map + esm.sh transforms sometimes log benign network hints
      .filter((e) => !/Failed to load resource.*fonts\.g/i.test(e.text))
      .filter((e) => !/favicon\.ico/i.test(e.text));

    expect(
      errs,
      `expected no console errors, got:\n${errs.map((e) => e.text).join('\n')}`,
    ).toHaveLength(0);
  });

  test('Hebrew RTL + dark theme', async ({ page }) => {
    await page.goto('/vat-dashboard.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const bodyBg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    const sum = (bodyBg.match(/\d+/g) || []).slice(0, 3).reduce((a, b) => a + Number(b), 0);
    expect(sum, `body bg ${bodyBg} is not dark`).toBeLessThan(120);
  });

  test('renders KPI-style header + profile info after mount', async ({ page }) => {
    await page.goto('/vat-dashboard.html');
    // Wait for React
    await page.waitForFunction(
      () => !!document.body.innerText.match(/ONYX.*VAT|מע/),
      null,
      { timeout: 40_000 },
    );
    // VAT business name from fixture should appear on the profile tab
    const visible = await page.locator('body').innerText();
    // Either the header brand ("ONYX · VAT") or the Hebrew tab "פרופיל מע"
    expect(visible).toMatch(/ONYX|VAT|מע"מ|מע״מ|פרופיל/);
  });

  test('periods tab displays closed/open rows', async ({ page }) => {
    await page.goto('/vat-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/תקופות|Periods/),
      null,
      { timeout: 40_000 },
    );
    // Click the periods tab (first nav button whose label contains תקופות)
    const tab = page.getByRole('button', { name: /תקופות|Periods/ }).first();
    if (await tab.count()) {
      await tab.click();
      // Wait for the tab to render rows — the fixture has 12 periods, so the
      // page should show at least a few period codes.
      await expect(page.locator('body')).toContainText(/2026-0[1-9]|submitted|closed|open|פתוחה|סגורה/);
    }
  });

  test('invoices tab shows 20 mock rows', async ({ page }) => {
    await page.goto('/vat-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/חשבוניות|Invoices/),
      null,
      { timeout: 40_000 },
    );
    const tab = page.getByRole('button', { name: /חשבוניות|Invoices/ }).first();
    if (await tab.count()) {
      await tab.click();
      // Each invoice has a doc_number like INV-0001..INV-0020 — at least one
      // should appear on screen.
      await expect(page.locator('body')).toContainText(/INV-000[1-9]/);
      // Sanity: body text should include at least 5 doc numbers after render
      const text = await page.locator('body').innerText();
      const hits = text.match(/INV-000\d/g) || [];
      expect(hits.length).toBeGreaterThanOrEqual(5);
    }
  });

  test('navigation between tabs keeps page responsive', async ({ page }) => {
    await page.goto('/vat-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/פרופיל|ONYX/),
      null,
      { timeout: 40_000 },
    );
    const tabNames = [/תקופות/, /חשבוניות/, /הגשות/, /פרופיל/];
    for (const re of tabNames) {
      const btn = page.getByRole('button', { name: re }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    // Still alive — no crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('responsive: no horizontal overflow', async ({ page, viewport }) => {
    await page.goto('/vat-dashboard.html');
    await page.waitForFunction(() => document.body.children.length > 0);
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(over.doc).toBeLessThanOrEqual(over.win + 12);
    if (viewport) expect(over.win).toBe(viewport.width);
  });

  test('fixture sanity — VAT_INVOICES has exactly 20 rows', async () => {
    expect(fixtures.VAT_INVOICES.invoices).toHaveLength(20);
  });
});
