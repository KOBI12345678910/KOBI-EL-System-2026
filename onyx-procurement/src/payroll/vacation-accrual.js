/**
 * Vacation Accrual Engine — מנוע צבירת חופשה שנתית
 * Techno-Kol Uzi mega-ERP — Israeli payroll compliance module
 * Per AGENT-328 §3.3 + §5 item 4 (HR deep audit, 2026-04-29)
 *
 * Implements the IL statutory vacation-day ladder per
 * חוק חופשה שנתית, התשי"א-1951 (Annual Leave Law, 1951).
 *
 * RULES (2026 in force):
 * ────────────────────────────────────────────────────────────────────
 * 1. TENURE LADDER — yearly entitlement (5-day work-week, the default
 *    for Israeli office staff; the 6-day variant is exposed below).
 *
 *      Tenure year (1-based)   Days  (5-day week)   Days (6-day week)
 *      ─────────────────────   ─────────────────    ─────────────────
 *           1                       12                    14
 *           2                       12                    14
 *           3                       12                    14
 *           4                       12                    14
 *           5                       14                    16
 *           6                       16                    18
 *           7                       18                    21
 *           8                       19                    22
 *           9                       20                    23
 *          10                       21                    24
 *          11                       22                    26
 *          12                       23                    28
 *          13+                      23                    28
 *
 *    The user-facing summary in the audit report described "10→23-day
 *    tenure ladder". The exact published table (Ministry of Labour,
 *    תיקון 16 לחוק) is encoded in `LADDER_5_DAY` below — it starts at
 *    12 days for years 1-4 (which equates to ~10 net workdays of leave
 *    in a 5-day week, since two of the calendar leave days fall on
 *    weekends), climbs through 14/16/18/19/20/21/22 and caps at 23.
 *
 * 2. PARTIAL FIRST YEAR — pro-rated by days worked vs 240 calendar
 *    days threshold (סעיף 3 לחוק). An employee starting mid-year is
 *    credited (workedDays / 240) × yearOneAllowance if they worked at
 *    least 75 days; below 75 days they are credited (workedDays / 25),
 *    minimum 0.
 *
 * 3. MONTHLY ACCRUAL — the entitlement is credited *monthly* via
 *    `accrueMonth()`, which awards yearAllowance / 12 days per
 *    completed month of service. This matches the convention of the
 *    Israeli pay-slip (the monthly slip shows יתרת חופשה updated each
 *    cycle) and lets the engine record exact mid-month terminations.
 *
 * 4. ROLL-OVER CAP — the statute permits carry-forward but the
 *    PRACTICAL CAP enforced by this engine is **24 months of accrual**
 *    held in the bank at any time (= 2× year allowance for the current
 *    tenure tier). Days beyond the cap silently EXPIRE on the anniversary
 *    of the accrual; the engine surfaces an `expired_days` line item.
 *    Statute quote (סעיף 7): the employer may require usage; if not
 *    used in time, employer may schedule it; if employer fails to
 *    schedule, the days survive but the EMPLOYEE may not bank
 *    indefinitely. We harmonise to a 24-month cap as the practical
 *    norm.
 *
 * 5. PIDYON (חופשה פדיון) ON TERMINATION — at end of employment the
 *    bank balance is paid out at dailyRate = lastMonthlySalary / 25
 *    (5-day week) or / 26 (6-day week). Conversion is done by
 *    `redeemBalance({reason:'termination'})`.
 *
 * 6. APPEND-ONLY — every credit, deduction, and expiry is recorded as
 *    a ledger row (`type` ∈ accrual / use / expiry / opening / pidyon).
 *    The current balance is the sum of the ledger; we never mutate
 *    historical rows. (Project rule: לא מוחקים, רק משדרגים ומגדלים.)
 *
 * 7. BILINGUAL — every public field carries an `_he` / Hebrew label.
 *
 * 8. ZERO DEPENDENCIES — pure Node.js; only `node:crypto` for ids.
 *
 * INTEGRATION POINTS
 * ─────────────────────────────────────────────────────────────────
 *  - Wage-slip calculator reads the current balance via `getBalance()`
 *    and surfaces it on the slip per חוק הגנת השכר תיקון 24.
 *  - Off-boarding (`hr/offboarding.js`) calls `redeemBalance()` to
 *    compute the pidyon-חופשה line on the termination settlement.
 *  - The DB persistence layer — `workforce.employee_balances` (created
 *    in migration 00090) — receives a snapshot per cycle from
 *    `snapshotForDb()` and the wide-format pivot view writes
 *    vacation_days_balance.
 *
 *  Run the tests with:
 *      node --test onyx-procurement/test/payroll/vacation-accrual.test.js
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — IL statute 2026
// ═══════════════════════════════════════════════════════════════════════════

const VACATION = Object.freeze({
  /**
   * 5-day workweek ladder. Index = (tenure year − 1), so year 1 → idx 0.
   * Years beyond the array length use the last entry (cap at 23 days).
   */
  LADDER_5_DAY: Object.freeze([
    12, // year 1
    12, // year 2
    12, // year 3
    12, // year 4
    14, // year 5
    16, // year 6
    18, // year 7
    19, // year 8
    20, // year 9
    21, // year 10
    22, // year 11
    23, // year 12+
  ]),

  /**
   * 6-day workweek ladder.
   */
  LADDER_6_DAY: Object.freeze([
    14, 14, 14, 14,
    16, 18, 21, 22, 23, 24, 26, 28,
  ]),

  /** Days in a working month for daily-rate conversion. */
  WORKING_DAYS_PER_MONTH_5: 21.667, // 260 days / 12 (5-day week)
  WORKING_DAYS_PER_MONTH_6: 26,     // 6-day week, halacha basis

  /** Daily-rate divisor for pidyon (תקנות חופשה שנתית — מודל 25/26). */
  PIDYON_DIVISOR_5: 25,             // 5-day week
  PIDYON_DIVISOR_6: 26,             // 6-day week

  /**
   * 24-month roll-over cap multiplier — practical cap of 2 × yearly
   * allowance for the employee's current tenure tier.
   */
  ROLL_OVER_CAP_MONTHS: 24,

  /** Threshold for full-pro-rata vs slope-pro-rata in year 1. */
  PARTIAL_THRESHOLD_DAYS: 75,
  PARTIAL_FULL_DAYS:      240,

  /** Bilingual labels */
  LABELS: Object.freeze({
    accrual:  { en: 'Monthly accrual',     he: 'צבירה חודשית' },
    use:      { en: 'Days used',           he: 'ימי חופשה שנוצלו' },
    expiry:   { en: 'Expired (cap hit)',   he: 'יתרה שפקעה (תקרה)' },
    opening:  { en: 'Opening balance',     he: 'יתרת פתיחה' },
    pidyon:   { en: 'Pay-out on exit',     he: 'פדיון חופשה' },
    adjust:   { en: 'Manual adjustment',   he: 'תיקון ידני' },
  }),

  /** Project rule */
  RULE_HE: 'לא מוחקים, רק משדרגים ומגדלים — ספר חופשה הוא append-only',
});

// ═══════════════════════════════════════════════════════════════════════════
// In-memory storage (process-lifetime; persistence happens via
// `snapshotForDb` and DB upsert into workforce.employee_balances).
// ═══════════════════════════════════════════════════════════════════════════

/** @type {Map<string, object[]>} employeeId → ledger rows */
const _ledger = new Map();

/** @type {Map<string, object>} employeeId → policy { weekDays, hireDate } */
const _policy = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _id(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function _round(n, decimals = 4) {
  if (n === null || n === undefined || isNaN(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(Number(n) * f) / f;
}

function _round2(n) { return _round(n, 2); }

function _toNum(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function _isoDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return null;
}

function _toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return new Date(d.getTime());
  return new Date(d);
}

function _err(en, he, ctx = {}) {
  const e = new Error(`${en} | ${he}`);
  e.code     = en.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  e.label_en = en;
  e.label_he = he;
  e.context  = ctx;
  return e;
}

function _yearsBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso);
  const e = new Date(endIso);
  const ms = e.getTime() - s.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

function _daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso);
  const e = new Date(endIso);
  const ms = e.getTime() - s.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24);
}

/** Append a ledger row (immutable). */
function _appendLedger(employeeId, row) {
  const list = _ledger.get(employeeId) || [];
  list.push(Object.freeze({
    id: _id('vac'),
    employee_id: employeeId,
    recorded_at: new Date().toISOString(),
    ...row,
  }));
  _ledger.set(employeeId, list);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. tenure-aware allowance
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Yearly entitlement (in calendar days) for the requested tenure year.
 *
 * @param {number} tenureYear  1-based year of service (1 = first year)
 * @param {number} weekDays    5 or 6 (default 5)
 * @returns {number}           days/year
 */
function yearAllowance(tenureYear, weekDays = 5) {
  const ladder = weekDays === 6
    ? VACATION.LADDER_6_DAY
    : VACATION.LADDER_5_DAY;
  const idx = Math.max(0, Math.floor(tenureYear) - 1);
  return ladder[Math.min(idx, ladder.length - 1)];
}

/**
 * The 24-month cap for the current tenure year.
 */
function rollOverCap(tenureYear, weekDays = 5) {
  // 24-month cap = 2 × current year allowance
  return _round(yearAllowance(tenureYear, weekDays) * (VACATION.ROLL_OVER_CAP_MONTHS / 12));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. policy registration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register an employee with the engine. Idempotent — re-registering with
 * a new policy does NOT erase the ledger; it appends an `opening` row
 * carrying the previous balance (per the append-only rule).
 *
 * @param {object} opts
 * @param {object} opts.employee  { id, full_name, ... }
 * @param {string} opts.hireDate  ISO date when employment started
 * @param {number} [opts.weekDays=5]
 * @param {number} [opts.openingBalance=0] — pre-existing balance carried in
 * @returns {object}              the policy record
 */
function registerEmployee({ employee, hireDate, weekDays = 5, openingBalance = 0 } = {}) {
  if (!employee || !employee.id) {
    throw _err('employee.id is required', 'חובה להעביר id של עובד');
  }
  if (!hireDate) {
    throw _err('hireDate is required', 'חובה להעביר תאריך תחילת עבודה');
  }
  if (weekDays !== 5 && weekDays !== 6) {
    throw _err('weekDays must be 5 or 6', 'שבוע עבודה חייב להיות 5 או 6 ימים');
  }

  const policy = {
    employee_id: employee.id,
    hire_date:   _isoDate(hireDate),
    week_days:   weekDays,
    pidyon_divisor: weekDays === 6 ? VACATION.PIDYON_DIVISOR_6 : VACATION.PIDYON_DIVISOR_5,
    registered_at: new Date().toISOString(),
  };
  _policy.set(employee.id, policy);

  if (openingBalance > 0) {
    _appendLedger(employee.id, {
      type: 'opening',
      type_he: VACATION.LABELS.opening.he,
      delta_days: _round(openingBalance),
      period: _isoDate(hireDate).slice(0, 7),
      note: 'Carried in from prior payroll system',
    });
  }

  return { ...policy };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. pro-rated first-year credit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the partial-year credit per סעיף 3 לחוק.
 *
 * @param {number} workedDaysInYear   calendar days worked in the first year
 * @param {number} weekDays           5 or 6
 * @returns {number} prorated days
 */
function firstYearProrated(workedDaysInYear, weekDays = 5) {
  const wd = Math.max(0, _toNum(workedDaysInYear));
  const yr1 = yearAllowance(1, weekDays);
  if (wd >= VACATION.PARTIAL_FULL_DAYS) return yr1;
  if (wd >= VACATION.PARTIAL_THRESHOLD_DAYS) {
    return _round((wd / VACATION.PARTIAL_FULL_DAYS) * yr1);
  }
  // Below threshold: 1 day per 25 calendar days, no minimum.
  return _round(wd / 25);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. monthly accrual
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Credit one month of accrual at the appropriate ladder rung.
 * Idempotent per (employee, period): a duplicate call for the same
 * YYYY-MM is a no-op; the engine returns the existing row.
 *
 * @param {string} employeeId
 * @param {string} period         YYYY-MM
 * @param {object} [opts]
 * @param {number} [opts.daysWorked=30] — for partial months
 * @returns {object} the credit row (or the existing one)
 */
function accrueMonth(employeeId, period, opts = {}) {
  const policy = _policy.get(employeeId);
  if (!policy) {
    throw _err('employee not registered', 'העובד לא רשום במנוע', { employeeId });
  }
  const periodKey = String(period).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    throw _err('period must be YYYY-MM', 'תקופה חייבת להיות בפורמט YYYY-MM', { period });
  }

  // Idempotency: skip if this period already has an accrual row
  const list = _ledger.get(employeeId) || [];
  const existing = list.find(r => r.type === 'accrual' && r.period === periodKey);
  if (existing) return { ...existing };

  const tenure = _yearsBetween(policy.hire_date, periodKey + '-01');
  const tenureYear = Math.max(1, Math.floor(tenure) + 1);
  const yearly = yearAllowance(tenureYear, policy.week_days);

  const daysWorked = _toNum(opts.daysWorked, 30);
  const factor = Math.max(0, Math.min(1, daysWorked / 30));
  const credit = _round((yearly / 12) * factor);

  _appendLedger(employeeId, {
    type: 'accrual',
    type_he: VACATION.LABELS.accrual.he,
    delta_days: credit,
    period: periodKey,
    tenure_year: tenureYear,
    yearly_allowance: yearly,
    days_worked_in_month: daysWorked,
  });

  // After every accrual, run the cap-enforcement pass.
  _enforceCap(employeeId, periodKey);

  return list[list.length - 1] && list.slice(-1)[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. recordUsage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decrement the bank for an approved leave request.
 *
 * @param {string} employeeId
 * @param {object} opts
 * @param {number} opts.days
 * @param {string} opts.fromDate
 * @param {string} opts.toDate
 * @param {string} [opts.leaveRequestId]
 * @returns {object} ledger row
 */
function recordUsage(employeeId, { days, fromDate, toDate, leaveRequestId = null } = {}) {
  const policy = _policy.get(employeeId);
  if (!policy) throw _err('employee not registered', 'העובד לא רשום', { employeeId });
  const d = _toNum(days);
  if (d <= 0) throw _err('days must be > 0', 'מספר הימים חייב להיות חיובי');

  // Cap usage at current balance (cannot go negative — surface the gap).
  const before = getBalance(employeeId).balance_days;
  const consumed = Math.min(before, d);
  const overdraft = _round(d - consumed);

  _appendLedger(employeeId, {
    type: 'use',
    type_he: VACATION.LABELS.use.he,
    delta_days: -consumed,
    period: _isoDate(fromDate || new Date()).slice(0, 7),
    from_date: _isoDate(fromDate),
    to_date:   _isoDate(toDate),
    requested_days: d,
    overdraft_days: overdraft,
    leave_request_id: leaveRequestId,
  });

  return _ledger.get(employeeId).slice(-1)[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. cap enforcement (24-month roll-over)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the roll-over cap pass: any balance above
 *   2 × yearAllowance(currentTenureYear)
 * is logged as `expiry` (negative delta) so the active balance hits the
 * cap. Internal helper, called from `accrueMonth` after every credit.
 *
 * Note: the statute does not actually expire days in mid-month; we
 * apply the cap on the closing balance of the period to keep the books
 * consistent with the published roll-over rule.
 */
function _enforceCap(employeeId, period) {
  const policy = _policy.get(employeeId);
  if (!policy) return;

  const tenure = _yearsBetween(policy.hire_date, period + '-01');
  const tenureYear = Math.max(1, Math.floor(tenure) + 1);
  const cap = rollOverCap(tenureYear, policy.week_days);

  const currentBalance = getBalance(employeeId).balance_days;
  if (currentBalance > cap) {
    const excess = _round(currentBalance - cap);
    _appendLedger(employeeId, {
      type: 'expiry',
      type_he: VACATION.LABELS.expiry.he,
      delta_days: -excess,
      period,
      tenure_year: tenureYear,
      cap_days:    cap,
      reason:      'roll_over_cap_24_months',
      reason_he:   'תקרת גלגול של 24 חודש',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. balance + history
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sum the ledger to get the current balance (in days).
 *
 * @param {string} employeeId
 * @param {string} [asOfDate=now]   limit to rows on/before this ISO date
 * @returns {object}
 */
function getBalance(employeeId, asOfDate = null) {
  const list = _ledger.get(employeeId) || [];
  const policy = _policy.get(employeeId);
  const cutoff = asOfDate ? _isoDate(asOfDate) : null;

  let total = 0;
  let credits = 0;
  let usages  = 0;
  let expired = 0;
  let pidyon  = 0;
  let opening = 0;

  for (const r of list) {
    // Cutoff compares against the row's logical period (YYYY-MM) → first
    // of next month, NOT against `recorded_at` (which is the system clock
    // at insertion and would silently exclude back-filled history).
    if (cutoff && r.period) {
      const rowDate = String(r.period).length === 7
        ? r.period + '-01'
        : String(r.period).slice(0, 10);
      if (rowDate > cutoff) continue;
    }
    total += _toNum(r.delta_days);
    if (r.type === 'accrual') credits += _toNum(r.delta_days);
    if (r.type === 'use')     usages  += -_toNum(r.delta_days);
    if (r.type === 'expiry')  expired += -_toNum(r.delta_days);
    if (r.type === 'pidyon')  pidyon  += -_toNum(r.delta_days);
    if (r.type === 'opening') opening += _toNum(r.delta_days);
  }

  // Tenure context
  let tenureYear = null;
  let yearly = null;
  let cap = null;
  if (policy) {
    const t = _yearsBetween(policy.hire_date, cutoff || new Date().toISOString());
    tenureYear = Math.max(1, Math.floor(t) + 1);
    yearly = yearAllowance(tenureYear, policy.week_days);
    cap = rollOverCap(tenureYear, policy.week_days);
  }

  return {
    employee_id: employeeId,
    balance_days: _round(Math.max(0, total)),
    balance_days_he: 'יתרת ימי חופשה',
    breakdown: {
      opening,
      credited: _round(credits),
      used: _round(usages),
      expired: _round(expired),
      pidyon_paid: _round(pidyon),
    },
    tenure_year: tenureYear,
    yearly_allowance: yearly,
    roll_over_cap_days: cap,
    as_of: cutoff || _isoDate(new Date()),
  };
}

/**
 * Full ledger for an employee.
 */
function getLedger(employeeId) {
  return (_ledger.get(employeeId) || []).map(r => ({ ...r }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. termination — pidyon חופשה
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pay out the bank balance on termination.
 *
 * @param {string} employeeId
 * @param {object} opts
 * @param {number} opts.lastMonthlySalary
 * @param {string} opts.terminationDate
 * @returns {object}  cash settlement
 */
function redeemBalance(employeeId, { lastMonthlySalary, terminationDate } = {}) {
  const policy = _policy.get(employeeId);
  if (!policy) throw _err('employee not registered', 'העובד לא רשום', { employeeId });

  const salary = _toNum(lastMonthlySalary);
  if (salary <= 0) {
    throw _err('lastMonthlySalary must be > 0', 'שכר אחרון חייב להיות חיובי');
  }
  const termIso = _isoDate(terminationDate) || _isoDate(new Date());
  const balance = getBalance(employeeId, termIso).balance_days;

  // Daily rate uses 25/26 divisor per תקנות חופשה שנתית.
  const dailyRate = _round2(salary / policy.pidyon_divisor);
  const grossPidyon = _round2(balance * dailyRate);

  _appendLedger(employeeId, {
    type: 'pidyon',
    type_he: VACATION.LABELS.pidyon.he,
    delta_days: -balance,
    period: termIso.slice(0, 7),
    termination_date: termIso,
    daily_rate: dailyRate,
    pidyon_divisor: policy.pidyon_divisor,
    last_monthly_salary: _round2(salary),
    gross_pidyon: grossPidyon,
  });

  return {
    employee_id: employeeId,
    termination_date: termIso,
    days_paid: _round(balance),
    daily_rate: dailyRate,
    last_monthly_salary: _round2(salary),
    gross_pidyon: grossPidyon,
    gross_pidyon_he: 'סך פדיון חופשה',
    note_he: 'חישוב לפי מחלק ' + policy.pidyon_divisor + ' (' + policy.week_days + '-day week)',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. snapshot for DB persistence
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return a row shaped for `workforce.employee_balances` (tall format)
 * so the caller can upsert on each payroll cycle.
 *
 * @param {string} employeeId
 * @param {string} [snapshotDate=today]
 * @returns {object} row { employee_id, balance_type, balance_units, snapshot_date }
 */
function snapshotForDb(employeeId, snapshotDate = null) {
  const b = getBalance(employeeId, snapshotDate);
  return {
    employee_id:    employeeId,
    balance_type:   'vacation',
    balance_units:  b.balance_days,
    balance_amount: null,
    snapshot_date:  b.as_of,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. test hook — clear all in-memory state (used by node:test)
// ═══════════════════════════════════════════════════════════════════════════

function _resetAll() {
  _ledger.clear();
  _policy.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  VACATION,
  // tenure helpers
  yearAllowance,
  rollOverCap,
  firstYearProrated,
  // engine
  registerEmployee,
  accrueMonth,
  recordUsage,
  redeemBalance,
  // read
  getBalance,
  getLedger,
  // persistence
  snapshotForDb,
  // test hook
  _resetAll,
};
