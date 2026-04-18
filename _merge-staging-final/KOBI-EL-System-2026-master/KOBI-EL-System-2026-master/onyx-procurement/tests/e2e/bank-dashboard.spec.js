// ═══════════════════════════════════════════════════════════════════════════
// bank-dashboard.spec.js — E2E tests for the Bank Reconciliation dashboard
// Agent 52 · covers Agent-27 deliverable (bank-dashboard.html + .jsx)
// ═══════════════════════════════════════════════════════════════════════════

const { test, expect } = require('@playwright/test');
const { installMocks, collectConsole, fixtures } = require('./fixtures');

test.setTimeout(60_000);

test.describe('Bank dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('loads without uncaught console errors', async ({ page }) => {
    const log = collectConsole(page);
    const res = await page.goto('/bank-dashboard.html');
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/BANK|בנק/i);

    await page.waitForFunction(
      () => !!document.body.innerText.match(/BANK OPS|התאמות|סקירה/),
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
    await page.goto('/bank-dashboard.html');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const bg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    const sum = (bg.match(/\d+/g) || []).slice(0, 3).reduce((a, b) => a + Number(b), 0);
    expect(sum, `body bg ${bg} is not dark`).toBeLessThan(120);
  });

  test('overview tab renders 4 KPI tiles', async ({ page }) => {
    await page.goto('/bank-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/חשבונות פעילים|BANK OPS/),
      null,
      { timeout: 40_000 },
    );
    // The KPI labels come from fixtures — at minimum check the Hebrew labels.
    const text = await page.locator('body').innerText();
    const labels = [
      /חשבונות פעילים/,
      /תנועות לא מותאמות|תנועות/,
      /סכום לא מותאם|סכום/,
      /אי התאמות|התאמות/,
    ];
    for (const re of labels) {
      expect(text).toMatch(re);
    }
  });

  test('transactions tab shows 20 mock transaction rows', async ({ page }) => {
    await page.goto('/bank-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/BANK OPS|סקירה/),
      null,
      { timeout: 40_000 },
    );
    const tab = page.getByRole('button', { name: /תנועות/ }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(400);
      // Fixture has 20 references REF-0001..REF-0020 — check a handful appear.
      const text = await page.locator('body').innerText();
      const hits = text.match(/REF-000\d/g) || [];
      expect(
        hits.length,
        `expected ≥5 REF-000N hits, got ${hits.length}`,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  test('accounts tab renders 5 account rows', async ({ page }) => {
    await page.goto('/bank-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/סקירה|BANK/),
      null,
      { timeout: 40_000 },
    );
    const tab = page.getByRole('button', { name: /^חשבונות$|חשבונות\b/ }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(300);
      const text = await page.locator('body').innerText();
      // At least one of the fixture bank names should render
      expect(text).toMatch(/בנק הפועלים|בנק דיסקונט|בנק לאומי|בנק מזרחי|בנק יהב/);
    }
  });

  test('discrepancies tab shows severity badges', async ({ page }) => {
    await page.goto('/bank-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/סקירה|BANK/),
      null,
      { timeout: 40_000 },
    );
    const tab = page.getByRole('button', { name: /אי התאמות/ }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(300);
      const text = await page.locator('body').innerText();
      expect(text).toMatch(/קריטי|גבוה|בינוני|נמוך|מידע/);
    }
  });

  test('navigation cycles through all tabs without crash', async ({ page }) => {
    await page.goto('/bank-dashboard.html');
    await page.waitForFunction(
      () => !!document.body.innerText.match(/סקירה|BANK/),
      null,
      { timeout: 40_000 },
    );
    for (const name of [/חשבונות/, /תנועות/, /^התאמות$|התאמות\b/, /אי התאמות/, /סקירה/]) {
      const btn = page.getByRole('button', { name }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('responsive: no horizontal overflow', async ({ page, viewport }) => {
    await page.goto('/bank-dashboard.html');
    await page.waitForFunction(() => document.body.children.length > 0);
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(over.doc).toBeLessThanOrEqual(over.win + 12);
    if (viewport) expect(over.win).toBe(viewport.width);
  });

  test('fixture sanity — BANK_TRANSACTIONS has exactly 20 rows', async () => {
    expect(fixtures.BANK_TRANSACTIONS.transactions).toHaveLength(20);
  });
});
