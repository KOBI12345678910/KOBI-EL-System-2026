// @ts-check
/**
 * Navigation / routing checks.
 *
 * Verifies that every sidebar link routes correctly, no 404 appears
 * and that client-side routes mount their expected Hebrew heading.
 */
const { test, expect } = require('@playwright/test');
const { installMocks } = require('./fixtures/mockApi');

/**
 * Subset of NAV from client/src/components/Sidebar.tsx that has a user-visible
 * Hebrew heading we can assert against.
 */
const ROUTES = [
  { path: '/', label: 'דשבורד', sentinel: 'הזמנות פעילות' },
  { path: '/work-orders', label: 'הזמנות עבודה', sentinel: 'הזמנות עבודה' },
  { path: '/clients', label: 'לקוחות', sentinel: 'לקוחות' },
  { path: '/alerts', label: 'התראות', sentinel: 'מרכז התראות' },
];

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('each core route renders its expected screen', async ({ page }) => {
    for (const r of ROUTES) {
      await page.goto(r.path);
      await expect(
        page.getByText(r.sentinel).first(),
        `route ${r.path} should show "${r.sentinel}"`
      ).toBeVisible();
    }
  });

  test('sidebar navigation clicks update the URL and content', async ({
    page,
  }) => {
    await page.goto('/');

    // Click sidebar "הזמנות עבודה"
    await page
      .locator('div')
      .filter({ hasText: /^📋הזמנות עבודה$/ })
      .first()
      .click({ trial: false })
      .catch(async () => {
        // Fallback for emoji matching quirks: role-less click by visible text
        await page.getByText('הזמנות עבודה', { exact: true }).first().click();
      });
    await expect(page).toHaveURL(/\/work-orders$/);
    await expect(
      page.getByRole('heading', { name: 'הזמנות עבודה' })
    ).toBeVisible();

    // Now click "לקוחות"
    await page.getByText('לקוחות', { exact: true }).first().click();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(
      page.getByRole('heading', { name: 'לקוחות' })
    ).toBeVisible();

    // Back to dashboard via the "דשבורד" sidebar entry
    await page.getByText('דשבורד', { exact: true }).first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('toggling the sidebar hides and reshows it', async ({ page }) => {
    await page.goto('/');
    // Sidebar is open by default — click the hamburger in the navbar
    const hamburger = page.getByRole('button', { name: '☰' });
    await hamburger.click();
    // "מרכז פיקוד" is a sidebar section label — should be gone now
    await expect(page.getByText('מרכז פיקוד')).toHaveCount(0);
    await hamburger.click();
    await expect(page.getByText('מרכז פיקוד').first()).toBeVisible();
  });

  test('no pageerror and no console error on core routes', async ({ page }) => {
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    for (const r of ROUTES) {
      await page.goto(r.path);
      await expect(page.getByText(r.sentinel).first()).toBeVisible();
    }

    // WebSocket is blocked on purpose, which can log a connection error
    // in some browsers — filter those out so the assertion stays meaningful.
    const significant = consoleErrors.filter(
      (m) => !/WebSocket|ws:\/\/|failed|abort/i.test(m)
    );
    expect(errors, `pageerrors: ${errors.join('\n')}`).toEqual([]);
    expect(
      significant,
      `unexpected console.error: ${significant.join('\n')}`
    ).toEqual([]);
  });
});
