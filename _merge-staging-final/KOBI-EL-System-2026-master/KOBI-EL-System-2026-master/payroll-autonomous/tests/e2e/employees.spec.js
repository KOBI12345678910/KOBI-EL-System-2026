// @ts-check
/**
 * E2E: Create a new employee.
 *
 * Flow: navigate to the "עובדים" tab, open the new-employee form, fill it,
 *       submit, and verify the POST request contains the expected data.
 */
import { test, expect } from '@playwright/test';
import { installPayrollMocks, HEBREW_CHAR_RE } from './fixtures/mockData.js';

test.describe('Employees — create', () => {
  test.beforeEach(async ({ page }) => {
    await installPayrollMocks(page);
    await page.goto('/');
  });

  test('creates a new employee and verifies it in the list', async ({ page }) => {
    // Open the employees tab
    await page.locator('.tab', { hasText: 'עובדים' }).click();
    await expect(page.locator('.tab.active', { hasText: 'עובדים' })).toBeVisible();

    // Heading
    await expect(page.getByRole('heading', { name: /עובדים/ })).toBeVisible();

    // Open the create form
    await page.getByRole('button', { name: '+ עובד חדש' }).click();

    // The employee form has a first <select> (employer dropdown). We fill the
    // text/number inputs by label order as defined in App.jsx.
    // Order in the form:
    //   0: employee_number
    //   1: national_id
    //   2: first_name
    //   3: last_name
    //   4: start_date (type=date)
    //   5: base_salary (type=number)
    //   6: work_percentage (type=number)
    //   7: tax_credits (type=number)
    //   8: position
    //   9: department
    const empNumber = 'E-777';
    const nationalId = '111222333';
    const firstName = 'דוד';
    const lastName = 'כהן';
    const position = 'בודק אוטומציה';
    const department = 'איכות';

    // Make sure the employer select is set
    const employerSelect = page.locator('select').first();
    await employerSelect.selectOption({ index: 1 });

    // Fill text inputs by order — employer is a <select>, not an <input>,
    // so inputs start at index 0 with employee_number.
    const inputs = page.locator('.panel .panel input');
    await inputs.nth(0).fill(empNumber);
    await inputs.nth(1).fill(nationalId);
    await inputs.nth(2).fill(firstName);
    await inputs.nth(3).fill(lastName);
    // index 4 = start_date (already has today) — leave it
    // index 5 = base_salary
    await inputs.nth(5).fill('15000');
    // index 6 = work_percentage
    await inputs.nth(6).fill('100');
    // index 7 = tax_credits — leave default
    await inputs.nth(8).fill(position);
    await inputs.nth(9).fill(department);

    // Capture the POST call
    const postPromise = page.waitForRequest((req) =>
      req.url().includes('/api/payroll/employees') && req.method() === 'POST'
    );

    await page.locator('.panel .panel').getByRole('button', { name: 'שמור' }).click();

    const postReq = await postPromise;
    const body = postReq.postDataJSON();
    expect(body.employee_number).toBe(empNumber);
    expect(body.national_id).toBe(nationalId);
    expect(body.first_name).toBe(firstName);
    expect(body.last_name).toBe(lastName);
    expect(body.position).toBe(position);
    expect(body.department).toBe(department);
    expect(body.base_salary).toBe(15000);

    // After save, the form closes and the list reloads. The mock pushes the new
    // employee onto the GET response, so it should appear in the table.
    await expect(page.locator('table').getByText(`${firstName} ${lastName}`)).toBeVisible();
    await expect(page.locator('table').getByText(empNumber)).toBeVisible();
  });

  test('employees screen is RTL + dark + Hebrew', async ({ page }) => {
    await page.locator('.tab', { hasText: 'עובדים' }).click();
    await expect(page.locator('.tab.active', { hasText: 'עובדים' })).toBeVisible();

    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');

    const bg = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor
    );
    expect(bg).toBe('rgb(11, 13, 16)');

    const bodyText = (await page.locator('body').innerText()) || '';
    expect(bodyText).toMatch(HEBREW_CHAR_RE);
  });
});
