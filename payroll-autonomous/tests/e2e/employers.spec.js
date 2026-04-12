// @ts-check
/**
 * E2E: Create a new employer.
 *
 * Flow: navigate to the "מעסיקים" tab, open the new-employer form, fill it,
 *       submit, and verify the new employer appears in the list.
 *
 * All mutations are intercepted by installPayrollMocks — no live backend.
 */
import { test, expect } from '@playwright/test';
import { installPayrollMocks, HEBREW_CHAR_RE } from './fixtures/mockData.js';

test.describe('Employers — create', () => {
  test.beforeEach(async ({ page }) => {
    await installPayrollMocks(page);
    await page.goto('/');
  });

  test('creates a new employer and verifies it in the list', async ({ page }) => {
    // Open the "מעסיקים" tab
    await page.locator('.tab', { hasText: 'מעסיקים' }).click();

    // Tab should now be active
    await expect(page.locator('.tab.active', { hasText: 'מעסיקים' })).toBeVisible();

    // Existing employers header
    await expect(page.getByRole('heading', { name: /מעסיקים/ })).toBeVisible();

    // Open the create form
    await page.getByRole('button', { name: '+ מעסיק חדש' }).click();

    // Form should now be visible with the legal-name input
    const legalName = 'בדיקות איכות קול בע"מ';
    const companyId = '515000999';
    const taxFile = '940000999';

    await page.locator('input').nth(0).fill(legalName);
    await page.locator('input').nth(1).fill(companyId);
    await page.locator('input').nth(2).fill(taxFile);
    await page.locator('input').nth(3).fill('515000999');
    await page.locator('input').nth(4).fill('רחוב הבדיקות 42');
    await page.locator('input').nth(5).fill('ירושלים');

    // Capture the POST /api/payroll/employers call to verify it was sent.
    const postPromise = page.waitForRequest((req) =>
      req.url().includes('/api/payroll/employers') && req.method() === 'POST'
    );

    // Submit — "שמור" button inside the form panel
    await page.locator('.panel .panel').getByRole('button', { name: 'שמור' }).click();

    const postReq = await postPromise;
    const postBody = postReq.postDataJSON();
    expect(postBody.legal_name).toBe(legalName);
    expect(postBody.company_id).toBe(companyId);

    // After save, the app calls loadAll() which re-GETs employers. Our mock pushed
    // the new employer onto the in-memory array, so it should appear in the table.
    await expect(page.locator('table').getByText(legalName)).toBeVisible();
    await expect(page.locator('table').getByText(companyId)).toBeVisible();
  });

  test('employer screen is RTL + dark + Hebrew', async ({ page }) => {
    await page.locator('.tab', { hasText: 'מעסיקים' }).click();
    await expect(page.locator('.tab.active', { hasText: 'מעסיקים' })).toBeVisible();

    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');

    const bg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor
    );
    expect(bg).toBe('rgb(11, 13, 16)');

    const bodyText = (await page.locator('body').innerText()) || '';
    expect(bodyText).toMatch(HEBREW_CHAR_RE);
  });
});
