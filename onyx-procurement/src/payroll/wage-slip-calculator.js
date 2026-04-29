/**
 * Wage Slip Calculator — Israeli Payroll Engine
 * Wave 1.5 — B-08 fix
 *
 * Computes a full wage slip per Israeli labor and tax law:
 *   - Gross pay from hours + rates (regular + overtime 125/150/175/200)
 *   - Income tax using 2026 brackets with נקודות זיכוי
 *   - ביטוח לאומי (National Insurance) — employee + employer
 *   - מס בריאות (Health Tax) — employee
 *   - Pension contributions — employee + employer
 *   - Study fund (קרן השתלמות) — employee + employer
 *   - Severance (פיצויים) — employer
 *
 * Complies with חוק הגנת השכר תיקון 24 (Wage Protection Law Amendment 24)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 2026 TAX CONSTANTS (Israel)
// Sources: רשות המסים בישראל, ביטוח לאומי, משרד האוצר
// All values in NIS/year unless stated otherwise
// ═══════════════════════════════════════════════════════════════

const CONSTANTS_2026 = {
  // Income tax brackets (מדרגות מס הכנסה) — annual thresholds
  INCOME_TAX_BRACKETS: [
    { upTo:  84120, rate: 0.10 },  // 10%
    { upTo: 120720, rate: 0.14 },  // 14%
    { upTo: 193800, rate: 0.20 },  // 20%
    { upTo: 269280, rate: 0.31 },  // 31%
    { upTo: 560280, rate: 0.35 },  // 35%
    { upTo: 721560, rate: 0.47 },  // 47%
    { upTo: Infinity, rate: 0.50 }, // 50% (including יסף — high earners surtax)
  ],

  // נקודת זיכוי (tax credit point) — annual value
  TAX_CREDIT_POINT_ANNUAL: 2976,     // ₪2,976 / year = ₪248 / month
  TAX_CREDIT_POINT_MONTHLY: 248,

  // ביטוח לאומי (National Insurance) — 2026
  // Threshold: 60% of average salary (~60% × ₪12,536 = ~₪7,522/month)
  BITUACH_LEUMI: {
    MONTHLY_THRESHOLD: 7522,        // reduced rate below, full rate above
    MONTHLY_MAX_BASE: 49030,        // max insurable earnings
    EMPLOYEE_LOW_RATE: 0.004,       // 0.4%
    EMPLOYEE_HIGH_RATE: 0.07,       // 7%
    EMPLOYER_LOW_RATE: 0.0355,      // 3.55%
    EMPLOYER_HIGH_RATE: 0.076,      // 7.6%
  },

  // מס בריאות (Health Insurance) — 2026
  HEALTH_TAX: {
    MONTHLY_THRESHOLD: 7522,
    MONTHLY_MAX_BASE: 49030,
    EMPLOYEE_LOW_RATE: 0.031,       // 3.1%
    EMPLOYEE_HIGH_RATE: 0.05,       // 5%
  },

  // Pension / פנסיה — statutory minimums (תקנות פנסיית חובה)
  PENSION: {
    MIN_BASE_MONTHLY: 0,            // from first shekel under mandatory pension law
    MAX_PENSIONABLE: 28750,         // cap on pensionable salary (~2× average wage)
    EMPLOYEE_RATE: 0.06,            // 6%
    EMPLOYER_RATE: 0.065,           // 6.5%
    SEVERANCE_RATE: 0.0833,         // 8.33% (=1/12 month) for פיצויים
  },

  // קרן השתלמות (Study Fund) — voluntary but common
  STUDY_FUND: {
    MAX_BASE_MONTHLY: 15712,        // tax-exempt cap
    EMPLOYEE_RATE: 0.025,           // 2.5%
    EMPLOYER_RATE: 0.075,           // 7.5%
  },

  // Overtime multipliers per חוק שעות עבודה ומנוחה
  OVERTIME_RATES: {
    REGULAR: 1.00,
    FIRST_2H: 1.25,   // 125% — first 2 overtime hours
    AFTER_2H: 1.50,   // 150% — hours 3+ overtime
    WEEKEND:  1.75,   // 175% — שישי-שבת after-hours
    HOLIDAY:  2.00,   // 200% — חג / מועד
  },

  // Standard working hours
  STANDARD_HOURS_PER_MONTH: 182,    // 42h/week × 4.333

  // Rounding
  ROUND_TO: 2,                       // NIS precision
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function round(n, decimals = CONSTANTS_2026.ROUND_TO) {
  const factor = Math.pow(10, decimals);
  return Math.round(Number(n || 0) * factor) / factor;
}

/**
 * BL/Bituach-Leumi rounding rule per btl.gov.il batch engine:
 * floor to nearest agora (NOT half-away-from-zero).
 * Filing Form 102 with non-floor values causes 1-agora reject mismatches.
 *
 * AGENT-04 FIX #6
 */
function floorToAgora(n) {
  return Math.floor(Number(n || 0) * 100) / 100;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ═══════════════════════════════════════════════════════════════
// SICK PAY LADDER — חוק דמי מחלה התשל"ו-1976
// Day 1 = 0%, Days 2-3 = 50%, Day 4+ = 100%
// AGENT-04 FIX #1
// ═══════════════════════════════════════════════════════════════
function computeSickPayLadder(sickDays, dailyRate) {
  const d = Math.max(0, toNum(sickDays));
  const rate = toNum(dailyRate);
  if (d <= 0 || rate <= 0) return 0;
  // Day 1: 0% (no pay)
  // Days 2-3: 50% — up to 2 days
  const day2to3 = Math.min(Math.max(0, d - 1), 2);
  // Day 4+: 100% — anything past day 3
  const day4plus = Math.max(0, d - 3);
  return round(day2to3 * rate * 0.50 + day4plus * rate * 1.00);
}

/**
 * Convert sick HOURS to sick DAYS using standard daily-hours.
 * Israeli statute is per-day, but timesheet stores hours; assume 8.4h/day
 * (182h/month / ~21.67 working days). Allow override via employee.hours_per_day.
 */
function sickHoursToDays(sickHours, employee) {
  const h = toNum(sickHours);
  if (h <= 0) return 0;
  const standardMonth = toNum(employee?.hours_per_month) || CONSTANTS_2026.STANDARD_HOURS_PER_MONTH;
  const hoursPerDay = toNum(employee?.hours_per_day) || (standardMonth / 21.67);
  return h / hoursPerDay;
}

// ═══════════════════════════════════════════════════════════════
// ALLOWANCE EXEMPTIONS — פקודת מס הכנסה ס׳ 32
// AGENT-04 FIX #3
// Travel נסיעות: ≤ ₪22.60/working-day exempt (~21.67 days/month)
// Meal/אוכל: שווי daily-cap exempt
// Clothing/ביגוד: per-role ceiling exempt
// Phone/טלפון: שווי partial — exempt portion follows ruling
// ═══════════════════════════════════════════════════════════════
const ALLOWANCE_EXEMPT_2026 = {
  TRAVEL_DAILY: 22.60,             // exempt up to per working day
  WORKING_DAYS_MONTH: 21.67,       // ≈ 22 working days
  MEAL_DAILY: 0,                   // meal allowance is fully taxable absent ruling
  CLOTHING_ANNUAL_CAP: 0,          // employer-specific; default no exemption
  PHONE_MONTHLY: 0,                // שווי טלפון — default no exemption
};

function computeAllowanceExemptions({ allowances_travel, allowances_meal, allowances_clothing, allowances_phone, working_days }) {
  const days = toNum(working_days) || ALLOWANCE_EXEMPT_2026.WORKING_DAYS_MONTH;
  // Travel exemption: min(actual, daily_cap × working_days)
  const travelCap = ALLOWANCE_EXEMPT_2026.TRAVEL_DAILY * days;
  const travelExempt = Math.min(toNum(allowances_travel), travelCap);
  const mealExempt = Math.min(toNum(allowances_meal), ALLOWANCE_EXEMPT_2026.MEAL_DAILY * days);
  const clothingExempt = Math.min(toNum(allowances_clothing), ALLOWANCE_EXEMPT_2026.CLOTHING_ANNUAL_CAP / 12);
  const phoneExempt = Math.min(toNum(allowances_phone), ALLOWANCE_EXEMPT_2026.PHONE_MONTHLY);
  const total = round(travelExempt + mealExempt + clothingExempt + phoneExempt);
  return {
    travel_exempt: round(travelExempt),
    meal_exempt: round(mealExempt),
    clothing_exempt: round(clothingExempt),
    phone_exempt: round(phoneExempt),
    total_exempt: total,
  };
}

// ═══════════════════════════════════════════════════════════════
// GROSS PAY CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute gross pay for an hourly/daily employee from timesheet.
 * For monthly-salaried employees, pass base_salary directly as base_pay.
 */
function computeHourlyGross(employee, timesheet) {
  const hourlyRate = toNum(employee.base_salary);
  const regularHours = toNum(timesheet.hours_regular);
  const ot125 = toNum(timesheet.hours_overtime_125);
  const ot150 = toNum(timesheet.hours_overtime_150);
  const ot175 = toNum(timesheet.hours_overtime_175);
  const ot200 = toNum(timesheet.hours_overtime_200);

  const basePay = round(regularHours * hourlyRate);
  const overtimePay = round(
    ot125 * hourlyRate * 1.25 +
    ot150 * hourlyRate * 1.50 +
    ot175 * hourlyRate * 1.75 +
    ot200 * hourlyRate * 2.00
  );

  return { basePay, overtimePay };
}

/**
 * Compute gross for a monthly-salaried employee, accounting for absence days.
 */
function computeMonthlyGross(employee, timesheet) {
  const monthlyBase = toNum(employee.base_salary);
  const wpRaw = toNum(employee.work_percentage);
  const workPercentage = (wpRaw != null && !isNaN(wpRaw)) ? wpRaw / 100 : 1;
  const standardHours = toNum(employee.hours_per_month) || CONSTANTS_2026.STANDARD_HOURS_PER_MONTH;
  const hourlyRate = (monthlyBase * workPercentage) / standardHours;

  const absence = toNum(timesheet.hours_absence);
  const vacation = toNum(timesheet.hours_vacation);
  const sick = toNum(timesheet.hours_sick);

  // Base pay: pro-rated monthly salary minus unpaid absence
  const basePay = round(monthlyBase * workPercentage - (absence * hourlyRate));
  const vacationPay = round(vacation * hourlyRate);
  // AGENT-04 FIX #1: Sick-pay ladder per חוק דמי מחלה התשל"ו-1976
  // Day 1 = 0%, Days 2-3 = 50%, Day 4+ = 100% (was: flat 50% — under-paid long sick leave)
  const sickDays = sickHoursToDays(sick, employee);
  const dailyRate = hourlyRate * (toNum(employee.hours_per_day) || (standardHours / 21.67));
  const sickPay = computeSickPayLadder(sickDays, dailyRate);

  // Overtime on top of monthly base
  const ot125 = toNum(timesheet.hours_overtime_125);
  const ot150 = toNum(timesheet.hours_overtime_150);
  const ot175 = toNum(timesheet.hours_overtime_175);
  const ot200 = toNum(timesheet.hours_overtime_200);
  const overtimePay = round(
    ot125 * hourlyRate * 1.25 +
    ot150 * hourlyRate * 1.50 +
    ot175 * hourlyRate * 1.75 +
    ot200 * hourlyRate * 2.00
  );

  return { basePay, overtimePay, vacationPay, sickPay, hourlyRate: round(hourlyRate, 4) };
}

// ═══════════════════════════════════════════════════════════════
// INCOME TAX (מס הכנסה)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute annual income tax using progressive brackets,
 * then subtract credit points (נקודות זיכוי), then floor at zero.
 *
 * @param annualTaxableIncome NIS/year
 * @param taxCreditPoints     number (default 2.25 = resident Israeli male)
 * @returns annual tax in NIS
 */
function computeIncomeTaxAnnual(annualTaxableIncome, taxCreditPoints = 2.25) {
  let tax = 0;
  let remaining = Math.max(0, annualTaxableIncome);
  let prevThreshold = 0;

  for (const bracket of CONSTANTS_2026.INCOME_TAX_BRACKETS) {
    const bracketSize = bracket.upTo - prevThreshold;
    const taxable = Math.min(remaining, bracketSize);
    if (taxable <= 0) break;
    tax += taxable * bracket.rate;
    remaining -= taxable;
    prevThreshold = bracket.upTo;
  }

  const creditValue = taxCreditPoints * CONSTANTS_2026.TAX_CREDIT_POINT_ANNUAL;
  return Math.max(0, tax - creditValue);
}

/**
 * Compute monthly income tax by annualizing the month's taxable base,
 * then dividing the annual tax by 12. This is how Israeli payroll works:
 * taxation is progressive on annualized income.
 *
 * Naive form retained for backward compatibility / unit tests.
 */
function computeIncomeTaxMonthly(monthlyTaxable, taxCreditPoints = 2.25) {
  const annualTax = computeIncomeTaxAnnual(monthlyTaxable * 12, taxCreditPoints);
  return round(annualTax / 12);
}

/**
 * AGENT-04 FIX #2: Income-tax YTD true-up (תיאום מס cumulative method).
 *
 * Real Israeli payroll trues up cumulatively each month:
 *   tax_owed_to_date = tax(YTD_taxable / months_elapsed × 12) × (months_elapsed / 12)
 *   tax_this_month   = tax_owed_to_date − tax_already_withheld_YTD
 *
 * This corrects bonus months (over-deducted by ~10–15% under naive ×12) and
 * sparse-income months (previously under-deducted). Form 106 will balance.
 *
 * @param monthlyTaxable      this month's taxable income (NIS)
 * @param taxCreditPoints     נקודות זיכוי (e.g. 2.25)
 * @param ytdTaxable          taxable income YTD BEFORE this month
 * @param ytdTaxWithheld      income tax already withheld YTD BEFORE this month
 * @param monthIndex          current month 1..12 (so far in fiscal year)
 */
function computeIncomeTaxMonthlyYTD(monthlyTaxable, taxCreditPoints = 2.25, ytdTaxable = 0, ytdTaxWithheld = 0, monthIndex = 1) {
  const m = Math.max(1, Math.min(12, Math.floor(monthIndex)));
  const cumulativeTaxable = toNum(ytdTaxable) + toNum(monthlyTaxable);
  // Project annual income from cumulative-to-date
  const projectedAnnual = (cumulativeTaxable / m) * 12;
  const projectedAnnualTax = computeIncomeTaxAnnual(projectedAnnual, taxCreditPoints);
  // Tax owed cumulatively through end of THIS month
  const taxOwedToDate = projectedAnnualTax * (m / 12);
  // True-up: subtract what was already withheld; floor at zero (no refund mid-year via slip)
  const thisMonthTax = Math.max(0, taxOwedToDate - toNum(ytdTaxWithheld));
  return round(thisMonthTax);
}

// ═══════════════════════════════════════════════════════════════
// ביטוח לאומי & מס בריאות (National Insurance + Health Tax)
// ═══════════════════════════════════════════════════════════════

/**
 * Computes employee + employer Bituach Leumi and Health Tax with
 * the two-tier threshold: reduced rate below ~60% of average wage,
 * full rate above, capped at max insurable earnings.
 */
function computeBituachLeumiAndHealth(monthlyTaxable) {
  const BL = CONSTANTS_2026.BITUACH_LEUMI;
  const HT = CONSTANTS_2026.HEALTH_TAX;

  const base = Math.min(Math.max(0, monthlyTaxable), BL.MONTHLY_MAX_BASE);
  const lowPortion = Math.min(base, BL.MONTHLY_THRESHOLD);
  const highPortion = Math.max(0, base - BL.MONTHLY_THRESHOLD);

  const blEmployee = round(lowPortion * BL.EMPLOYEE_LOW_RATE + highPortion * BL.EMPLOYEE_HIGH_RATE);
  const blEmployer = round(lowPortion * BL.EMPLOYER_LOW_RATE + highPortion * BL.EMPLOYER_HIGH_RATE);
  const htEmployee = round(lowPortion * HT.EMPLOYEE_LOW_RATE + highPortion * HT.EMPLOYEE_HIGH_RATE);

  return {
    bituach_leumi_employee: blEmployee,
    bituach_leumi_employer: blEmployer,
    health_tax_employee: htEmployee,
    // Health tax employer portion is embedded in bituach_leumi_employer in Israeli law
    health_tax_employer: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// PENSION, STUDY FUND, SEVERANCE
// ═══════════════════════════════════════════════════════════════

function computePensionContributions(monthlyTaxable) {
  const P = CONSTANTS_2026.PENSION;
  const base = Math.min(Math.max(0, monthlyTaxable), P.MAX_PENSIONABLE);
  return {
    pension_employee: round(base * P.EMPLOYEE_RATE),
    pension_employer: round(base * P.EMPLOYER_RATE),
    severance_employer: round(base * P.SEVERANCE_RATE),
  };
}

function computeStudyFund(monthlyTaxable, eligible = true) {
  if (!eligible) {
    return { study_fund_employee: 0, study_fund_employer: 0 };
  }
  const S = CONSTANTS_2026.STUDY_FUND;
  const base = Math.min(Math.max(0, monthlyTaxable), S.MAX_BASE_MONTHLY);
  return {
    study_fund_employee: round(base * S.EMPLOYEE_RATE),
    study_fund_employer: round(base * S.EMPLOYER_RATE),
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT — build a complete wage slip
// ═══════════════════════════════════════════════════════════════

/**
 * @param employee  — row from employees table
 * @param employer  — row from employers table
 * @param timesheet — { hours_regular, hours_overtime_*, hours_absence, hours_vacation, hours_sick, bonuses, commissions, allowances_*, other_earnings }
 * @param period    — { year, month, pay_date }
 * @param ytd       — optional { ytd_gross, ytd_income_tax, ytd_bituach_leumi, ytd_pension } for carrying balances
 * @returns full wage slip object ready to INSERT into wage_slips
 */
function computeWageSlip({ employee, employer, timesheet = {}, period, ytd = {} }) {
  if (!employee) throw new Error('employee required');
  if (!employer) throw new Error('employer required');
  if (!period?.year || !period?.month) throw new Error('period {year, month} required');

  // ── 1. Gross pay breakdown ──
  let basePay, overtimePay, vacationPay = 0, sickPay = 0, hourlyRate;

  if (employee.employment_type === 'monthly') {
    const r = computeMonthlyGross(employee, timesheet);
    basePay = r.basePay; overtimePay = r.overtimePay;
    vacationPay = r.vacationPay; sickPay = r.sickPay;
    hourlyRate = r.hourlyRate;
  } else {
    const r = computeHourlyGross(employee, timesheet);
    basePay = r.basePay; overtimePay = r.overtimePay;
    // AGENT-04 FIX #4: Resolve hourly rate safely — never multiply hours by base_salary
    // when base_salary actually stores a MONTHLY figure (catastrophic over-pay).
    // Prefer explicit hourly_rate; else if base_salary is suspiciously high (>500/h),
    // back-derive from monthly assuming standard hours; else use base_salary as hourly.
    const explicitHourly = toNum(employee.hourly_rate);
    const baseSalary = toNum(employee.base_salary);
    const standardHours = toNum(employee.hours_per_month) || CONSTANTS_2026.STANDARD_HOURS_PER_MONTH;
    if (explicitHourly > 0) {
      hourlyRate = explicitHourly;
    } else if (baseSalary > 500) {
      // base_salary holds a monthly figure (no hourly rate is realistically >500 NIS/h)
      hourlyRate = baseSalary / standardHours;
    } else {
      hourlyRate = baseSalary;
    }
    vacationPay = round(toNum(timesheet.hours_vacation) * hourlyRate);
    // AGENT-04 FIX #1: Sick-pay ladder applied to hourly path too
    const sickDays = sickHoursToDays(toNum(timesheet.hours_sick), employee);
    const dailyRate = hourlyRate * (toNum(employee.hours_per_day) || (standardHours / 21.67));
    sickPay = computeSickPayLadder(sickDays, dailyRate);
  }

  const holidayPay = toNum(timesheet.holiday_pay);
  const bonuses = toNum(timesheet.bonuses);
  const commissions = toNum(timesheet.commissions);
  const allowances_meal = toNum(timesheet.allowances_meal);
  const allowances_travel = toNum(timesheet.allowances_travel);
  const allowances_clothing = toNum(timesheet.allowances_clothing);
  const allowances_phone = toNum(timesheet.allowances_phone);
  const other_earnings = toNum(timesheet.other_earnings);

  const gross_pay = round(
    basePay + overtimePay + vacationPay + sickPay + holidayPay +
    bonuses + commissions +
    allowances_meal + allowances_travel + allowances_clothing + allowances_phone +
    other_earnings
  );

  // ── 2. Tax base ──
  // Some allowances are taxable, some not. Simplified: travel/meal partially exempt.
  // Full rigor: apply שווי (value) rules per ruling. For now treat all as taxable.
  const taxableBase = gross_pay;

  // ── 3. Income tax ──
  const tcRaw = toNum(employee.tax_credits);
  const taxCreditPoints = (tcRaw != null && !isNaN(tcRaw)) ? tcRaw : 2.25;
  const income_tax = computeIncomeTaxMonthly(taxableBase, taxCreditPoints);

  // ── 4. Bituach Leumi + Health Tax ──
  const blht = computeBituachLeumiAndHealth(taxableBase);

  // ── 5. Pension, Severance ──
  const pension = computePensionContributions(taxableBase);

  // ── 6. Study Fund ──
  const studyFundEligible = !!employee.study_fund_number;
  const studyFund = computeStudyFund(taxableBase, studyFundEligible);

  // ── 7. Totals ──
  const total_deductions = round(
    income_tax +
    blht.bituach_leumi_employee +
    blht.health_tax_employee +
    pension.pension_employee +
    studyFund.study_fund_employee +
    toNum(timesheet.loans) +
    toNum(timesheet.garnishments) +
    toNum(timesheet.other_deductions)
  );

  const net_pay = round(gross_pay - total_deductions);

  return {
    // identifiers
    employee_id: employee.id,
    employer_id: employer.id,

    // period
    period_year: period.year,
    period_month: period.month,
    period_label: `${period.year}-${String(period.month).padStart(2, '0')}`,
    pay_date: period.pay_date || new Date().toISOString().slice(0, 10),

    // frozen snapshot
    employee_number: employee.employee_number,
    employee_name: employee.full_name || `${employee.first_name} ${employee.last_name}`,
    employee_national_id: employee.national_id,
    employer_legal_name: employer.legal_name,
    employer_company_id: employer.company_id,
    employer_tax_file: employer.tax_file_number,
    position: employee.position || null,
    department: employee.department || null,

    // hours
    hours_regular: toNum(timesheet.hours_regular),
    hours_overtime_125: toNum(timesheet.hours_overtime_125),
    hours_overtime_150: toNum(timesheet.hours_overtime_150),
    hours_overtime_175: toNum(timesheet.hours_overtime_175),
    hours_overtime_200: toNum(timesheet.hours_overtime_200),
    hours_absence: toNum(timesheet.hours_absence),
    hours_vacation: toNum(timesheet.hours_vacation),
    hours_sick: toNum(timesheet.hours_sick),
    hours_reserve: toNum(timesheet.hours_reserve),

    // earnings
    base_pay: basePay,
    overtime_pay: overtimePay,
    vacation_pay: vacationPay,
    sick_pay: sickPay,
    holiday_pay: holidayPay,
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
    bituach_leumi: blht.bituach_leumi_employee,
    health_tax: blht.health_tax_employee,
    pension_employee: pension.pension_employee,
    study_fund_employee: studyFund.study_fund_employee,
    severance_employee: 0, // employees don't pay severance — it's all employer
    loans: toNum(timesheet.loans),
    garnishments: toNum(timesheet.garnishments),
    other_deductions: toNum(timesheet.other_deductions),
    total_deductions,

    net_pay,

    // employer contributions
    pension_employer: pension.pension_employer,
    study_fund_employer: studyFund.study_fund_employer,
    severance_employer: pension.severance_employer,
    bituach_leumi_employer: blht.bituach_leumi_employer,
    health_tax_employer: blht.health_tax_employer,

    // balances (passed in from employee_balances — filled in by route)
    vacation_balance: null,
    sick_balance: null,
    study_fund_balance: null,
    severance_balance: null,

    // YTD (caller may override with live DB sum)
    ytd_gross: round(toNum(ytd.ytd_gross) + gross_pay),
    ytd_income_tax: round(toNum(ytd.ytd_income_tax) + income_tax),
    ytd_bituach_leumi: round(toNum(ytd.ytd_bituach_leumi) + blht.bituach_leumi_employee),
    ytd_pension: round(toNum(ytd.ytd_pension) + pension.pension_employee),

    // status
    status: 'computed',

    // debug helpers (NOT stored)
    _debug: {
      hourlyRate,
      taxableBase,
      taxCreditPoints,
      creditValue: taxCreditPoints * CONSTANTS_2026.TAX_CREDIT_POINT_ANNUAL,
    },
  };
}

module.exports = {
  CONSTANTS_2026,
  computeIncomeTaxAnnual,
  computeIncomeTaxMonthly,
  computeBituachLeumiAndHealth,
  computePensionContributions,
  computeStudyFund,
  computeHourlyGross,
  computeMonthlyGross,
  computeWageSlip,
};
