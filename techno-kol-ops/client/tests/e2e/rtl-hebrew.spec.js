// @ts-check
/**
 * RTL + Hebrew verification across the main screens.
 * Ensures dir="rtl" and lang="he" are set, and that Hebrew content is
 * actually rendered (not just present in markup but invisible).
 */
const { test, expect } = require('@playwright/test');
const { installMocks } = require('./fixtures/mockApi');

const SCREENS = [
  { path: '/', header: 'הזמנות פעילות', label: 'דשבורד' },
  { path: '/work-orders', header: 'הזמנות עבודה', label: 'הזמנות עבודה' },
  { path: '/clients', header: 'לקוחות', label: 'לקוחות' },
  { path: '/alerts', header: 'מרכז התראות', label: 'מרכז התראות' },
];

test.describe('RTL + Hebrew', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('<html> tag declares Hebrew and RTL', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    const dir = await page.locator('html').getAttribute('dir');
    expect(lang).toBe('he');
    expect(dir).toBe('rtl');
  });

  for (const s of SCREENS) {
    test(`${s.label} — applies RTL and renders Hebrew`, async ({ page }) => {
      await page.goto(s.path);

      // The Layout wrapper sets `direction: rtl` inline.
      // Check the effective `dir` on the root layout or on the body/html.
      const bodyDir = await page.evaluate(
        () => getComputedStyle(document.body).direction
      );
      expect(bodyDir).toBe('rtl');

      // Hebrew content sentinel
      await expect(page.getByText(s.header).first()).toBeVisible();

      // Hebrew characters (\u0590–\u05FF) should appear somewhere visible
      const text = await page.locator('body').innerText();
      expect(text).toMatch(/[\u0590-\u05FF]/);
    });
  }

  test('Hebrew currency formatting renders with ₪', async ({ page }) => {
    await page.goto('/');
    // formatCurrency always prefixes ₪. monthlyRevenue in the navbar stat is a safe check.
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/₪/);
  });

  test('Sidebar sections and items are Hebrew', async ({ page }) => {
    await page.goto('/');
    for (const label of [
      'מרכז פיקוד',
      'ייצור',
      'חומרים',
      'כוח אדם',
      'פיננסים',
      'מערכת',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });
});
