// @ts-check
/**
 * Shared mock data for payroll-autonomous E2E tests.
 *
 * Matches the shape expected by src/App.jsx from /api/payroll/* endpoints:
 *   - GET  /api/payroll/wage-slips  -> { wage_slips: [...] }
 *   - GET  /api/payroll/employees   -> { employees: [...] }
 *   - GET  /api/payroll/employers   -> { employers: [...] }
 *   - POST /api/payroll/wage-slips/compute -> { wage_slip: {...} }
 *   - POST /api/payroll/employees   -> { employee: {...} }
 *   - POST /api/payroll/employers   -> { employer: {...} }
 */

export const mockEmployers = [
  {
    id: 1,
    legal_name: 'טכנו-קול בע"מ',
    company_id: '515123456',
    tax_file_number: '940123456',
    bituach_leumi_number: '515123456',
    address: 'הברזל 3',
    city: 'תל אביב',
    phone: '03-1234567',
  },
  {
    id: 2,
    legal_name: 'אלקטרו-קול שירותים',
    company_id: '515987654',
    tax_file_number: '940987654',
    bituach_leumi_number: '515987654',
    address: 'רח׳ התעשייה 12',
    city: 'חיפה',
    phone: '04-7654321',
  },
];

export const mockEmployees = [
  {
    id: 101,
    employer_id: 1,
    employee_number: 'E-001',
    national_id: '123456789',
    first_name: 'כובי',
    last_name: 'אלחנן',
    employment_type: 'monthly',
    base_salary: 18000,
    hours_per_month: 182,
    work_percentage: 100,
    tax_credits: 2.25,
    position: 'מהנדס ראשי',
    department: 'פיתוח',
    is_active: true,
  },
  {
    id: 102,
    employer_id: 1,
    employee_number: 'E-002',
    national_id: '987654321',
    first_name: 'שרה',
    last_name: 'לוי',
    employment_type: 'hourly',
    base_salary: 12000,
    hours_per_month: 182,
    work_percentage: 80,
    tax_credits: 2.25,
    position: 'מעצבת',
    department: 'עיצוב',
    is_active: true,
  },
];

export const mockWageSlips = [
  {
    id: 5001,
    employee_id: 101,
    employee_name: 'כובי אלחנן',
    employee_national_id: '123456789',
    period_year: 2026,
    period_month: 4,
    period_label: '04/2026',
    base_pay: 18000,
    overtime_pay: 0,
    vacation_pay: 0,
    sick_pay: 0,
    bonuses: 0,
    gross_pay: 18000,
    income_tax: 2100,
    bituach_leumi: 650,
    health_tax: 540,
    pension_employee: 1080,
    study_fund_employee: 450,
    total_deductions: 4820,
    net_pay: 13180,
    pension_employer: 1260,
    severance_employer: 1512,
    bituach_leumi_employer: 1260,
    status: 'computed',
  },
  {
    id: 5002,
    employee_id: 102,
    employee_name: 'שרה לוי',
    employee_national_id: '987654321',
    period_year: 2026,
    period_month: 4,
    period_label: '04/2026',
    base_pay: 9600,
    overtime_pay: 0,
    vacation_pay: 0,
    sick_pay: 0,
    bonuses: 0,
    gross_pay: 9600,
    income_tax: 780,
    bituach_leumi: 345,
    health_tax: 288,
    pension_employee: 576,
    study_fund_employee: 0,
    total_deductions: 1989,
    net_pay: 7611,
    pension_employer: 672,
    severance_employer: 806,
    bituach_leumi_employer: 672,
    status: 'approved',
  },
];

/** Result returned by POST /api/payroll/wage-slips/compute */
export const mockComputedWageSlipPreview = {
  id: null,
  employee_id: 101,
  employee_name: 'כובי אלחנן',
  employee_national_id: '123456789',
  period_year: 2026,
  period_month: 4,
  period_label: '04/2026',
  base_pay: 18000,
  overtime_pay: 1250,
  vacation_pay: 0,
  sick_pay: 0,
  bonuses: 500,
  gross_pay: 19750,
  income_tax: 2450,
  bituach_leumi: 712,
  health_tax: 592,
  pension_employee: 1185,
  study_fund_employee: 494,
  total_deductions: 5433,
  net_pay: 14317,
  pension_employer: 1382,
  severance_employer: 1659,
  bituach_leumi_employer: 1382,
  status: 'computed',
};

/**
 * Installs mock routes for ALL /api/payroll/** endpoints used by App.jsx.
 * Call this from every test before `page.goto('/')`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {any[]} [opts.employers]
 * @param {any[]} [opts.employees]
 * @param {any[]} [opts.wageSlips]
 */
export async function installPayrollMocks(page, opts = {}) {
  const employers = [...(opts.employers ?? mockEmployers)];
  const employees = [...(opts.employees ?? mockEmployees)];
  const wageSlips = [...(opts.wageSlips ?? mockWageSlips)];

  await page.route('**/api/payroll/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    // --- Collections ----------------------------------------------------
    if (path.endsWith('/api/payroll/wage-slips') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ wage_slips: wageSlips }),
      });
    }

    if (path.endsWith('/api/payroll/employees') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ employees }),
      });
    }

    if (path.endsWith('/api/payroll/employers') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ employers }),
      });
    }

    // --- Compute preview -----------------------------------------------
    if (path.endsWith('/api/payroll/wage-slips/compute') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ wage_slip: mockComputedWageSlipPreview }),
      });
    }

    // --- Create wage slip ----------------------------------------------
    if (path.endsWith('/api/payroll/wage-slips') && method === 'POST') {
      const created = {
        ...mockComputedWageSlipPreview,
        id: 9999,
        status: 'computed',
      };
      wageSlips.push(created);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ wage_slip: created }),
      });
    }

    // --- Create employee ------------------------------------------------
    if (path.endsWith('/api/payroll/employees') && method === 'POST') {
      const body = req.postDataJSON() || {};
      const created = {
        id: 999,
        employer_id: body.employer_id ?? 1,
        employee_number: body.employee_number || 'E-999',
        national_id: body.national_id || '000000000',
        first_name: body.first_name || 'חדש',
        last_name: body.last_name || 'עובד',
        employment_type: body.employment_type || 'monthly',
        base_salary: Number(body.base_salary || 10000),
        hours_per_month: Number(body.hours_per_month || 182),
        work_percentage: Number(body.work_percentage || 100),
        tax_credits: Number(body.tax_credits || 2.25),
        position: body.position || '',
        department: body.department || '',
        is_active: true,
      };
      employees.push(created);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ employee: created }),
      });
    }

    // --- Create employer ------------------------------------------------
    if (path.endsWith('/api/payroll/employers') && method === 'POST') {
      const body = req.postDataJSON() || {};
      const created = {
        id: 777,
        legal_name: body.legal_name || 'חברה חדשה',
        company_id: body.company_id || '000000000',
        tax_file_number: body.tax_file_number || '',
        bituach_leumi_number: body.bituach_leumi_number || '',
        address: body.address || '',
        city: body.city || '',
        phone: body.phone || '',
      };
      employers.push(created);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ employer: created }),
      });
    }

    // --- Approve / Issue actions ---------------------------------------
    if (/\/api\/payroll\/wage-slips\/\d+\/approve$/.test(path) && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    if (/\/api\/payroll\/wage-slips\/\d+\/issue$/.test(path) && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    // --- Default: empty 200 --------------------------------------------
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

/** Regex matching any Hebrew character (Unicode block U+0590 - U+05FF). */
export const HEBREW_CHAR_RE = /[\u0590-\u05FF]/;
