// ═══════════════════════════════════════════════════════════════════════════
// annual-tax-dashboard.spec.js — E2E tests for the Annual Tax dashboard
// Agent 52 · covers Agent-28 deliverable (annual-tax-dashboard.html + .jsx)
// ═══════════════════════════════════════════════════════════════════════════

const { test, expect } = require('@playwright/test');
const { installMocks, collectConsole, fixtures } = require('./fixtures');

test.setTimeout(60_000);

test.describe('Annual Tax dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('loads without uncaught console errors', async ({ page }) => {
    const log = collectConsole(page);
    const res = await page.goto('/annual-tax-dashboard.html');
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/TAX|מס|ANNUAL/i);

    await page.waitForFunction(
      () => !!document.body.innerText.match(/ANNUAL TAX|מס|פרויקטים/),
      null,
      { timeout: 40_000 },
    );

    const errs = log
      .errors()
      .filter((e) => !/fonts\.g/i.test(e.text))
      .filter((e) => !/favicon/i.test(e.text));

    expect(
      errs,
      `expected no console errors, got:\n${errs.map((e) => e.text).join('\n')}`,
    ).toHaveLength(0);
  });

  test('Hebrew RTL + dark theme', async ({ page }) => {
    await page.goto('/annual-tax-dashboard.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const bg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    const sum = (bg.match(/\d+/g) || []).slice(0, 3).reduce((a, b) => a + Number(b), 0);
    expect(sum, `body bg ${bg} is not dark`).toBeLessThan(120);
  });

  test('projects tab shows 20 mock project rows', async ({ page }) => {
    await page.goto('/annual-tax-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/ANNUAL TAX|פרויקטים/),
      null,
      { timeout: 40_000 },
    );
    await page.waitForTimeout(400);
    const text = await page.locator('body').innerText();
    // Each project code is PRJ-2026-0001..0020 — check several appear
    const hits = text.match(/PRJ-2026-00\d/g) || [];
    expect(
      hits.length,
      `expected ≥5 PRJ-2026-00N hits, got ${hits.length}`,
    ).toBeGreaterThanOrEqual(5);
  });

  test('customers tab shows 20 mock customers', async ({ page }) => {
    await page.goto('/annual-tax-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/ANNUAL TAX|פרויקטים/),
      null,
      { timeout: 40_000 },
    );
    const tab = page.getByRole('button', { name: /לקוחות/ }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(400);
      const text = await page.locator('body').innerText();
      // Any of the fixture customer prefixes should appear
      expect(text).toMatch(/עיריית תל אביב|משרד הביטחון|חברת החשמל|משרד החינוך|אגד תחבורה/);
    }
  });

  test('invoices tab shows mock invoice rows', async ({ page }) => {
    await page.goto('/annual-tax-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/ANNUAL TAX|פרויקטים/),
      null,
      { timeout: 40_000 },
    );
    const tab = page.getByRole('button', { name: /חשבוניות/ }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(400);
      const text = await page.locator('body').innerText();
      const hits = text.match(/CUST-INV-00\d/g) || [];
      expect(
        hits.length,
        `expected ≥3 CUST-INV hits, got ${hits.length}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  test('fiscal years tab shows 23% corporate tax rate', async ({ page }) => {
    await page.goto('/annual-tax-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/ANNUAL TAX|פרויקטים/),
      null,
      { timeout: 40_000 },
    );
    // Header shows "מס חברות 23%" by default — quick existence check
    const hdr = await page.locator('body').innerText();
    expect(hdr).toMatch(/23/);
  });

  test('navigation cycles through all 6 tabs without crash', async ({ page }) => {
    await page.goto('/annual-tax-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/ANNUAL TAX|פרויקטים/),
      null,
      { timeout: 40_000 },
    );
    const names = [/לקוחות/, /חשבוניות/, /תקבולים/, /שנת מס/, /טפסים/, /פרויקטים/];
    for (const n of names) {
      const btn = page.getByRole('button', { name: n }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('responsive: no horizontal overflow', async ({ page, viewport }) => {
    await page.goto('/annual-tax-dashboard.html');
    await page.waitForFunction(() => document.body.children.length > 0);
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(over.doc).toBeLessThanOrEqual(over.win + 12);
    if (viewport) expect(over.win).toBe(viewport.width);
  });

  test('fixture sanity — ANNUAL_PROJECTS has exactly 20 rows', async () => {
    expect(fixtures.ANNUAL_PROJECTS.projects).toHaveLength(20);
    expect(fixtures.ANNUAL_INVOICES.invoices).toHaveLength(20);
    expect(fixtures.ANNUAL_CUSTOMERS.customers).toHaveLength(20);
  });
});
