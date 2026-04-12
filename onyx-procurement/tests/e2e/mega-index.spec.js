// ═══════════════════════════════════════════════════════════════════════════
// mega-index.spec.js — E2E tests for the Mega Index landing page
// Agent 52 · covers Agent-29 deliverable (index.html)
// ═══════════════════════════════════════════════════════════════════════════

const { test, expect } = require('@playwright/test');
const { installMocks, collectConsole } = require('./fixtures');

test.describe('Mega Index landing page', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('loads without console errors', async ({ page }) => {
    const log = collectConsole(page);
    const res = await page.goto('/index.html');
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/ERP 2026/);
    // Give the health poller a tick so its fetch has resolved
    await page.waitForTimeout(500);
    const errs = log.errors();
    expect(
      errs,
      `expected no console errors, got:\n${errs.map((e) => e.text).join('\n')}`,
    ).toHaveLength(0);
  });

  test('has Hebrew + RTL + dark theme', async ({ page }) => {
    await page.goto('/index.html');
    // <html lang="he" dir="rtl">
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'he');
    await expect(html).toHaveAttribute('dir', 'rtl');

    // Dark body background — Palantir dark palette
    const bg = await page.evaluate(() => {
      const el = document.body;
      return window.getComputedStyle(el).backgroundColor;
    });
    // Should NOT be a plain white — tolerant parse: any rgb with sum < 120
    const sum = (bg.match(/\d+/g) || []).slice(0, 3).reduce((a, b) => a + Number(b), 0);
    expect(sum, `body bg ${bg} is not dark`).toBeLessThan(120);
  });

  test('shows at least 8 dashboard tiles', async ({ page }) => {
    await page.goto('/index.html');
    const tiles = page.locator('.tile');
    await expect(tiles).toHaveCount(8);
    // Every tile should contain Hebrew title text
    const titles = await page.locator('.tile-title-he').allTextContents();
    expect(titles.length).toBeGreaterThanOrEqual(8);
    for (const t of titles) expect(t.trim().length).toBeGreaterThan(0);
  });

  test('KPI-like footer status dot renders and updates', async ({ page }) => {
    await page.goto('/index.html');
    const dot = page.locator('#status-dot');
    await expect(dot).toBeVisible();
    // Live clock should tick at least once
    await expect(page.locator('#datetime')).not.toHaveText('—', { timeout: 3000 });
  });

  test('navigation: clicking VAT tile lands on vat-dashboard.html', async ({ page }) => {
    await page.goto('/index.html');
    const vatTile = page.locator('a[href="vat-dashboard.html"]').first();
    await expect(vatTile).toBeVisible();
    await vatTile.click();
    await expect(page).toHaveURL(/vat-dashboard\.html$/);
  });

  test('navigation: clicking Bank tile lands on bank-dashboard.html', async ({ page }) => {
    await page.goto('/index.html');
    const bankTile = page.locator('a[href="bank-dashboard.html"]').first();
    await expect(bankTile).toBeVisible();
    await bankTile.click();
    await expect(page).toHaveURL(/bank-dashboard\.html$/);
  });

  test('navigation: clicking Annual Tax tile lands on annual-tax-dashboard.html', async ({ page }) => {
    await page.goto('/index.html');
    const taxTile = page.locator('a[href="annual-tax-dashboard.html"]').first();
    await expect(taxTile).toBeVisible();
    await taxTile.click();
    await expect(page).toHaveURL(/annual-tax-dashboard\.html$/);
  });

  test('responsive: no horizontal overflow', async ({ page, viewport }) => {
    await page.goto('/index.html');
    const overflow = await page.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      viewWidth: window.innerWidth,
    }));
    // 10px tolerance for scrollbars
    expect(overflow.docWidth).toBeLessThanOrEqual(overflow.viewWidth + 10);
    // Sanity: viewport echoes the project's configured width
    if (viewport) expect(overflow.viewWidth).toBe(viewport.width);
  });
});
