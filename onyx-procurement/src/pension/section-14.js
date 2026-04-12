/**
 * Section 14 — Pension Arrangement Tracker / הסדר סעיף 14
 * Techno-Kol Uzi mega-ERP — Israeli payroll compliance module
 *
 * Implements the severance arrangement under Section 14 of the
 * חוק פיצויי פיטורים, התשכ"ג-1963 (Severance Pay Law, 1963) combined with
 * the general approval issued by the Minister of Labour on 30.6.1998
 * (the "היתר כללי לתשלומי מעבידים לקרן פנסיה ולקופת ביטוח במקום פיצויי פיטורים").
 *
 * RULES (simplified for engine purposes — actual legal text controls):
 * ────────────────────────────────────────────────────────────────────
 * 1. Employer monthly severance contribution of 8.33% (= 1/12 of monthly
 *    salary) into a pension fund / provident fund / managers' insurance,
 *    RELEASES the employer from the statutory severance obligation at
 *    termination — FOR THE MONTHS COVERED, regardless of reason for
 *    termination (resignation or dismissal).
 *
 * 2. A valid Section 14 arrangement requires ALL of:
 *    (a) A signed written arrangement with the employee, referencing the
 *        general approval (היתר כללי).
 *    (b) The employer contributes at least 6% pension + 8.33% severance
 *        (managers' insurance: 5% + 8.33% + 2.5% disability cap, here we
 *        take the generic pension-fund variant).
 *    (c) The employee contributes at least 6% (or 5.5% in some variants).
 *    (d) No "extraction-back" clause — the employer cannot reclaim the
 *        severance funds except in the narrow cases allowed by law
 *        (e.g. theft / breach / conviction under section 16–17 of the law).
 *    (e) The arrangement applies from a defined start date; months before
 *        that date are NOT released and the 8.33% × finalSalary × months
 *        must be topped up at termination.
 *
 * 3. PARTIAL arrangement: employer may contribute LESS than the full 8.33%
 *    (e.g. 6% into the severance component). The release is then
 *    PROPORTIONAL — the ratio (partialRate / 0.0833) of each month is
 *    released. At termination the employer must top up:
 *        topUp = finalSalary × (1 - partialRate/0.0833)
 *                × yearsCoveredByPartialArrangement
 *    i.e. the difference between the full statutory severance and the
 *    amount already deposited.
 *
 * 4. Even under a full Section 14 arrangement, there is NO release for:
 *      (a) months PRIOR to the arrangement's start date,
 *      (b) salary components that were NOT included in the pension base
 *          (e.g. bonuses, overtime, car usage above the statutory cap),
 *      (c) any period in which contributions were actually skipped.
 *    These still require top-up at termination.
 *
 * 5. Study fund (קרן השתלמות) — 2.5% employee / 7.5% employer — is
 *    OPTIONAL and independent of severance release; it is tracked here
 *    only for the contribution breakdown, never for release calculation.
 *
 * RULE OF THE PROJECT: לא מוחקים רק משדרגים ומגדלים.
 * Mutating or deleting existing arrangements is forbidden: every change is
 * recorded as a supersession (`upgradeArrangement` → new `version`, old
 * version stays in history with `superseded_by`/`superseded_at`). The
 * in-memory history maps are append-only.
 *
 * BILINGUAL: every structured field that is shown to a human carries an
 * `_he` (Hebrew) counterpart or the Hebrew term as a key. The formal letter
 * generator emits RTL Hebrew.
 *
 * ZERO DEPENDENCIES: pure Node.js; only `node:crypto` is used for id gen,
 * which is part of the standard library.
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS — statutory minimums (Israeli law, 2026)
// ═══════════════════════════════════════════════════════════════════════

const SECTION_14 = Object.freeze({
  /** Statutory severance rate = 1 month of salary per year of service = 1/12 */
  STATUTORY_SEVERANCE_RATE: 1 / 12, // 0.08333…

  /** Rounded value commonly used on pay slips (8.33%) */
  SEVERANCE_RATE_ROUNDED: 0.0833,

  /** Minimum employer pension contribution under mandatory pension law */
  MIN_EMPLOYER_PENSION: 0.065, // 6.5% (2026 rate, up from 6% under old rule)

  /** Legal floor: 6% is still accepted for pre-existing Section 14 letters */
  MIN_EMPLOYER_PENSION_LEGACY: 0.06,

  /** Minimum employee contribution */
  MIN_EMPLOYEE_PENSION: 0.06, // 6%

  /** Study fund rates (optional) */
  STUDY_FUND_EMPLOYEE: 0.025, // 2.5%
  STUDY_FUND_EMPLOYER: 0.075, // 7.5%

  /** Legal reference strings */
  LAW_REF_HE: "סעיף 14 לחוק פיצויי פיטורים, התשכ\"ג-1963",
  LAW_REF_EN: 'Section 14 of the Severance Pay Law, 1963',
  GENERAL_APPROVAL_HE: 'היתר כללי לתשלומי מעבידים לקרן פנסיה ולקופת ביטוח במקום פיצויי פיטורים (30.6.1998)',
  GENERAL_APPROVAL_EN: "General Approval for Employer Payments to Pension Fund and Insurance Fund in lieu of Severance (30.6.1998)",

  /** Valid termination reasons that still release the employer */
  RELEASING_REASONS: Object.freeze([
    'resignation',       // התפטרות
    'dismissal',         // פיטורים
    'mutual',            // פרידה בהסכמה
    'retirement',        // פרישה
    'end_of_contract',   // סיום חוזה
    'death',             // פטירה
  ]),

  /** Reasons that FORFEIT Section 14 release per law (section 16-17) */
  FORFEITING_REASONS: Object.freeze([
    'theft_or_fraud',    // גניבה/מרמה — forfeiture under section 16
    'serious_breach',    // הפרה חמורה — forfeiture under section 17
  ]),
});

// ═══════════════════════════════════════════════════════════════════════
// IN-MEMORY STORAGE (append-only)
// ═══════════════════════════════════════════════════════════════════════

/** @type {Map<string, object>} arrangementId → arrangement */
const _arrangements = new Map();

/** @type {Map<string, object[]>} arrangementId → [monthly contribution rows] */
const _contributionHistory = new Map();

/** @type {Map<string, string[]>} employeeId → [arrangementId, …] (in order) */
const _byEmployee = new Map();

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function _id(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function _round(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(Number(n) * f) / f;
}

function _toNum(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function _isoDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return null;
}

function _nowIso() {
  return new Date().toISOString();
}

/**
 * Compute years (fractional) between two ISO dates.
 * Used for the proportional top-up formula.
 */
function _yearsBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * Throw a bilingual error object.
 */
function _err(codeEn, codeHe, context = {}) {
  const e = new Error(`${codeEn} | ${codeHe}`);
  e.code = codeEn.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  e.label_en = codeEn;
  e.label_he = codeHe;
  e.context = context;
  return e;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. createArrangement
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record a Section 14 arrangement for an employee.
 *
 * @param {object}  opts
 * @param {object}  opts.employee     — {id, full_name, national_id, ...}
 * @param {string}  opts.startDate    — ISO date when the arrangement takes effect
 * @param {object}  opts.percentages  — employer/employee contribution %
 * @param {number}  opts.percentages.employerPension       — e.g. 0.065 (6.5%)
 * @param {number}  opts.percentages.severance             — e.g. 0.0833 (full) or 0.06 (partial)
 * @param {number}  opts.percentages.employeeContribution  — e.g. 0.06 (6%)
 * @param {number} [opts.percentages.studyFund]            — employer side if present
 * @param {boolean}[opts.signed=true]      — has the employee signed?
 * @param {string} [opts.signedDate]       — ISO date of signature
 * @param {string} [opts.fundName]         — pension fund / insurer name
 * @param {string} [opts.fundPolicyNumber] — reference in the fund
 * @param {string} [opts.createdBy]        — HR officer id
 * @returns {object} arrangement — full structured record
 */
function createArrangement({
  employee,
  startDate,
  percentages,
  signed = true,
  signedDate = null,
  fundName = null,
  fundPolicyNumber = null,
  createdBy = null,
} = {}) {
  // ── validation ────────────────────────────────────────────────
  if (!employee || !employee.id) {
    throw _err('employee is required', 'חובה להעביר אובייקט עובד עם id');
  }
  if (!startDate) {
    throw _err('startDate is required', 'חובה להעביר תאריך תחילת ההסדר');
  }
  if (!percentages || typeof percentages !== 'object') {
    throw _err('percentages is required', 'חובה להעביר אחוזי הפרשה');
  }

  const employerPension = _toNum(percentages.employerPension);
  const severance = _toNum(percentages.severance);
  const employeeContribution = _toNum(percentages.employeeContribution);
  const studyFundEmployer = _toNum(percentages.studyFund);
  const studyFundEmployee = percentages.studyFundEmployee !== undefined
    ? _toNum(percentages.studyFundEmployee)
    : (studyFundEmployer > 0 ? SECTION_14.STUDY_FUND_EMPLOYEE : 0);

  if (severance <= 0) {
    throw _err('severance rate must be > 0', 'שיעור הפרשת פיצויים חייב להיות גדול מאפס');
  }
  if (severance > SECTION_14.STATUTORY_SEVERANCE_RATE + 1e-9) {
    throw _err(
      `severance rate ${severance} exceeds statutory 8.33%`,
      'שיעור הפרשת פיצויים חורג מ-8.33% הסטטוטורי'
    );
  }
  if (employerPension < SECTION_14.MIN_EMPLOYER_PENSION_LEGACY - 1e-9) {
    throw _err(
      `employer pension ${employerPension} below legal minimum 6%`,
      'הפרשת מעביד לפנסיה נמוכה מהמינימום החוקי של 6%'
    );
  }
  if (employeeContribution < SECTION_14.MIN_EMPLOYEE_PENSION - 1e-9) {
    throw _err(
      `employee contribution ${employeeContribution} below legal minimum 6%`,
      'הפרשת עובד לפנסיה נמוכה מהמינימום החוקי של 6%'
    );
  }

  // ── classification ───────────────────────────────────────────
  const fullySeveranceRate = Math.abs(severance - SECTION_14.STATUTORY_SEVERANCE_RATE) < 1e-4
    || Math.abs(severance - SECTION_14.SEVERANCE_RATE_ROUNDED) < 1e-4;

  const coverageRatio = _round(severance / SECTION_14.STATUTORY_SEVERANCE_RATE, 6);
  const arrangementType = fullySeveranceRate ? 'full' : 'partial';

  // ── structured record ────────────────────────────────────────
  const id = _id('s14');
  const arrangement = {
    id,
    kind: 'section_14_arrangement',
    version: 1,
    superseded_by: null,
    superseded_at: null,

    employee_id: employee.id,
    employee_snapshot: {
      id: employee.id,
      full_name: employee.full_name || employee.name || null,
      national_id: employee.national_id || null,
      position: employee.position || null,
      department: employee.department || null,
    },

    start_date: _isoDate(startDate),
    signed: !!signed,
    signed_date: _isoDate(signedDate),

    arrangement_type: arrangementType,           // 'full' | 'partial'
    arrangement_type_he: arrangementType === 'full' ? 'הסדר מלא' : 'הסדר חלקי',

    /** Ratio of the statutory severance that is released each month */
    coverage_ratio: coverageRatio,

    percentages: {
      employer_pension: _round(employerPension, 6),
      severance:        _round(severance, 6),
      employee_contribution: _round(employeeContribution, 6),
      study_fund_employer:   _round(studyFundEmployer, 6),
      study_fund_employee:   _round(studyFundEmployee, 6),
    },

    labels_he: {
      employer_pension: 'הפרשת מעביד לפנסיה',
      severance:        'הפרשה לפיצויים',
      employee_contribution: 'הפרשת עובד',
      study_fund: 'קרן השתלמות',
    },

    fund_name: fundName,
    fund_policy_number: fundPolicyNumber,

    law_reference: {
      en: SECTION_14.LAW_REF_EN,
      he: SECTION_14.LAW_REF_HE,
      general_approval_en: SECTION_14.GENERAL_APPROVAL_EN,
      general_approval_he: SECTION_14.GENERAL_APPROVAL_HE,
    },

    created_at: _nowIso(),
    created_by: createdBy,
    status: signed ? 'active' : 'pending_signature',
  };

  // ── validation of prerequisites for release ──────────────────
  arrangement.release_prerequisites = {
    signed_agreement:        arrangement.signed,
    employer_pension_ok:     arrangement.percentages.employer_pension >= SECTION_14.MIN_EMPLOYER_PENSION_LEGACY,
    severance_rate_positive: arrangement.percentages.severance > 0,
    employee_contrib_ok:     arrangement.percentages.employee_contribution >= SECTION_14.MIN_EMPLOYEE_PENSION,
  };

  // ── persist ──────────────────────────────────────────────────
  _arrangements.set(id, arrangement);
  _contributionHistory.set(id, []);
  const list = _byEmployee.get(employee.id) || [];
  list.push(id);
  _byEmployee.set(employee.id, list);

  return _deepClone(arrangement);
}

// ═══════════════════════════════════════════════════════════════════════
// 2. calculateMonthlyContribution
// ═══════════════════════════════════════════════════════════════════════

/**
 * Given a pensionable salary and an arrangement, return the monthly
 * contribution breakdown. Does NOT mutate or record anything — use
 * `recordMonthlyContribution` to persist.
 *
 * @param {number} salary       — pensionable monthly salary in NIS
 * @param {object} arrangement  — as returned by createArrangement
 * @returns {object} breakdown
 */
function calculateMonthlyContribution(salary, arrangement) {
  if (!arrangement || !arrangement.percentages) {
    throw _err('arrangement is required', 'חובה להעביר הסדר');
  }
  const s = _toNum(salary);
  if (s < 0) {
    throw _err('salary must be >= 0', 'שכר חייב להיות אי-שלילי');
  }

  const p = arrangement.percentages;

  const employerPension      = _round(s * p.employer_pension);
  const severance            = _round(s * p.severance);
  const employeeContribution = _round(s * p.employee_contribution);
  const studyFundEmployer    = _round(s * (p.study_fund_employer || 0));
  const studyFundEmployee    = _round(s * (p.study_fund_employee || 0));

  const totalEmployer = _round(employerPension + severance + studyFundEmployer);
  const totalEmployee = _round(employeeContribution + studyFundEmployee);
  const totalAll      = _round(totalEmployer + totalEmployee);

  return {
    salary_base: _round(s),
    arrangement_id: arrangement.id || null,
    arrangement_type: arrangement.arrangement_type,
    coverage_ratio: arrangement.coverage_ratio,

    employer: {
      pension:    employerPension,
      severance:  severance,
      study_fund: studyFundEmployer,
      total:      totalEmployer,
      labels_he: {
        pension:    'פנסיה (מעביד)',
        severance:  'פיצויים (מעביד)',
        study_fund: 'קרן השתלמות (מעביד)',
        total:      'סה"כ מעביד',
      },
    },
    employee: {
      pension:    employeeContribution,
      study_fund: studyFundEmployee,
      total:      totalEmployee,
      labels_he: {
        pension:    'פנסיה (עובד)',
        study_fund: 'קרן השתלמות (עובד)',
        total:      'סה"כ עובד',
      },
    },
    total_contribution: totalAll,
    total_contribution_he: 'סה"כ הפרשות חודשיות',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 3. recordMonthlyContribution  (helper for history tracking)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Persist one month's contribution row into the append-only history.
 *
 * @param {string} arrangementId
 * @param {object} row
 * @param {string} row.period    — ISO 'YYYY-MM' or 'YYYY-MM-DD' (first of month)
 * @param {number} row.salary    — pensionable salary that month
 * @param {boolean}[row.actuallyDeposited=true] — set false to flag a missed month
 * @returns {object} the stored row (with computed breakdown)
 */
function recordMonthlyContribution(arrangementId, row) {
  const arrangement = _arrangements.get(arrangementId);
  if (!arrangement) {
    throw _err('arrangement not found', 'הסדר לא נמצא', { arrangementId });
  }
  if (!row || !row.period) {
    throw _err('period is required', 'חובה להעביר תקופה');
  }
  const breakdown = calculateMonthlyContribution(row.salary, arrangement);

  const period = String(row.period).slice(0, 7); // normalise to YYYY-MM
  const stored = {
    period,
    period_iso: period + '-01',
    salary:           breakdown.salary_base,
    employer_pension: breakdown.employer.pension,
    severance:        breakdown.employer.severance,
    employee_contribution: breakdown.employee.pension,
    study_fund_employer: breakdown.employer.study_fund,
    study_fund_employee: breakdown.employee.study_fund,
    total_employer:   breakdown.employer.total,
    total_employee:   breakdown.employee.total,
    total:            breakdown.total_contribution,
    actually_deposited: row.actuallyDeposited !== false,
    recorded_at: _nowIso(),
  };

  const list = _contributionHistory.get(arrangementId);
  list.push(stored);
  return { ..._deepClone(stored) };
}

// ═══════════════════════════════════════════════════════════════════════
// 4. calculateSeveranceOnTermination
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute the statutory severance, the amount already released under
 * Section 14, and any top-up still owed at termination.
 *
 * @param {object} opts
 * @param {object} opts.employee
 * @param {object} opts.arrangement
 * @param {number} opts.finalSalary    — last monthly pensionable salary
 * @param {number} opts.yearsEmployed  — total years at company (may predate arrangement)
 * @param {string} opts.reason         — one of RELEASING_REASONS or FORFEITING_REASONS
 * @param {string} [opts.terminationDate=today]
 * @param {number} [opts.monthsNotCoveredByPartial=0] — extra non-covered months to top up
 * @returns {object} full termination settlement
 */
function calculateSeveranceOnTermination({
  employee,
  arrangement,
  finalSalary,
  yearsEmployed,
  reason,
  terminationDate = null,
  monthsNotCoveredByPartial = 0,
} = {}) {
  if (!arrangement || !arrangement.percentages) {
    throw _err('arrangement is required', 'חובה להעביר הסדר');
  }
  if (finalSalary === undefined || finalSalary === null) {
    throw _err('finalSalary is required', 'חובה להעביר שכר אחרון');
  }
  if (yearsEmployed === undefined || yearsEmployed === null) {
    throw _err('yearsEmployed is required', 'חובה להעביר ותק בשנים');
  }
  if (!reason) {
    throw _err('reason is required', 'חובה להעביר סיבת סיום');
  }

  const fs = _toNum(finalSalary);
  const years = _toNum(yearsEmployed);
  const termIso = _isoDate(terminationDate) || _isoDate(new Date());

  // ── statutory severance = 1 month × years ───────────────────
  const statutorySeverance = _round(fs * years); // 1 month of salary × years

  // ── check reason ─────────────────────────────────────────────
  const forfeited = SECTION_14.FORFEITING_REASONS.includes(reason);
  if (forfeited) {
    return {
      arrangement_id: arrangement.id,
      employee_id: (employee && employee.id) || arrangement.employee_id,
      termination_date: termIso,
      reason,
      reason_he: 'שלילת פיצויים לפי סעיפים 16–17 לחוק',
      statutory_severance: statutorySeverance,
      already_deposited: 0,
      top_up_owed: 0,
      forfeited: true,
      note_en: 'Severance forfeited per sections 16–17 of the law; no top-up owed.',
      note_he: 'פיצויי פיטורים נשללים על-פי סעיפים 16–17 לחוק; לא חל חיוב על המעביד להשלים.',
    };
  }

  if (!SECTION_14.RELEASING_REASONS.includes(reason)) {
    throw _err(
      `unknown termination reason '${reason}'`,
      `סיבת סיום לא ידועה '${reason}'`,
      { reason }
    );
  }

  // ── years covered by the arrangement (from start_date to term) ─
  const yearsCoveredByArrangement = Math.min(
    years,
    _yearsBetween(arrangement.start_date, termIso)
  );
  const yearsBeforeArrangement = Math.max(0, years - yearsCoveredByArrangement);

  const monthlyRate = arrangement.percentages.severance;
  const isFull = Math.abs(monthlyRate - SECTION_14.STATUTORY_SEVERANCE_RATE) < 1e-4
              || Math.abs(monthlyRate - SECTION_14.SEVERANCE_RATE_ROUNDED) < 1e-4;

  // Amount already deposited during covered months (approximation at
  // FINAL salary, as per the הלכת כלל של שכר אחרון — final salary rule).
  // Actual deposit history may differ; we use finalSalary × 12 × rate × years
  // because the LAW requires topping up to *finalSalary*-based severance.
  // When the arrangement is classified as FULL, use the exact 1/12 so the
  // rounded 0.0833 on the slip doesn't leak a phantom top-up — the letter
  // memorialises "full release" and the maths must reflect it.
  const effectiveRate = isFull ? SECTION_14.STATUTORY_SEVERANCE_RATE : monthlyRate;
  const alreadyDeposited = _round(
    fs * 12 * effectiveRate * yearsCoveredByArrangement
  );

  // Full severance value for the months covered, at the final salary:
  const dueForCoveredPeriod = _round(fs * yearsCoveredByArrangement);

  // Top-up for the partial rate on covered months:
  const topUpForPartial = _round(
    Math.max(0, dueForCoveredPeriod - alreadyDeposited)
  );

  // Top-up for uncovered pre-arrangement months (full severance, no release):
  const topUpForPreArrangement = _round(fs * yearsBeforeArrangement);

  // Extra manually-supplied uncovered months (e.g. bonuses not pensioned):
  const topUpForExtras = _round(
    (fs / 12) * _toNum(monthsNotCoveredByPartial)
  );

  const totalTopUp = _round(
    topUpForPartial + topUpForPreArrangement + topUpForExtras
  );

  const fullyReleased = isFull
    && topUpForPreArrangement === 0
    && topUpForExtras === 0
    && arrangement.signed === true;

  return {
    arrangement_id: arrangement.id,
    employee_id: (employee && employee.id) || arrangement.employee_id,
    termination_date: termIso,
    reason,
    reason_he: _reasonHe(reason),

    years_employed:            _round(years, 4),
    years_covered:             _round(yearsCoveredByArrangement, 4),
    years_before_arrangement:  _round(yearsBeforeArrangement, 4),

    final_salary: _round(fs),

    statutory_severance: statutorySeverance,
    statutory_severance_he: 'סך פיצויי פיטורים על-פי חוק',

    already_deposited_under_section_14: alreadyDeposited,
    already_deposited_he: 'הופקד בפועל לפי סעיף 14',

    breakdown: {
      top_up_for_partial_rate:      topUpForPartial,
      top_up_for_pre_arrangement:   topUpForPreArrangement,
      top_up_for_extras:            topUpForExtras,
      labels_he: {
        top_up_for_partial_rate:    'השלמה בגין שיעור חלקי',
        top_up_for_pre_arrangement: 'השלמה בגין תקופה טרם ההסדר',
        top_up_for_extras:          'השלמה בגין רכיבים שלא בוטחו',
      },
    },

    top_up_owed: totalTopUp,
    top_up_owed_he: 'סך השלמת פיצויים שחלה על המעביד',

    fully_released: fullyReleased,
    fully_released_he: fullyReleased
      ? 'המעביד משוחרר מחובת תשלום פיצויים נוספים'
      : 'המעביד חייב בהשלמת פיצויים',
  };
}

function _reasonHe(reason) {
  switch (reason) {
    case 'resignation':     return 'התפטרות';
    case 'dismissal':       return 'פיטורים';
    case 'mutual':          return 'פרידה בהסכמה';
    case 'retirement':      return 'פרישה';
    case 'end_of_contract': return 'סיום חוזה';
    case 'death':           return 'פטירה';
    case 'theft_or_fraud':  return 'גניבה/מרמה — שלילה';
    case 'serious_breach':  return 'הפרה חמורה — שלילה';
    default:                return reason;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. isFullyReleased
// ═══════════════════════════════════════════════════════════════════════

/**
 * Does this arrangement, by its own terms, fully release the employer
 * from statutory severance going forward (for months covered)?
 *
 * This is a structural check; it does NOT look at actual deposits nor at
 * pre-arrangement service years. Use calculateSeveranceOnTermination for
 * the actual top-up calculation.
 *
 * @param {object} arrangement
 * @returns {boolean}
 */
function isFullyReleased(arrangement) {
  if (!arrangement || !arrangement.percentages) return false;
  if (!arrangement.signed) return false;

  const p = arrangement.percentages;
  const severanceFull =
    Math.abs(p.severance - SECTION_14.STATUTORY_SEVERANCE_RATE) < 1e-4 ||
    Math.abs(p.severance - SECTION_14.SEVERANCE_RATE_ROUNDED) < 1e-4;

  const employerPensionOk = p.employer_pension >= SECTION_14.MIN_EMPLOYER_PENSION_LEGACY - 1e-9;
  const employeeOk        = p.employee_contribution >= SECTION_14.MIN_EMPLOYEE_PENSION - 1e-9;

  return !!(severanceFull && employerPensionOk && employeeOk);
}

// ═══════════════════════════════════════════════════════════════════════
// 6. generateArrangementLetter — formal Hebrew letter
// ═══════════════════════════════════════════════════════════════════════

/**
 * Produce a formal Hebrew letter memorialising the Section 14 arrangement.
 * The letter text is ready to be embedded into a PDF or printed as plain
 * text; it is NOT a legal instrument on its own — legal counsel must
 * review before signature.
 *
 * @param {object} arrangement
 * @returns {{text_he: string, text_en: string, arrangement_id: string, generated_at: string}}
 */
function generateArrangementLetter(arrangement) {
  if (!arrangement) {
    throw _err('arrangement is required', 'חובה להעביר הסדר');
  }
  const emp = arrangement.employee_snapshot || {};
  const p = arrangement.percentages || {};

  const dateHe = arrangement.start_date || '____________';
  const signedDateHe = arrangement.signed_date || '____________';
  const empName = emp.full_name || '____________';
  const empId   = emp.national_id || '____________';
  const fund    = arrangement.fund_name || '____________';
  const policy  = arrangement.fund_policy_number || '____________';

  const typeHe = arrangement.arrangement_type === 'full'
    ? 'הסדר מלא לפי סעיף 14'
    : `הסדר חלקי לפי סעיף 14 (שיעור כיסוי ${_round(arrangement.coverage_ratio * 100, 2)}%)`;

  const text_he = [
    'אל: ' + empName,
    'ת"ז: ' + empId,
    'תאריך: ' + dateHe,
    '',
    'הנדון: הסדר על-פי סעיף 14 לחוק פיצויי פיטורים, התשכ"ג-1963',
    '',
    '1. הרינו להודיעך כי החל מיום ' + dateHe + ' יחול עליך הסדר על-פי סעיף 14 לחוק פיצויי פיטורים, התשכ"ג-1963, בכפוף ל"היתר הכללי לתשלומי מעבידים לקרן פנסיה ולקופת ביטוח במקום פיצויי פיטורים" מיום 30.6.1998 ותיקוניו.',
    '',
    '2. במסגרת הסדר זה, המעביד יפריש מדי חודש את השיעורים הבאים מהשכר הקובע לפנסיה:',
    `   א. הפרשת מעביד לפנסיה (תגמולים): ${_round(p.employer_pension * 100, 3)}%.`,
    `   ב. הפרשת מעביד לפיצויים: ${_round(p.severance * 100, 3)}%.`,
    `   ג. הפרשת עובד: ${_round(p.employee_contribution * 100, 3)}%.`,
    (p.study_fund_employer > 0
      ? `   ד. קרן השתלמות: ${_round(p.study_fund_employee * 100, 3)}% עובד / ${_round(p.study_fund_employer * 100, 3)}% מעביד.`
      : '   ד. קרן השתלמות: אין במסגרת הסדר זה.'),
    '',
    '3. ההפרשות יועברו ל-' + fund + ' (מספר פוליסה/קרן: ' + policy + ').',
    '',
    '4. הצדדים מסכימים כי תשלומי המעביד לרכיב הפיצויים יבואו במקום תשלום פיצויי פיטורים על-פי סעיף 14 לחוק, וזאת ביחס לשכר ולתקופות שבהן יופקדו תשלומים אלו בפועל, והכל בכפוף להוראות הדין והיתר הכללי.',
    '',
    (arrangement.arrangement_type === 'full'
      ? '5. מדובר בהסדר מלא: הפרשת המעביד לרכיב הפיצויים היא בשיעור 8.33% מן השכר הקובע, ועל כן במועד סיום יחסי העבודה — מכל סיבה שהיא למעט המקרים הקבועים בסעיפים 16–17 לחוק — הכספים שהצטברו ברכיב זה ישוחררו לטובת העובד והמעביד יהיה פטור מכל חבות נוספת בגין פיצויי פיטורים עבור התקופה המכוסה.'
      : `5. מדובר ב${typeHe}: הפרשת המעביד לרכיב הפיצויים היא בשיעור ${_round(p.severance * 100, 3)}% בלבד, ולפיכך במועד סיום יחסי העבודה יהיה המעביד חייב בהשלמה יחסית של ההפרש שבין השיעור המופרש לבין 8.33% הסטטוטוריים, מוכפל בשכר האחרון ובשנות העבודה המכוסות בהסדר.`),
    '',
    '6. המעביד מתחייב שלא לבקש החזר של כספי הפיצויים, למעט במקרים המפורטים בסעיפים 16–17 לחוק פיצויי פיטורים.',
    '',
    '7. הסדר זה חל על השכר המבוטח בלבד. רכיבי שכר שאינם מבוטחים (כגון בונוסים, שעות נוספות מעבר לתקרה, ורכב מעל התקרה החוקית) — אינם נכללים בהסדר ודורשים השלמה במועד הסיום.',
    '',
    'המעביד: _______________________      העובד: _______________________',
    'חתימה וחותמת                           חתימה',
    'תאריך חתימה: ' + signedDateHe,
    '',
    '(מסמך זה נערך באופן אוטומטי על-ידי מערכת Techno-Kol Uzi. המסמך אינו מהווה תחליף לייעוץ משפטי.)',
  ].join('\n');

  const text_en = [
    'To: ' + empName,
    'ID: ' + empId,
    'Date: ' + dateHe,
    '',
    'Subject: Arrangement under Section 14 of the Severance Pay Law, 1963',
    '',
    `1. As of ${dateHe} you are covered by an arrangement under Section 14 of the Severance Pay Law, 1963, in accordance with the General Approval of 30.6.1998.`,
    '',
    '2. Monthly contributions from pensionable salary:',
    `   a. Employer pension (tagmulim): ${_round(p.employer_pension * 100, 3)}%`,
    `   b. Employer severance:          ${_round(p.severance * 100, 3)}%`,
    `   c. Employee contribution:       ${_round(p.employee_contribution * 100, 3)}%`,
    (p.study_fund_employer > 0
      ? `   d. Study fund: ${_round(p.study_fund_employee * 100, 3)}% employee / ${_round(p.study_fund_employer * 100, 3)}% employer`
      : '   d. Study fund: not included'),
    '',
    `3. Contributions are deposited in ${fund} (policy/fund number: ${policy}).`,
    '',
    (arrangement.arrangement_type === 'full'
      ? '4. FULL arrangement: the 8.33% employer severance contribution replaces the statutory severance, releasing the employer from any further severance obligation for the months covered (except the forfeiture cases of sections 16–17).'
      : `4. PARTIAL arrangement at ${_round(p.severance * 100, 3)}%: on termination the employer will top up the difference up to the full 8.33% × finalSalary × years covered.`),
    '',
    '5. The employer waives any right to recover severance funds deposited, except as permitted by sections 16–17 of the law.',
    '',
    '6. The arrangement applies only to the insured salary components. Non-pensioned components (bonuses, overtime above the cap, car allowance above the statutory cap) are excluded and require top-up at termination.',
    '',
    'Employer: _______________________      Employee: _______________________',
    'Signature & Stamp                        Signature',
    'Signed on: ' + signedDateHe,
    '',
    '(Auto-generated by Techno-Kol Uzi ERP. Not a substitute for legal advice.)',
  ].join('\n');

  return {
    arrangement_id: arrangement.id,
    text_he,
    text_en,
    generated_at: _nowIso(),
    direction: 'rtl',
    language_primary: 'he',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 7. trackContributionHistory
// ═══════════════════════════════════════════════════════════════════════

/**
 * Return the full month-by-month contribution history for an employee,
 * plus aggregated totals per arrangement and grand totals.
 *
 * @param {string} employeeId
 * @returns {object} {employee_id, arrangements:[…], grand_total}
 */
function trackContributionHistory(employeeId) {
  if (!employeeId) {
    throw _err('employeeId is required', 'חובה להעביר מזהה עובד');
  }
  const arrangementIds = _byEmployee.get(employeeId) || [];

  const arrangementsOut = [];
  const grand = {
    months: 0,
    salary_sum: 0,
    employer_pension: 0,
    severance: 0,
    employee_contribution: 0,
    study_fund_employer: 0,
    study_fund_employee: 0,
    total_employer: 0,
    total_employee: 0,
    total: 0,
  };

  for (const aid of arrangementIds) {
    const arrangement = _arrangements.get(aid);
    const history = _contributionHistory.get(aid) || [];

    const agg = {
      months: history.length,
      salary_sum: 0,
      employer_pension: 0,
      severance: 0,
      employee_contribution: 0,
      study_fund_employer: 0,
      study_fund_employee: 0,
      total_employer: 0,
      total_employee: 0,
      total: 0,
    };

    for (const row of history) {
      agg.salary_sum            = _round(agg.salary_sum + row.salary);
      agg.employer_pension      = _round(agg.employer_pension + row.employer_pension);
      agg.severance             = _round(agg.severance + row.severance);
      agg.employee_contribution = _round(agg.employee_contribution + row.employee_contribution);
      agg.study_fund_employer   = _round(agg.study_fund_employer + row.study_fund_employer);
      agg.study_fund_employee   = _round(agg.study_fund_employee + row.study_fund_employee);
      agg.total_employer        = _round(agg.total_employer + row.total_employer);
      agg.total_employee        = _round(agg.total_employee + row.total_employee);
      agg.total                 = _round(agg.total + row.total);
    }

    // Accumulate into grand total
    grand.months                += agg.months;
    grand.salary_sum             = _round(grand.salary_sum + agg.salary_sum);
    grand.employer_pension       = _round(grand.employer_pension + agg.employer_pension);
    grand.severance              = _round(grand.severance + agg.severance);
    grand.employee_contribution  = _round(grand.employee_contribution + agg.employee_contribution);
    grand.study_fund_employer    = _round(grand.study_fund_employer + agg.study_fund_employer);
    grand.study_fund_employee    = _round(grand.study_fund_employee + agg.study_fund_employee);
    grand.total_employer         = _round(grand.total_employer + agg.total_employer);
    grand.total_employee         = _round(grand.total_employee + agg.total_employee);
    grand.total                  = _round(grand.total + agg.total);

    arrangementsOut.push({
      arrangement_id: aid,
      arrangement_type: arrangement ? arrangement.arrangement_type : null,
      start_date:      arrangement ? arrangement.start_date : null,
      coverage_ratio:  arrangement ? arrangement.coverage_ratio : null,
      monthly_history: history.map((r) => _deepClone(r)),
      aggregate: agg,
    });
  }

  return {
    employee_id: employeeId,
    employee_id_he: 'מזהה עובד',
    arrangements: arrangementsOut,
    grand_total: grand,
    grand_total_he: {
      months:                'מספר חודשים',
      salary_sum:            'סך שכר קובע',
      employer_pension:      'סך הפרשות מעביד לפנסיה',
      severance:             'סך הפרשות מעביד לפיצויים',
      employee_contribution: 'סך הפרשות עובד',
      total_employer:        'סה"כ מעביד',
      total_employee:        'סה"כ עובד',
      total:                 'סה"כ',
    },
    generated_at: _nowIso(),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 8. upgradeArrangement  — "לא מוחקים רק משדרגים"
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a new version of an arrangement (e.g. the employer increases
 * employer pension from 6% to 6.5%). The old arrangement stays in storage
 * with `superseded_by` set to the new id. No deletion.
 *
 * @param {string} arrangementId — the id of the arrangement to supersede
 * @param {object} changes       — fields to override on the new version
 * @returns {object} the new arrangement record
 */
function upgradeArrangement(arrangementId, changes = {}) {
  const old = _arrangements.get(arrangementId);
  if (!old) {
    throw _err('arrangement not found', 'הסדר לא נמצא', { arrangementId });
  }
  if (old.superseded_by) {
    throw _err('arrangement already superseded', 'ההסדר כבר שודרג', { arrangementId });
  }

  const newArr = createArrangement({
    employee: {
      id: old.employee_id,
      full_name: old.employee_snapshot.full_name,
      national_id: old.employee_snapshot.national_id,
      position: old.employee_snapshot.position,
      department: old.employee_snapshot.department,
    },
    startDate: changes.startDate || old.start_date,
    percentages: {
      employerPension:      changes.employerPension      ?? old.percentages.employer_pension,
      severance:            changes.severance            ?? old.percentages.severance,
      employeeContribution: changes.employeeContribution ?? old.percentages.employee_contribution,
      studyFund:            changes.studyFund            ?? old.percentages.study_fund_employer,
    },
    signed:            changes.signed     ?? old.signed,
    signedDate:        changes.signedDate ?? old.signed_date,
    fundName:          changes.fundName   ?? old.fund_name,
    fundPolicyNumber:  changes.fundPolicyNumber ?? old.fund_policy_number,
    createdBy:         changes.createdBy  ?? old.created_by,
  });

  // Mutate the STORED copy of the old record to mark supersession.
  // We do NOT delete it — history survives forever.
  const oldStored = _arrangements.get(arrangementId);
  oldStored.superseded_by = newArr.id;
  oldStored.superseded_at = _nowIso();
  oldStored.status = 'superseded';

  // Bump version on the new record
  const newStored = _arrangements.get(newArr.id);
  newStored.version = (old.version || 1) + 1;
  newStored.supersedes = arrangementId;

  return _deepClone(newStored);
}

// ═══════════════════════════════════════════════════════════════════════
// 9. getArrangement / listArrangementsForEmployee (read helpers)
// ═══════════════════════════════════════════════════════════════════════

function getArrangement(arrangementId) {
  const a = _arrangements.get(arrangementId);
  return a ? _deepClone(a) : null;
}

function listArrangementsForEmployee(employeeId) {
  const ids = _byEmployee.get(employeeId) || [];
  return ids.map((id) => _deepClone(_arrangements.get(id))).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════
// TEST HOOK — reset in-memory state between test files
// ═══════════════════════════════════════════════════════════════════════

function _resetAll() {
  _arrangements.clear();
  _contributionHistory.clear();
  _byEmployee.clear();
}

// ═══════════════════════════════════════════════════════════════════════
// Tiny deep-clone (no deps)
// ═══════════════════════════════════════════════════════════════════════

function _deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(_deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = _deepClone(obj[k]);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  SECTION_14,

  // core API (as per spec)
  createArrangement,
  calculateMonthlyContribution,
  calculateSeveranceOnTermination,
  isFullyReleased,
  generateArrangementLetter,
  trackContributionHistory,

  // support API
  recordMonthlyContribution,
  upgradeArrangement,
  getArrangement,
  listArrangementsForEmployee,

  // test hook
  _resetAll,
};
