// @ts-check
/**
 * E2E: Compute wage slip preview.
 *
 * Flow: navigate to "חישוב תלוש חדש", pick an employee, fill timesheet fields,
 *       press "חשב תצוגה מקדימה", and verify the preview panel shows the
 *       calculated gross, deductions, and net from the mock response.
 */
import { test, expect } from '@playwright/test';
import {
  installPayrollMocks,
  mockComputedWageSlipPreview,
  HEBREW_CHAR_RE,
} from './fixtures/mockData.js';

test.describe('Compute — wage slip preview', () => {
  test.beforeEach(async ({ page }) => {
    await installPayrollMocks(page);
    await page.goto('/');
  });

  test('fills timesheet and shows calculated preview fields', async ({ page }) => {
    // Navigate to the compute tab
    await page.locator('.tab', { hasText: 'חישוב תלוש חדש' }).click();
    await expect(
      page.locator('.tab.active', { hasText: 'חישוב תלוש חדש' })
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: 'חישוב תלוש חדש' })).toBeVisible();

    // Before pick: preview panel shows the empty-state hint text
    await expect(page.getByText('בחר עובד, מלא שעות ולחץ')).toBeVisible();

    // Pick the first active employee (index 1 since option 0 is the placeholder)
    const employeeSelect = page.locator('select').first();
    await employeeSelect.selectOption({ index: 1 });

    // Fill a few timesheet fields — the form already seeds hours_regular=182.
    // Set overtime 125% and a bonus.
    const overtime125 = page.getByLabel('נוספות 125%').or(
      page.locator('label:has-text("נוספות 125%") + input, label:has-text("נוספות 125%") ~ input')
    );

    // Safer: use input order inside the form panel. All <input type="number">
    // inside the left panel correspond to period + hours + bonuses.
    // Hours inputs start after period inputs (year, month, pay-date).
    // Just fill the ones we care about by label proximity.
    const hoursOvertime125 = page.locator('label:has-text("נוספות 125%") ~ input').first()
      .or(page.locator('div:has(> label:has-text("נוספות 125%")) input'));
    await hoursOvertime125.fill('8');

    const bonusInput = page.locator('div:has(> label:has-text("בונוסים")) input');
    await bonusInput.fill('500');

    // Button enabled once an employee is picked
    const previewBtn = page.getByRole('button', { name: 'חשב תצוגה מקדימה' });
    await expect(previewBtn).toBeEnabled();

    const postPromise = page.waitForRequest((req) =>
      req.url().includes('/api/payroll/wage-slips/compute') && req.method() === 'POST'
    );

    await previewBtn.click();

    const postReq = await postPromise;
    const body = postReq.postDataJSON();
    expect(body.employee_id).toBeTruthy();
    expect(body.timesheet.hours_overtime_125).toBe(8);
    expect(body.timesheet.bonuses).toBe(500);

    // Preview panel on the right must now display calculated rows.
    const previewPanel = page.locator('.panel').filter({ hasText: 'תצוגה מקדימה' });
    await expect(previewPanel.getByText('שכר יסוד')).toBeVisible();
    await expect(previewPanel.getByText('ברוטו', { exact: false })).toBeVisible();
    await expect(previewPanel.getByText('מס הכנסה')).toBeVisible();
    await expect(previewPanel.getByText('ביטוח לאומי')).toBeVisible();
    await expect(previewPanel.getByText('פנסיה')).toBeVisible();
    await expect(previewPanel.getByText('נטו')).toBeVisible();

    // Calculated net value from the mock should appear somewhere on the screen.
    // The formatter prints "₪ 14,317.00"; match by the integer digits which is
    // insensitive to locale-specific thousands separators.
    const netDigits = String(mockComputedWageSlipPreview.net_pay); // "14317"
    await expect(previewPanel.locator('body, *').first()).toBeVisible();
    const previewText = await previewPanel.innerText();
    // Accept either "14317" or "14,317"
    expect(previewText.replace(/[,\s]/g, '')).toContain(netDigits);
  });

  test('compute screen is RTL + dark + Hebrew', async ({ page }) => {
    await page.locator('.tab', { hasText: 'חישוב תלוש חדש' }).click();
    await expect(page.locator('.tab.active', { hasText: 'חישוב תלוש חדש' })).toBeVisible();

    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');

    const bg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor
    );
    expect(bg).toBe('rgb(11, 13, 16)');

    const bodyText = (await page.locator('body').innerText()) || '';
    expect(bodyText).toMatch(HEBREW_CHAR_RE);
  });
});
