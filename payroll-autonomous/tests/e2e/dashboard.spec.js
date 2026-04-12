// @ts-check
/**
 * E2E: Dashboard loads and shows KPI values.
 *
 * Also enforces the three app-wide invariants that every screen must satisfy:
 *   - html[dir="rtl"]
 *   - body background equals #0b0d10 (dark Palantir theme)
 *   - At least one Hebrew word is visible on screen
 */
import { test, expect } from '@playwright/test';
import { installPayrollMocks, HEBREW_CHAR_RE } from './fixtures/mockData.js';

test.describe('Dashboard — KPIs', () => {
  test.beforeEach(async ({ page }) => {
    await installPayrollMocks(page);
    await page.goto('/');
  });

  test('renders all four KPI cards with expected labels', async ({ page }) => {
    // Dashboard is the default tab. Wait for the header to be visible first.
    await expect(page.getByRole('heading', { name: /Payroll Autonomous/ })).toBeVisible();

    // KPI labels (stat-label spans)
    await expect(page.getByText('עובדים פעילים')).toBeVisible();
    await expect(page.getByText('תלושים החודש')).toBeVisible();
    await expect(page.getByText('ברוטו חודשי')).toBeVisible();
    await expect(page.getByText('נטו חודשי')).toBeVisible();

    // All four .stat cards must be present
    const stats = page.locator('.stat');
    await expect(stats).toHaveCount(4);

    // Active-employees KPI should reflect the two mock employees (both is_active).
    const activeEmployeesCard = page
      .locator('.stat')
      .filter({ hasText: 'עובדים פעילים' });
    await expect(activeEmployeesCard.locator('.stat-value')).toHaveText('2');

    // Monthly wage-slip count should match the two mock wage slips from 04/2026.
    const slipsCard = page.locator('.stat').filter({ hasText: 'תלושים החודש' });
    await expect(slipsCard.locator('.stat-value')).toHaveText('2');

    // Gross / net cards should contain a shekel sign from the formatter.
    const grossCard = page.locator('.stat').filter({ hasText: 'ברוטו חודשי' });
    const netCard = page.locator('.stat').filter({ hasText: 'נטו חודשי' });
    await expect(grossCard.locator('.stat-value')).toContainText('₪');
    await expect(netCard.locator('.stat-value')).toContainText('₪');
  });

  test('html element is dir="rtl"', async ({ page }) => {
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('body background is the dark Palantir color #0b0d10', async ({ page }) => {
    // Wait for the injected <style> tag to take effect.
    await expect(page.locator('.tabs')).toBeVisible();
    const bg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // getComputedStyle returns rgb(); #0b0d10 -> rgb(11, 13, 16)
    expect(bg).toBe('rgb(11, 13, 16)');
  });

  test('dashboard contains at least one Hebrew word', async ({ page }) => {
    await expect(page.locator('.stat').first()).toBeVisible();
    const bodyText = (await page.locator('body').innerText()) || '';
    expect(bodyText).toMatch(HEBREW_CHAR_RE);
  });
});
