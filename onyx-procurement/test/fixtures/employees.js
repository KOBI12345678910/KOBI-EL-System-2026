/**
 * Test fixture factory — employees
 * Matches `employees` schema in 007-payroll-wage-slip.sql.
 *
 * Consumed by wage-slip-calculator.js (see computeWageSlip):
 *   employee.id, employee.employer_id, employee.employee_number,
 *   employee.national_id, employee.first_name, employee.last_name,
 *   employee.full_name, employee.employment_type, employee.base_salary,
 *   employee.work_percentage, employee.hours_per_month,
 *   employee.tax_credits, employee.study_fund_number,
 *   employee.position, employee.department.
 */

'use strict';

const {
  randInt,
  pick,
  money,
  generateIsraeliId,
} = require('./suppliers');

const FIRST_NAMES = ['Dana', 'Yossi', 'Maya', 'Roni', 'Tamar', 'Avi', 'Shira', 'Omer'];
const LAST_NAMES = ['Levi', 'Mizrahi', 'Cohen', 'Peretz', 'Azulai', 'Katz', 'BenDavid'];
const POSITIONS = ['Site Engineer', 'Carpenter', 'Electrician', 'Project Manager', 'Accountant'];
const DEPARTMENTS = ['Engineering', 'Site', 'Admin', 'Finance', 'Operations'];
const BANK_CODES = ['10', '11', '12', '13', '17', '20', '31'];
const PENSION_FUNDS = ['Menora', 'Migdal', 'Harel', 'Clal', 'Phoenix'];

let _employeeSeq = 0;

/**
 * Produce a plausible `employees` row.
 *
 * By default an employee is `employment_type = 'monthly'` with
 * base_salary = 12,000 ₪/mo and full 100% work percentage.
 * Pass `{ employment_type: 'hourly', base_salary: 50 }` for hourly.
 */
function makeEmployee(overrides = {}) {
  _employeeSeq += 1;
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const employmentType = overrides.employment_type || 'monthly';
  const baseSalary = employmentType === 'monthly'
    ? money(randInt(9000, 24000))   // monthly gross
    : money(randInt(40, 120));      // hourly rate
  const id = overrides.id || _employeeSeq;

  return {
    id,
    employer_id: 1,
    employee_number: `EMP-${String(_employeeSeq).padStart(4, '0')}`,
    national_id: generateIsraeliId(),
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`,
    birth_date: `19${randInt(70, 99)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
    start_date: `20${randInt(15, 25)}-${String(randInt(1, 12)).padStart(2, '0')}-01`,
    end_date: null,
    position: pick(POSITIONS),
    department: pick(DEPARTMENTS),
    employment_type: employmentType,
    work_percentage: 100,
    base_salary: baseSalary,
    hours_per_month: 182,
    bank_account_id: null,
    bank_code: pick(BANK_CODES),
    bank_branch: String(randInt(100, 999)),
    bank_account_number: String(randInt(100000, 9999999)),
    pension_fund: pick(PENSION_FUNDS),
    pension_fund_number: `PF-${randInt(100000, 999999)}`,
    study_fund: pick(PENSION_FUNDS),
    study_fund_number: `SF-${randInt(100000, 999999)}`,
    tax_credits: 2.25,
    is_active: true,
    created_at: new Date().toISOString(),
    created_by: 'factory',
    ...overrides,
  };
}

module.exports = { makeEmployee };
