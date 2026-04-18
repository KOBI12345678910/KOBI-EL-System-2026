// @ts-check
/**
 * OPS Dashboard — should load, render metrics, the orders table and charts.
 * All network traffic is mocked via fixtures/mockApi.js.
 */
const { test, expect } = require('@playwright/test');
const { installMocks } = require('./fixtures/mockApi');

test.describe('OPS Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('loads without crashing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    // The main top-nav brand name is a good "app booted" sentinel.
    await expect(page.getByText('TECHNO-KOL')).toBeVisible();
    // Dashboard header metric labels
    await expect(page.getByText('הזמנות פעילות').first()).toBeVisible();
    await expect(page.getByText('הכנסה חודש נוכחי')).toBeVisible();

    expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('renders the 5 top metric cards', async ({ page }) => {
    await page.goto('/');

    for (const label of [
      'הזמנות פעילות',
      'הכנסה חודש נוכחי',
      'עובדים נוכחים',
      'אזהרות פתוחות',
      'ניצולת מפעל',
    ]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('shows active orders table with expected columns', async ({ page }) => {
    await page.goto('/');

    const headers = ['מזהה', 'לקוח', 'מוצר', 'חומר', 'אספקה', 'התקדמות', 'סטטוס'];
    for (const h of headers) {
      await expect(page.getByRole('columnheader', { name: h })).toBeVisible();
    }

    // Seeded row content from fixtures
    await expect(page.getByText('TK-1001')).toBeVisible();
    await expect(page.getByText('מפעל הפלדה המרכזי').first()).toBeVisible();
    await expect(page.getByText('מעקות נירוסטה לקומה 3')).toBeVisible();
  });

  test('renders the three chart panels', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('ייצור שבועי — יחידות')).toBeVisible();
    await expect(page.getByText('מיקס חומרי גלם')).toBeVisible();
    await expect(page.getByText('הכנסות — 6 חודשים')).toBeVisible();

    // Recharts renders into <svg class="recharts-surface">
    const svgs = page.locator('svg.recharts-surface');
    await expect(svgs.first()).toBeVisible();
    expect(await svgs.count()).toBeGreaterThanOrEqual(2);
  });

  test('top navbar shows live stats and connection indicator', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('OPS CENTER')).toBeVisible();
    // Navbar stat labels (smaller copies separate from metric cards)
    await expect(page.getByText('הכנסה חודשית')).toBeVisible();
    // Either LIVE or OFFLINE must render — WS is blocked, so OFFLINE is expected
    const status = page.getByText(/LIVE|OFFLINE/);
    await expect(status).toBeVisible();
  });

  test('clicking the orders metric navigates to /work-orders', async ({ page }) => {
    await page.goto('/');
    await page.getByText('הזמנות פעילות').first().click();
    await expect(page).toHaveURL(/\/work-orders$/);
    await expect(
      page.getByRole('heading', { name: 'הזמנות עבודה' })
    ).toBeVisible();
  });
});
