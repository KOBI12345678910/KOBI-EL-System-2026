/**
 * Test fixture factory — wage slips
 *
 * Matches the `wage_slips` schema in 007-payroll-wage-slip.sql and the
 * object returned by wage-slip-calculator.js → computeWageSlip(...).
 *
 * The employer snapshot fields (per חוק הגנת השכר תיקון 24) are
 *   employer_legal_name, employer_company_id, employer_tax_file.
 * Money fields are Numbers with 2 decimals.
 */

'use strict';

const {
  randInt,
  money,
  generateIsraeliId,
  generateCompanyId,
} = require('./suppliers');

let _slipSeq = 0;

function makeWageSlip(overrides = {}) {
  _slipSeq += 1;
  const year = 2026;
  const month = randInt(1, 12);
  const label = `${year}-${String(month).padStart(2, '0')}`;

  // Earnings
  const base_pay = money(12000);
  const overtime_pay = money(0);
  const vacation_pay = money(0);
  const sick_pay = money(0);
  const holiday_pay = money(0);
  const bonuses = money(0);
  const commissions = money(0);
  const allowances_meal = money(400);
  const allowances_travel = money(300);
  const allowances_clothing = money(0);
  const allowances_phone = money(0);
  const other_earnings = money(0);

  const gross_pay = money(
    base_pay + overtime_pay + vacation_pay + sick_pay + holiday_pay +
    bonuses + commissions +
    allowances_meal + allowances_travel + allowances_clothing + allowances_phone +
    other_earnings
  );

  // Deductions
  const income_tax = money(620);
  const bituach_leumi = money(430);
  const health_tax = money(395);
  const pension_employee = money(gross_pay * 0.06);
  const study_fund_employee = money(gross_pay * 0.025);
  const severance_employee = 0;
  const loans = 0;
  const garnishments = 0;
  const other_deductions = 0;

  const total_deductions = money(
    income_tax + bituach_leumi + health_tax +
    pension_employee + study_fund_employee + severance_employee +
    loans + garnishments + other_deductions
  );

  const net_pay = money(gross_pay - total_deductions);

  return {
    id: overrides.id || _slipSeq,
    employee_id: 1,
    employer_id: 1,

    // period
    period_year: year,
    period_month: month,
    period_label: label,
    pay_date: `${year}-${String(month + 1).padStart(2, '0')}-10`,

    // snapshot (PII frozen at slip time — per Wage Protection Law)
    employee_number: 'EMP-0001',
    employee_name: 'Dana Levi',
    employee_national_id: generateIsraeliId(),
    employer_legal_name: 'Onyx Construction Ltd',
    employer_company_id: generateCompanyId(),
    employer_tax_file: String(randInt(900000000, 999999999)),
    position: 'Site Engineer',
    department: 'Engineering',

    // hours
    hours_regular: 182,
    hours_overtime_125: 0,
    hours_overtime_150: 0,
    hours_overtime_175: 0,
    hours_overtime_200: 0,
    hours_absence: 0,
    hours_vacation: 0,
    hours_sick: 0,
    hours_reserve: 0,

    // earnings
    base_pay,
    overtime_pay,
    vacation_pay,
    sick_pay,
    holiday_pay,
    bonuses,
    commissions,
    allowances_meal,
    allowances_travel,
    allowances_clothing,
    allowances_phone,
    other_earnings,
    gross_pay,

    // deductions
    income_tax,
    bituach_leumi,
    health_tax,
    pension_employee,
    study_fund_employee,
    severance_employee,
    loans,
    garnishments,
    other_deductions,
    total_deductions,

    net_pay,

    // employer contributions
    pension_employer: money(gross_pay * 0.065),
    study_fund_employer: money(gross_pay * 0.075),
    severance_employer: money(gross_pay * 0.0833),
    bituach_leumi_employer: money(gross_pay * 0.0355),
    health_tax_employer: 0,

    // balances
    vacation_balance: 12,
    sick_balance: 18,
    study_fund_balance: money(8500),
    severance_balance: money(15000),

    // YTD
    ytd_gross: money(gross_pay * month),
    ytd_income_tax: money(income_tax * month),
    ytd_bituach_leumi: money(bituach_leumi * month),
    ytd_pension: money(pension_employee * month),

    status: 'computed',
    pdf_path: null,
    pdf_generated_at: null,
    emailed_at: null,
    viewed_by_employee_at: null,

    prepared_by: 'factory',
    approved_by: null,
    approved_at: null,
    amendment_of: null,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    ...overrides,
  };
}

module.exports = { makeWageSlip };
