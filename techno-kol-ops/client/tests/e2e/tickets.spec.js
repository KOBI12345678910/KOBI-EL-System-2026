// @ts-check
/**
 * "Tickets" in techno-kol-ops are work orders and alerts.
 * This spec covers the full lifecycle for both:
 *   - create a new work order via the modal on /work-orders
 *   - update (progress change via the side panel)
 *   - close / resolve an alert on /alerts
 *
 * Everything is mocked; POST/PUT are tracked in the shared in-memory db.
 */
const { test, expect } = require('@playwright/test');
const { installMocks } = require('./fixtures/mockApi');

test.describe('Work orders — create / update / close', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('create a new work order via the modal', async ({ page }) => {
    const postRequests = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/work-orders')) {
        postRequests.push(req);
      }
    });

    await page.goto('/work-orders');
    await expect(
      page.getByRole('heading', { name: 'הזמנות עבודה' })
    ).toBeVisible();

    await page.getByRole('button', { name: '+ הזמנה חדשה' }).click();

    // Modal title
    await expect(page.getByText('// הזמנת עבודה חדשה')).toBeVisible();

    // Fill the form
    await page
      .locator('select')
      .filter({ hasText: 'בחר לקוח' })
      .selectOption({ index: 1 });
    await page
      .getByPlaceholder('מעקות נירוסטה, שערים פנדולום...')
      .fill('מעקות ברזל מדרגות — טסט E2E');
    // Material select (first one with 'ברזל' option)
    await page
      .locator('select')
      .nth(1)
      .selectOption('aluminum');
    // Category select
    await page.locator('select').nth(2).selectOption('gates');
    // Price and advance
    await page.getByPlaceholder('0').first().fill('32000');
    await page.getByPlaceholder('0').nth(1).fill('10000');
    // Delivery date
    await page.locator('input[type="date"]').fill('2026-05-15');
    // Priority
    await page.locator('select').nth(3).selectOption('high');

    await page.getByRole('button', { name: /שמור הזמנה/ }).click();

    // Modal should close
    await expect(page.getByText('// הזמנת עבודה חדשה')).not.toBeVisible();
    // And the POST should have fired
    expect(postRequests.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(postRequests[0].postData() || '{}');
    expect(body).toMatchObject({
      product: 'מעקות ברזל מדרגות — טסט E2E',
      material_primary: 'aluminum',
      category: 'gates',
      price: '32000',
      priority: 'high',
    });
  });

  test('update order progress via the detail side panel', async ({ page }) => {
    const progressPuts = [];
    page.on('request', (req) => {
      if (
        req.method() === 'PUT' &&
        /\/api\/work-orders\/[^/]+\/progress$/.test(req.url())
      ) {
        progressPuts.push(req);
      }
    });

    await page.goto('/work-orders');

    // Wait for ag-grid rows and click the first seeded order
    await expect(
      page.locator('.ag-center-cols-container').getByText('TK-1001')
    ).toBeVisible();
    await page
      .locator('.ag-center-cols-container')
      .getByText('TK-1001')
      .click();

    // Side panel opens with the order id
    await expect(page.getByText('// TK-1001')).toBeVisible();
    await expect(page.getByText('מעקות נירוסטה לקומה 3')).toBeVisible();
    await expect(page.getByText('עדכן התקדמות')).toBeVisible();

    // Move the range slider to 60%
    const slider = page.locator('input[type="range"]');
    await slider.fill('60');
    await slider.dispatchEvent('change');

    // The PUT .../progress call should fire
    await expect
      .poll(() => progressPuts.length, { timeout: 3000 })
      .toBeGreaterThanOrEqual(1);
    const body = JSON.parse(progressPuts[0].postData() || '{}');
    expect(body).toHaveProperty('progress');
  });

  test('closing the side panel hides it again', async ({ page }) => {
    await page.goto('/work-orders');
    await page
      .locator('.ag-center-cols-container')
      .getByText('TK-1002')
      .click();
    await expect(page.getByText('// TK-1002')).toBeVisible();

    // The panel close button is a lone × character
    await page
      .getByRole('button', { name: '×' })
      .first()
      .click();
    await expect(page.getByText('// TK-1002')).not.toBeVisible();
  });
});

test.describe('Alerts — resolve / close flow', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  test('Alert Center shows open alerts and can resolve one', async ({
    page,
  }) => {
    const resolveRequests = [];
    page.on('request', (req) => {
      if (
        req.method() === 'PUT' &&
        /\/api\/alerts\/[^/]+\/resolve$/.test(req.url())
      ) {
        resolveRequests.push(req);
      }
    });

    await page.goto('/alerts');

    await expect(
      page.getByRole('heading', { name: 'מרכז התראות' })
    ).toBeVisible();
    await expect(page.getByText('מלאי נירוסטה נמוך')).toBeVisible();
    await expect(page.getByText('איחור במשלוח TK-1003')).toBeVisible();

    // Find the first resolve button (the AlertCenter renders a button per open alert)
    const resolveBtns = page.getByRole('button', { name: /פתור|סגור|resolve/i });
    // Fallback: some builds render a plain × or check icon — try generic buttons in the open list
    let clicked = false;
    if ((await resolveBtns.count()) > 0) {
      await resolveBtns.first().click();
      clicked = true;
    } else {
      // Fall back to any button that isn't a nav/sidebar control
      const anyBtn = page
        .locator('div', { hasText: 'מלאי נירוסטה נמוך' })
        .locator('..')
        .locator('button')
        .last();
      if (await anyBtn.isVisible()) {
        await anyBtn.click();
        clicked = true;
      }
    }

    expect(clicked, 'expected a resolve control to be clickable').toBe(true);

    await expect
      .poll(() => resolveRequests.length, { timeout: 3000 })
      .toBeGreaterThanOrEqual(1);
  });
});
