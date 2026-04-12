// @ts-check
/**
 * Responsive sanity checks at three breakpoints:
 *   - mobile   375 x 812   (iPhone X-ish)
 *   - tablet   768 x 1024  (iPad portrait)
 *   - desktop  1440 x 900  (standard dev viewport, default in config)
 *
 * The techno-kol-ops UI is dashboard-heavy and largely uses inline styles.
 * We verify the core assertions: key content is visible, nothing overflows
 * horizontally beyond the viewport, and the sidebar toggle still works on
 * small screens.
 */
const { test, expect } = require('@playwright/test');
const { installMocks } = require('./fixtures/mockApi');

const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

test.describe('Responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  for (const bp of BREAKPOINTS) {
    test(`${bp.name} (${bp.width}x${bp.height}) — dashboard renders`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');

      // Navbar brand visible
      await expect(page.getByText('TECHNO-KOL')).toBeVisible();
      // A core metric label from the dashboard
      await expect(page.getByText('הזמנות פעילות').first()).toBeVisible();

      // Horizontal overflow check — document width should not exceed viewport
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      // Allow a small tolerance for scrollbars on some OSes
      expect(overflow.scrollWidth).toBeLessThanOrEqual(
        overflow.clientWidth + 24
      );
    });

    test(`${bp.name} — work orders screen renders`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/work-orders');
      await expect(
        page.getByRole('heading', { name: 'הזמנות עבודה' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '+ הזמנה חדשה' })
      ).toBeVisible();
    });

    test(`${bp.name} — sidebar toggle still works`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      const hamburger = page.getByRole('button', { name: '☰' });
      await expect(hamburger).toBeVisible();

      // collapse
      await hamburger.click();
      await expect(page.getByText('מרכז פיקוד')).toHaveCount(0);

      // expand again
      await hamburger.click();
      await expect(page.getByText('מרכז פיקוד').first()).toBeVisible();
    });
  }
});
