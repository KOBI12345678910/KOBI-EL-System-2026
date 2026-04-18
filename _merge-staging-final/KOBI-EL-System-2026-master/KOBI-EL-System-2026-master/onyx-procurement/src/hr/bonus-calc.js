/**
 * Bonus Calculator — Israeli Payroll-Aware Bonus Engine
 * Agent Y-072 • Techno-Kol Uzi • Mega-ERP • Kobi EL
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים.
 *   This module is purely additive. It never modifies nor deletes any
 *   existing file. `communicateBonus()` returns a bilingual letter ready
 *   to be saved by the caller; `payoutSchedule()` and `clawback()` only
 *   read state and return new state objects.
 *
 * Zero external dependencies. Pure CommonJS. Pure functions wherever
 * possible; the class only wraps state for the "payoutSchedule" /
 * "clawback" ledgers so the caller can hold a single instance per run.
 *
 * Supported bonus types (all of them treated as salary for BL, pension,
 * severance purposes — Israeli default unless explicitly excluded):
 *
 *   1. Performance   — rating × target, configurable multipliers
 *   2. Retention     — multi-tranche vesting, pro-rata on leave
 *   3. Signing       — with clawback window if employee leaves early
 *   4. Holiday       — פורים / ראש השנה / פסח gift,
 *                      statutory tax-free ceiling, rest taxable
 *   5. 13th month    — "משכורת 13" only when collective agreement says so
 *   6. Project       — on project completion, shared across team weights
 *
 * Tax helpers:
 *   - applyTax({bonus, taxRate})         → marginal vs flat
 *   - Israeli rule: bonus is ordinary income,
 *     Bituach Leumi + pension apply unless specifically excluded
 *   - Holiday gifts up to statutory ceiling are tax-exempt,
 *     the excess is fully taxable
 *
 * Communication:
 *   - communicateBonus(employeeId) → bilingual Hebrew/English letter,
 *     no over-commitments, clear payout terms, clawback disclosure.
 *
 * All amounts are in ILS (₪) and stored as numbers (not bigint);
 * rounding is centralized in _round2() to avoid drift in multi-tranche
 * schedules.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// ISRAELI BONUS CONSTANTS — reviewed for tax-year 2026
// ═══════════════════════════════════════════════════════════════

/**
 * Statutory holiday-gift (מתנות לחגים) tax-exempt ceiling per event.
 * Per פקודת מס הכנסה + תקנות מס הכנסה (ניכוי מהכנסות משלח-יד).
 * The ITA publishes an updated figure each year; the commonly-cited
 * 2025/2026 figure is ~228 ₪ per event per employee. Anything above
 * this ceiling is fully taxable as ordinary income.
 *
 * NOTE: set via env or constructor override for future updates —
 * "לא מוחקים רק משדרגים ומגדלים".
 */
const HOLIDAY_GIFT_TAX_FREE_CEILING_ILS = 228;

/** Max number of statutory tax-exempt holiday-gift events per year. */
const HOLIDAY_GIFT_MAX_EVENTS_PER_YEAR = 3;

/** Israeli holiday identifiers recognised by this module. */
const HOLIDAY_PERIODS = Object.freeze({
  PURIM: 'purim',
  ROSH_HASHANA: 'rosh-hashana',
  PASSOVER: 'passover',
});

/** Default performance-rating → multiplier curve (can be overridden). */
const DEFAULT_PERFORMANCE_CURVE = Object.freeze({
  1: 0.0, //        חלש            / Poor
  2: 0.5, //        מתחת לציפיות    / Below expectations
  3: 1.0, //        עומד בציפיות   / Meets expectations
  4: 1.25, //       מעל הציפיות    / Exceeds expectations
  5: 1.5, //        מצטיין         / Outstanding
});

/** Default marginal-bracket (approximate 2026 top bracket) for flat option. */
const DEFAULT_MARGINAL_RATE = 0.47; // 47% — top bracket + surtax
const DEFAULT_FLAT_BONUS_RATE = 0.35; // used when caller specifies 'flat'

/** Israeli social charges that apply to bonuses as salary. */
const SOCIAL_CHARGES = Object.freeze({
  BITUACH_LEUMI_EMPLOYEE: 0.12, // simplified — high bracket; real calc in payroll module
  PENSION_EMPLOYEE: 0.06, // employee pension contribution (6% typical)
  HEALTH_TAX: 0.05, // מס בריאות
});

/** Default signing-bonus clawback schedule (pro-rata, linear). */
const DEFAULT_CLAWBACK_MONTHS = 24;

// ═══════════════════════════════════════════════════════════════
// BILINGUAL LABELS — { he, en }
// ═══════════════════════════════════════════════════════════════

const LABELS = Object.freeze({
  PERFORMANCE: { he: 'בונוס ביצועים', en: 'Performance Bonus' },
  RETENTION: { he: 'בונוס שימור', en: 'Retention Bonus' },
  SIGNING: { he: 'מענק חתימה', en: 'Signing Bonus' },
  HOLIDAY: { he: 'מתנה לחג', en: 'Holiday Gift' },
  THIRTEENTH: { he: 'משכורת 13', en: '13th Salary' },
  PROJECT: { he: 'בונוס פרויקט', en: 'Project Bonus' },
  GROSS: { he: 'סכום ברוטו', en: 'Gross Amount' },
  NET: { he: 'סכום נטו', en: 'Net Amount' },
  TAX: { he: 'מס', en: 'Tax' },
  CLAWBACK: { he: 'החזר בונוס', en: 'Clawback' },
  PAYOUT_DATE: { he: 'תאריך תשלום', en: 'Payout Date' },
  TAX_FREE_PORTION: { he: 'חלק פטור ממס', en: 'Tax-Free Portion' },
  TAXABLE_PORTION: { he: 'חלק חייב במס', en: 'Taxable Portion' },
  TRANCHE: { he: 'פעימה', en: 'Tranche' },
  VESTING: { he: 'הבשלה', en: 'Vesting' },
  EFFECTIVE_DATE: { he: 'תאריך תחולה', en: 'Effective Date' },
  REASON: { he: 'סיבה', en: 'Reason' },
});

const HOLIDAY_NAMES = Object.freeze({
  purim: { he: 'פורים', en: 'Purim' },
  'rosh-hashana': { he: 'ראש השנה', en: 'Rosh Hashana' },
  passover: { he: 'פסח', en: 'Passover' },
});

// ═══════════════════════════════════════════════════════════════
// SMALL PURE HELPERS
// ═══════════════════════════════════════════════════════════════

function _round2(n) {
  if (!Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n) * 100) / 100;
}

function _nonNegative(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? x : 0;
}

function _clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function _toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function _isoDate(d) {
  const dt = _toDate(d);
  return dt ? dt.toISOString().slice(0, 10) : null;
}

function _addMonths(d, months) {
  const base = _toDate(d) || new Date();
  const out = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate())
  );
  return out;
}

/**
 * Deterministic pseudo-unique id for a bonus record.
 * Not cryptographic — just monotonic + random tail.
 */
let _idCounter = 0;
function _newId(prefix) {
  _idCounter += 1;
  const tail = Math.floor(Math.random() * 1e6).toString(36);
  return `${prefix}-${Date.now()}-${_idCounter}-${tail}`;
}

function _requireObject(name, value) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

// ═══════════════════════════════════════════════════════════════
// CLASS BonusCalculator
// ═══════════════════════════════════════════════════════════════

class BonusCalculator {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.holidayGiftCeiling]      override statutory ceiling
   * @param {number} [opts.marginalRate]            override marginal tax rate
   * @param {number} [opts.flatRate]                override flat tax rate
   * @param {Object} [opts.performanceCurve]        override rating → multiplier map
   * @param {number} [opts.clawbackMonths]          override default clawback window
   */
  constructor(opts = {}) {
    this.holidayGiftCeiling = Number.isFinite(opts.holidayGiftCeiling)
      ? Number(opts.holidayGiftCeiling)
      : HOLIDAY_GIFT_TAX_FREE_CEILING_ILS;

    this.marginalRate = Number.isFinite(opts.marginalRate)
      ? Number(opts.marginalRate)
      : DEFAULT_MARGINAL_RATE;

    this.flatRate = Number.isFinite(opts.flatRate) ? Number(opts.flatRate) : DEFAULT_FLAT_BONUS_RATE;

    this.performanceCurve =
      opts.performanceCurve && typeof opts.performanceCurve === 'object'
        ? { ...DEFAULT_PERFORMANCE_CURVE, ...opts.performanceCurve }
        : { ...DEFAULT_PERFORMANCE_CURVE };

    this.clawbackMonths = Number.isFinite(opts.clawbackMonths)
      ? Number(opts.clawbackMonths)
      : DEFAULT_CLAWBACK_MONTHS;

    /**
     * Ledger of bonuses created via this instance.
     * Not persisted — caller is expected to save them.
     * Keyed by bonus id.
     */
    this._ledger = new Map();
  }

  // ─────────────────────────────────────────────────────────────
  // 1. PERFORMANCE BONUS
  // ─────────────────────────────────────────────────────────────

  /**
   * Rating-based performance bonus.
   *
   * formula:
   *   baseTarget      = employee.base_salary * (targetPct / 100)
   *   achievementRate = actualPct / targetPct  (capped at 2.0)
   *   ratingMultiplier= curve[rating]           (default 1..5 curve)
   *   gross           = baseTarget * achievementRate * ratingMultiplier
   *
   * @param {Object} args
   * @param {Object} args.employee     {id, base_salary, name?}
   * @param {number} args.rating       1..5
   * @param {number} args.targetPct    e.g. 10 = 10% of base salary
   * @param {number} args.actualPct    employee's achieved % vs target
   * @param {Object} [args.period]     {start, end}
   */
  calculatePerformanceBonus(args) {
    const { employee, rating, targetPct, actualPct, period } = _requireObject('args', args);
    _requireObject('employee', employee);

    const base = _nonNegative(employee.base_salary);
    const tgt = _nonNegative(targetPct);
    const act = _nonNegative(actualPct);
    const rat = _clampNumber(rating, 1, 5);

    const baseTarget = base * (tgt / 100);
    const achievement = tgt === 0 ? 0 : Math.min(act / tgt, 2);
    const mult = this.performanceCurve[rat] != null ? this.performanceCurve[rat] : 1;
    const gross = _round2(baseTarget * achievement * mult);

    const record = {
      id: _newId('perf'),
      type: 'performance',
      label: LABELS.PERFORMANCE,
      employee_id: employee.id || null,
      period: period || null,
      inputs: { rating: rat, targetPct: tgt, actualPct: act, base_salary: base },
      achievement_rate: _round2(achievement),
      multiplier: mult,
      gross,
      currency: 'ILS',
      taxable: true,
      counts_as_salary: true,
      created_at: new Date().toISOString(),
    };

    this._ledger.set(record.id, record);
    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // 2. RETENTION BONUS — multi-tranche
  // ─────────────────────────────────────────────────────────────

  /**
   * Multi-tranche retention bonus with vesting schedule.
   *
   * @param {Object} args
   * @param {Object} args.employee        {id, base_salary?}
   * @param {number} args.amount          total gross amount (ILS)
   * @param {number} args.vestingPeriod   total vesting in months
   * @param {Array<string|Date>} args.payoutDates  list of tranche payout dates
   *   (if omitted, distributed evenly across vesting period)
   */
  calculateRetentionBonus(args) {
    const { employee, amount, vestingPeriod, payoutDates } = _requireObject('args', args);
    _requireObject('employee', employee);

    const total = _nonNegative(amount);
    const months = _nonNegative(vestingPeriod) || 12;
    const dates = Array.isArray(payoutDates) && payoutDates.length > 0 ? payoutDates : null;

    const tranches = [];
    if (dates) {
      const per = _round2(total / dates.length);
      const rounded = dates.map((d, i) => ({
        index: i + 1,
        date: _isoDate(d),
        amount: i === dates.length - 1
          ? _round2(total - per * (dates.length - 1)) // fix-up last tranche for rounding
          : per,
        vested: false,
        paid: false,
      }));
      tranches.push(...rounded);
    } else {
      // Auto schedule: quarterly tranches across vesting period
      const trancheCount = Math.max(1, Math.floor(months / 3));
      const per = _round2(total / trancheCount);
      for (let i = 0; i < trancheCount; i++) {
        const dateObj = _addMonths(new Date(), (i + 1) * Math.floor(months / trancheCount));
        tranches.push({
          index: i + 1,
          date: _isoDate(dateObj),
          amount:
            i === trancheCount - 1
              ? _round2(total - per * (trancheCount - 1))
              : per,
          vested: false,
          paid: false,
        });
      }
    }

    const record = {
      id: _newId('ret'),
      type: 'retention',
      label: LABELS.RETENTION,
      employee_id: employee.id || null,
      gross: _round2(total),
      vesting_months: months,
      tranches,
      currency: 'ILS',
      taxable: true,
      counts_as_salary: true,
      created_at: new Date().toISOString(),
    };

    this._ledger.set(record.id, record);
    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. SIGNING BONUS — with clawback
  // ─────────────────────────────────────────────────────────────

  /**
   * Signing bonus with linear clawback over clawbackPeriod months.
   *
   * If the employee leaves after `monthsWorked`, the amount to be
   * reimbursed is:
   *    clawbackAmount = amount * (1 - monthsWorked / clawbackPeriod)
   *    (floor at 0, ceiling at `amount`)
   *
   * @param {Object} args
   * @param {Object} args.employee        {id, name?, hire_date}
   * @param {number} args.amount          signing bonus amount (ILS)
   * @param {number} [args.clawbackPeriod] months; default = 24
   */
  calculateSigningBonus(args) {
    const { employee, amount, clawbackPeriod } = _requireObject('args', args);
    _requireObject('employee', employee);

    const gross = _round2(_nonNegative(amount));
    const months = _nonNegative(clawbackPeriod) || this.clawbackMonths;

    const record = {
      id: _newId('sign'),
      type: 'signing',
      label: LABELS.SIGNING,
      employee_id: employee.id || null,
      gross,
      clawback_period_months: months,
      clawback_policy: 'linear_pro_rata',
      currency: 'ILS',
      taxable: true,
      counts_as_salary: true,
      hire_date: _isoDate(employee.hire_date),
      created_at: new Date().toISOString(),
    };

    this._ledger.set(record.id, record);
    return record;
  }

  /**
   * Pure helper — compute the clawback amount owed by the employee
   * given months already worked against a signing-bonus record.
   */
  computeSigningClawback(signingRecord, monthsWorked) {
    _requireObject('signingRecord', signingRecord);
    const months = _nonNegative(monthsWorked);
    const window = _nonNegative(signingRecord.clawback_period_months) || this.clawbackMonths;
    if (window === 0) return 0;
    const vested = Math.min(1, months / window);
    const owed = signingRecord.gross * (1 - vested);
    return _round2(Math.max(0, Math.min(owed, signingRecord.gross)));
  }

  // ─────────────────────────────────────────────────────────────
  // 4. HOLIDAY BONUS — מתנות לחגים
  // ─────────────────────────────────────────────────────────────

  /**
   * Compute a holiday gift bonus and split it into its
   * tax-exempt and taxable portions per Israeli statute.
   *
   *   taxFree   = min(gross, ceiling)
   *   taxable   = max(0, gross - ceiling)
   *
   * @param {Object} args
   * @param {Object} args.employee
   * @param {('purim'|'rosh-hashana'|'passover')} args.period
   * @param {number} [args.amount]    total gift value; default = ceiling
   */
  calculateHolidayBonus(args) {
    const { employee, period, amount } = _requireObject('args', args);
    _requireObject('employee', employee);

    const key = String(period || '').toLowerCase();
    if (!HOLIDAY_NAMES[key]) {
      throw new RangeError(
        `Unknown holiday period: ${period}. ` +
          `Expected one of: ${Object.keys(HOLIDAY_NAMES).join(', ')}`
      );
    }

    const gross = _round2(_nonNegative(amount || this.holidayGiftCeiling));
    const ceiling = this.holidayGiftCeiling;
    const taxFree = _round2(Math.min(gross, ceiling));
    const taxable = _round2(Math.max(0, gross - ceiling));

    const record = {
      id: _newId('hol'),
      type: 'holiday',
      label: LABELS.HOLIDAY,
      holiday: key,
      holiday_name: HOLIDAY_NAMES[key],
      employee_id: employee.id || null,
      gross,
      tax_free_portion: taxFree,
      taxable_portion: taxable,
      ceiling_applied: ceiling,
      currency: 'ILS',
      taxable: taxable > 0,
      counts_as_salary: false, // the gift itself is not salary for BL/pension
      created_at: new Date().toISOString(),
    };

    this._ledger.set(record.id, record);
    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. 13TH MONTH — משכורת 13
  // ─────────────────────────────────────────────────────────────

  /**
   * 13th salary — ONLY when covered by collective agreement (הסכם קיבוצי)
   * or personal contract. If the employee is not eligible, returns a
   * zero-amount record with eligibility:false so the caller can surface
   * a clear message instead of silently paying nothing.
   *
   * @param {Object} args
   * @param {Object} args.employee                  {id, base_salary, months_worked}
   * @param {Object} args.eligibility               {covered:boolean, source?:string}
   */
  calculate13thMonth(args) {
    const { employee, eligibility } = _requireObject('args', args);
    _requireObject('employee', employee);

    const covered = Boolean(eligibility && eligibility.covered);
    const base = _nonNegative(employee.base_salary);
    const months = _clampNumber(employee.months_worked, 0, 12);
    const proRata = covered ? _round2(base * (months / 12)) : 0;

    const record = {
      id: _newId('13m'),
      type: '13th_month',
      label: LABELS.THIRTEENTH,
      employee_id: employee.id || null,
      eligible: covered,
      eligibility_source: eligibility && eligibility.source ? String(eligibility.source) : null,
      months_worked: months,
      gross: proRata,
      currency: 'ILS',
      taxable: covered,
      counts_as_salary: true,
      created_at: new Date().toISOString(),
    };

    this._ledger.set(record.id, record);
    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // 6. PROJECT BONUS
  // ─────────────────────────────────────────────────────────────

  /**
   * Project completion bonus, distributed across team by weight.
   *
   * @param {Object} args
   * @param {Object} args.project        {id, name, status}
   * @param {Array}  args.team           [{employee_id, weight}]
   * @param {number} args.budget         total pool (ILS)
   */
  calculateProjectBonus(args) {
    const { project, team, budget } = _requireObject('args', args);
    _requireObject('project', project);

    const pool = _nonNegative(budget);
    const members = Array.isArray(team) ? team : [];
    const totalWeight = members.reduce((s, m) => s + _nonNegative(m && m.weight), 0);

    const distribution = members.map((m) => {
      const w = _nonNegative(m && m.weight);
      const share = totalWeight === 0 ? 0 : _round2(pool * (w / totalWeight));
      return {
        employee_id: m && m.employee_id,
        weight: w,
        gross: share,
      };
    });

    // Fix-up rounding drift on last member
    const distSum = distribution.reduce((s, d) => s + d.gross, 0);
    const drift = _round2(pool - distSum);
    if (distribution.length > 0 && drift !== 0) {
      distribution[distribution.length - 1].gross = _round2(
        distribution[distribution.length - 1].gross + drift
      );
    }

    const record = {
      id: _newId('proj'),
      type: 'project',
      label: LABELS.PROJECT,
      project_id: project.id || null,
      project_name: project.name || null,
      project_status: project.status || null,
      budget: _round2(pool),
      distribution,
      currency: 'ILS',
      taxable: true,
      counts_as_salary: true,
      created_at: new Date().toISOString(),
    };

    this._ledger.set(record.id, record);
    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // TAX TREATMENT
  // ─────────────────────────────────────────────────────────────

  /**
   * Apply Israeli tax treatment to a bonus record.
   *
   * Bonus is ordinary income for Israel:
   *   - counts as salary for bituach leumi, pension, severance
   *     unless record.counts_as_salary === false (holiday gifts)
   *   - taxable portion is either the full gross (most bonuses) or
   *     gross minus tax_free_portion (holiday gifts)
   *
   * @param {Object} args
   * @param {Object} args.bonus                              a bonus record
   * @param {('marginal'|'flat')} [args.taxRate='marginal']
   */
  applyTax(args) {
    const { bonus, taxRate } = _requireObject('args', args);
    _requireObject('bonus', bonus);

    const mode = taxRate === 'flat' ? 'flat' : 'marginal';
    const rate = mode === 'flat' ? this.flatRate : this.marginalRate;

    // Project bonuses have a distribution[] rather than a single gross payout
    if (bonus.type === 'project' && Array.isArray(bonus.distribution)) {
      const perEmployee = bonus.distribution.map((d) => {
        const gross = _nonNegative(d.gross);
        const tax = _round2(gross * rate);
        const bl = _round2(gross * SOCIAL_CHARGES.BITUACH_LEUMI_EMPLOYEE);
        const pension = _round2(gross * SOCIAL_CHARGES.PENSION_EMPLOYEE);
        const health = _round2(gross * SOCIAL_CHARGES.HEALTH_TAX);
        const net = _round2(gross - tax - bl - pension - health);
        return {
          ...d,
          tax,
          bituach_leumi: bl,
          pension,
          health_tax: health,
          net,
        };
      });
      return {
        ...bonus,
        tax_mode: mode,
        tax_rate: rate,
        tax_currency: 'ILS',
        distribution: perEmployee,
      };
    }

    // Holiday gift = only the taxable portion is taxed
    const taxableGross =
      bonus.type === 'holiday'
        ? _nonNegative(bonus.taxable_portion)
        : _nonNegative(bonus.gross);

    const tax = _round2(taxableGross * rate);

    // Social charges apply only when counts_as_salary
    const appliesSocial = bonus.counts_as_salary !== false;
    const bl = appliesSocial ? _round2(taxableGross * SOCIAL_CHARGES.BITUACH_LEUMI_EMPLOYEE) : 0;
    const pension = appliesSocial ? _round2(taxableGross * SOCIAL_CHARGES.PENSION_EMPLOYEE) : 0;
    const health = appliesSocial ? _round2(taxableGross * SOCIAL_CHARGES.HEALTH_TAX) : 0;

    // Net = full gross minus all deductions (tax-free portion stays untouched)
    const net = _round2(_nonNegative(bonus.gross) - tax - bl - pension - health);

    const out = {
      ...bonus,
      tax_mode: mode,
      tax_rate: rate,
      tax,
      bituach_leumi: bl,
      pension_deduction: pension,
      health_tax: health,
      net,
      tax_currency: 'ILS',
    };
    if (this._ledger.has(bonus.id)) this._ledger.set(bonus.id, out);
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // PAYOUT SCHEDULE
  // ─────────────────────────────────────────────────────────────

  /**
   * Return the ordered list of payout dates for a bonus, with status.
   * For retention it's the tranche list; for anything else it's a
   * single entry on created_at + 1 month (unless already paid).
   */
  payoutSchedule(bonusId) {
    const record = this._ledger.get(bonusId);
    if (!record) {
      return { bonus_id: bonusId, found: false, schedule: [] };
    }

    if (record.type === 'retention' && Array.isArray(record.tranches)) {
      return {
        bonus_id: bonusId,
        type: record.type,
        currency: record.currency || 'ILS',
        schedule: record.tranches.map((t) => ({
          index: t.index,
          date: t.date,
          amount: t.amount,
          status: t.paid ? 'paid' : t.vested ? 'vested' : 'pending',
        })),
      };
    }

    if (record.type === 'project' && Array.isArray(record.distribution)) {
      const date = _isoDate(_addMonths(new Date(record.created_at), 1));
      return {
        bonus_id: bonusId,
        type: record.type,
        currency: record.currency || 'ILS',
        schedule: record.distribution.map((d, i) => ({
          index: i + 1,
          employee_id: d.employee_id,
          date,
          amount: d.gross,
          status: 'pending',
        })),
      };
    }

    const date = _isoDate(_addMonths(new Date(record.created_at), 1));
    return {
      bonus_id: bonusId,
      type: record.type,
      currency: record.currency || 'ILS',
      schedule: [
        {
          index: 1,
          date,
          amount: _nonNegative(record.net != null ? record.net : record.gross),
          status: 'pending',
        },
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CLAWBACK
  // ─────────────────────────────────────────────────────────────

  /**
   * Record a clawback event for an employee. Does NOT delete the
   * original bonus record — creates a counter-entry in the ledger.
   *
   * @param {Object} args
   * @param {string} args.employeeId
   * @param {string} args.reason
   * @param {number} args.amount
   * @param {string} [args.bonusId]   link to the original bonus record
   */
  clawback(args) {
    const { employeeId, reason, amount, bonusId } = _requireObject('args', args);
    if (!employeeId) throw new TypeError('employeeId is required');
    if (!reason) throw new TypeError('reason is required');

    const owed = _round2(_nonNegative(amount));
    const id = _newId('claw');
    const record = {
      id,
      type: 'clawback',
      label: LABELS.CLAWBACK,
      employee_id: employeeId,
      bonus_id: bonusId || null,
      reason: String(reason),
      amount: owed,
      currency: 'ILS',
      created_at: new Date().toISOString(),
    };
    this._ledger.set(id, record);

    // Link it on the original if present — don't overwrite history
    if (bonusId && this._ledger.has(bonusId)) {
      const original = this._ledger.get(bonusId);
      const history = Array.isArray(original.clawback_history)
        ? original.clawback_history.slice()
        : [];
      history.push({ id, reason: record.reason, amount: owed, at: record.created_at });
      this._ledger.set(bonusId, { ...original, clawback_history: history });
    }
    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // COMMUNICATION — bilingual letter
  // ─────────────────────────────────────────────────────────────

  /**
   * Render a bilingual Hebrew/English letter for every bonus awarded
   * to the given employee in this run.
   *
   * Principles:
   *   - No over-commitments: only states what was approved, not promises
   *   - Clear payout terms: date & currency always present
   *   - Clawback disclosure for signing bonuses
   *   - Tax disclosure: net is an estimate, final via payroll
   *
   * @returns {{employee_id, he:string, en:string, records:Array}}
   */
  communicateBonus(employeeId) {
    const records = Array.from(this._ledger.values()).filter(
      (r) => r.employee_id === employeeId && r.type !== 'clawback'
    );

    if (records.length === 0) {
      return {
        employee_id: employeeId,
        he: 'לא נמצאו רכיבי בונוס לתקופה זו.',
        en: 'No bonus components were found for this period.',
        records: [],
      };
    }

    const today = new Date().toISOString().slice(0, 10);

    // ── Hebrew ────────────────────────────────────────────────
    const heLines = [];
    heLines.push('שלום רב,');
    heLines.push('');
    heLines.push('בהמשך לעבודתך המצוינת, להלן פירוט רכיבי הבונוס המאושרים:');
    heLines.push('');

    for (const r of records) {
      heLines.push(`• ${r.label.he}: ${_round2(r.gross)} ₪ (ברוטו)`);
      if (r.type === 'holiday') {
        heLines.push(
          `  — פטור ממס עד ${_round2(r.ceiling_applied)} ₪, חלק חייב במס: ${_round2(
            r.taxable_portion
          )} ₪`
        );
      }
      if (r.type === 'signing') {
        heLines.push(
          `  — כפוף להתחייבות שירות של ${r.clawback_period_months} חודשים. ` +
            'במקרה של עזיבה מוקדמת יוחזר הסכום באופן יחסי (pro-rata).'
        );
      }
      if (r.type === 'retention' && Array.isArray(r.tranches)) {
        heLines.push(`  — ישולם ב-${r.tranches.length} פעימות עד להבשלה מלאה.`);
      }
      if (r.type === '13th_month' && r.eligible === false) {
        heLines.push('  — רכיב זה אינו חל כיוון שאינך מכוסה בהסכם קיבוצי רלוונטי.');
      }
      if (r.net != null) {
        heLines.push(`  — נטו משוער: ${_round2(r.net)} ₪ (בכפוף לחישוב שכר סופי)`);
      }
    }
    heLines.push('');
    heLines.push('הסכומים לעיל הם סכומים אומדניים. החישוב הסופי יבוצע במערכת השכר');
    heLines.push('בהתאם לחוק מס הכנסה, חוק הביטוח הלאומי, וכללי הקרנות הפנסיוניות.');
    heLines.push('');
    heLines.push(`תאריך הפקה: ${today}`);
    heLines.push('בברכה,');
    heLines.push('מחלקת משאבי אנוש');

    // ── English ───────────────────────────────────────────────
    const enLines = [];
    enLines.push('Dear colleague,');
    enLines.push('');
    enLines.push('Following your excellent work, please find the approved bonus components:');
    enLines.push('');

    for (const r of records) {
      enLines.push(`• ${r.label.en}: ${_round2(r.gross)} ILS (gross)`);
      if (r.type === 'holiday') {
        enLines.push(
          `  — Tax-free up to ${_round2(r.ceiling_applied)} ILS; taxable portion: ${_round2(
            r.taxable_portion
          )} ILS`
        );
      }
      if (r.type === 'signing') {
        enLines.push(
          `  — Subject to ${r.clawback_period_months}-month service commitment. ` +
            'Early departure triggers linear pro-rata clawback.'
        );
      }
      if (r.type === 'retention' && Array.isArray(r.tranches)) {
        enLines.push(`  — Payable in ${r.tranches.length} tranches until full vesting.`);
      }
      if (r.type === '13th_month' && r.eligible === false) {
        enLines.push('  — Not applicable: you are not covered by the relevant collective agreement.');
      }
      if (r.net != null) {
        enLines.push(`  — Estimated net: ${_round2(r.net)} ILS (final figure by payroll)`);
      }
    }
    enLines.push('');
    enLines.push('The amounts above are estimates. Final calculation is performed by the');
    enLines.push('payroll system per Israeli Income Tax Ordinance, Bituach Leumi, and pension rules.');
    enLines.push('');
    enLines.push(`Issued: ${today}`);
    enLines.push('Best regards,');
    enLines.push('Human Resources');

    return {
      employee_id: employeeId,
      he: heLines.join('\n'),
      en: enLines.join('\n'),
      records,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // LEDGER ACCESS (read-only view)
  // ─────────────────────────────────────────────────────────────

  getLedger() {
    return Array.from(this._ledger.values());
  }

  getBonus(id) {
    return this._ledger.get(id) || null;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  BonusCalculator,
  // constants (frozen) for callers that want to reference the same values
  HOLIDAY_GIFT_TAX_FREE_CEILING_ILS,
  HOLIDAY_GIFT_MAX_EVENTS_PER_YEAR,
  HOLIDAY_PERIODS,
  DEFAULT_PERFORMANCE_CURVE,
  DEFAULT_MARGINAL_RATE,
  DEFAULT_FLAT_BONUS_RATE,
  SOCIAL_CHARGES,
  LABELS,
  HOLIDAY_NAMES,
  // tiny helpers exposed for tests & composition
  _internals: {
    _round2,
    _nonNegative,
    _clampNumber,
    _toDate,
    _isoDate,
    _addMonths,
  },
};
