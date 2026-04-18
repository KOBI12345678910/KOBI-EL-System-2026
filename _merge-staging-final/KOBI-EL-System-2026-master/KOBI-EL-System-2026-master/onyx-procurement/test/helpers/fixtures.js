/**
 * fixtures.js — shared sample rows for Agent-15 test harness.
 *
 * Each factory returns a FRESH object (safe to mutate). Values are
 * realistic-enough for Israeli 2026 payroll / procurement flows, but the
 * IDs are deterministic so tests stay stable. Pass overrides via the
 * second arg to customise without copy-pasting the whole row.
 */

'use strict';

function withOverrides(base, overrides = {}) {
  return Object.assign({}, base, overrides);
}

function sampleEmployer(overrides = {}) {
  return withOverrides({
    id: 'employer-001',
    legal_name: 'Techno Kol Uzi Ltd',
    trade_name: 'Techno Kol',
    tax_id: '514000123',
    company_type: 'בעמ',
    deductions_file: '9350123',
    address_line: 'רחוב הרצל 10',
    city: 'תל אביב',
    postal_code: '6701101',
    phone: '03-1234567',
    email: 'office@technokol.co.il',
    bank_code: '12',
    bank_branch: '825',
    bank_account: '123456',
    pension_default_employer_pct: 6.5,
    pension_default_severance_pct: 6.0,
    study_fund_default_employer_pct: 7.5,
    created_at: '2026-01-01T00:00:00Z',
  }, overrides);
}

function sampleEmployee(employer_id = 'employer-001', overrides = {}) {
  return withOverrides({
    id: 'emp-001',
    employer_id,
    first_name: 'משה',
    last_name: 'כהן',
    id_number: '032123459',
    birth_date: '1985-04-15',
    start_date: '2024-01-01',
    employment_type: 'monthly',
    job_title: 'מנהל פרויקטים',
    department: 'הנדסה',
    base_salary: 18000,
    standard_monthly_hours: 182,
    credit_points: 2.25,
    tax_coordination: false,
    residency: 'resident',
    pension_fund_name: 'מגדל מקפת',
    pension_employer_pct: 6.5,
    pension_severance_pct: 6.0,
    pension_employee_pct: 6.0,
    study_fund_enabled: true,
    study_fund_employer_pct: 7.5,
    study_fund_employee_pct: 2.5,
    bank_code: '12',
    bank_branch: '825',
    bank_account: '987654',
    active: true,
    created_at: '2024-01-01T00:00:00Z',
  }, overrides);
}

function sampleHourlyEmployee(employer_id = 'employer-001', overrides = {}) {
  return sampleEmployee(employer_id, withOverrides({
    id: 'emp-hourly-001',
    first_name: 'שרה',
    last_name: 'לוי',
    id_number: '053987654',
    employment_type: 'hourly',
    base_salary: null,
    hourly_rate: 65,
    standard_monthly_hours: 182,
    credit_points: 2.75,
  }, overrides));
}

function sampleTimesheet(overrides = {}) {
  return withOverrides({
    id: 'ts-001',
    employee_id: 'emp-001',
    period: '2026-03',
    regular_hours: 182,
    overtime_125_hours: 0,
    overtime_150_hours: 0,
    overtime_200_hours: 0,
    sick_hours: 0,
    vacation_hours: 0,
    travel_days: 0,
    notes: '',
    approved: true,
    created_at: '2026-04-01T00:00:00Z',
  }, overrides);
}

function sampleWageSlip(employee_id = 'emp-001', employer_id = 'employer-001', overrides = {}) {
  return withOverrides({
    id: 'slip-001',
    employee_id,
    employer_id,
    period: '2026-03',
    gross: 18000,
    income_tax: 1850,
    bituach_leumi: 420,
    health_insurance: 540,
    pension_employee: 1080,
    study_fund_employee: 450,
    other_deductions: 0,
    net: 13660,
    pension_employer: 1170,
    severance_employer: 1080,
    study_fund_employer: 1350,
    total_cost_to_employer: 21600,
    issued_at: '2026-04-05T00:00:00Z',
  }, overrides);
}

function sampleCustomer(overrides = {}) {
  return withOverrides({
    id: 'cust-001',
    legal_name: 'חברת בנייה אלפא בעמ',
    tax_id: '515987321',
    contact_name: 'אבי ישראלי',
    phone: '050-1234567',
    email: 'avi@alpha-build.co.il',
    address_line: 'שדרות רוטשילד 50',
    city: 'תל אביב',
    payment_terms_days: 60,
    currency: 'ILS',
    active: true,
    created_at: '2025-11-10T00:00:00Z',
  }, overrides);
}

function sampleInvoice(overrides = {}) {
  return withOverrides({
    id: 'inv-001',
    customer_id: 'cust-001',
    invoice_number: '2026001',
    issue_date: '2026-03-31',
    due_date: '2026-05-30',
    subtotal: 10000.00,
    vat_rate: 18,
    vat_amount: 1800.00,
    total: 11800.00,
    currency: 'ILS',
    status: 'issued',
    description: 'עבודות אחזקה חודש מרץ',
    created_at: '2026-03-31T12:00:00Z',
  }, overrides);
}

function sampleBankTransaction(overrides = {}) {
  return withOverrides({
    id: 'bt-001',
    account_id: 'acct-001',
    value_date: '2026-04-02',
    booking_date: '2026-04-02',
    amount: 11800.00,
    currency: 'ILS',
    direction: 'credit',
    counterparty_name: 'חברת בנייה אלפא בעמ',
    counterparty_account: '12-825-987654',
    reference: '2026001',
    description: 'העברה זכות',
    balance_after: 125400.00,
    matched_invoice_id: null,
    imported_at: '2026-04-03T06:00:00Z',
  }, overrides);
}

function sampleCsvContent() {
  return [
    'תאריך ערך,תאריך ביצוע,תיאור,סכום,מטבע,יתרה',
    '02/04/2026,02/04/2026,העברה זכות חברת בנייה אלפא בעמ,11800.00,ILS,125400.00',
    '03/04/2026,03/04/2026,תשלום משכורת משה כהן,-13660.00,ILS,111740.00',
    '05/04/2026,05/04/2026,אגרה בנקאית,-35.00,ILS,111705.00',
    '',
  ].join('\n');
}

function sampleMt940Content() {
  return [
    ':20:STMT20260402',
    ':25:IL12-0825-0000123456',
    ':28C:00092/001',
    ':60F:C260402ILS113635,00',
    ':61:2604020402C11800,00NTRFNONREF//2026001',
    ':86:העברה זכות חברת בנייה אלפא בעמ',
    ':61:2604030403D13660,00NTRFNONREF//SALARY',
    ':86:תשלום משכורת משה כהן',
    ':62F:C260405ILS111705,00',
    '-',
    '',
  ].join('\n');
}

module.exports = {
  sampleEmployer,
  sampleEmployee,
  sampleHourlyEmployee,
  sampleTimesheet,
  sampleWageSlip,
  sampleCustomer,
  sampleInvoice,
  sampleBankTransaction,
  sampleCsvContent,
  sampleMt940Content,
};
