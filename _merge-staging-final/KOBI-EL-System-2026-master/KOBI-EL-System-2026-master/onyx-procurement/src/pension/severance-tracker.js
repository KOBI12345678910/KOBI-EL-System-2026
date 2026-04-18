/**
 * Israeli Severance Pay Fund Tracker — מעקב קרן פיצויים
 * Techno-Kol Uzi mega-ERP — Wave 1.5 — AG-Y015
 *
 * Tracks monthly 8.33% severance contributions to pension / provident funds,
 * accumulates fund returns per period, computes statutory severance owed on
 * termination, employer top-up vs fund balance, Israeli tax with the
 * per-year פיצויים פטורים ceiling, Section 161 election (pension continuity
 * vs. immediate cash), and produces a טופס 161 (Form 161) row for the
 * Tax Authority filing.
 *
 * Legal sources (as applicable for 2026):
 *   - חוק פיצויי פיטורים, תשכ״ג-1963 (Severance Pay Law 1963)
 *   - סעיף 14 להסכם פנסיה חובה (Section 14 — pension as full severance)
 *   - פקודת מס הכנסה — סעיפים 9(7א), 161, 164 (Income Tax Ordinance)
 *   - חוזר מס הכנסה 2/2013 — טופס 161
 *   - תקנות פנסיית חובה 2008 (Mandatory Pension Regulations)
 *
 * Rule (Mega-ERP): לא מוחקים, רק משדרגים ומגדלים — append-only ledger.
 * Zero third-party dependencies. Bilingual (HE / EN).
 *
 * Run the tests:
 *     node --test test/pension/severance-tracker.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — Israeli severance 2026
// ═══════════════════════════════════════════════════════════════════════════

const CONSTANTS_2026 = {
  // Statutory monthly employer contribution to severance component
  // (8.33% = 1/12 — one month's salary per year of employment)
  SEVERANCE_CONTRIBUTION_RATE: 0.0833,

  // Tax-exempt ceiling per year of employment (פיצויים פטורים)
  // Published annually by רשות המסים. For 2026 the ceiling is ~13,750 NIS
  // per year of service (rounded indexation of 12,640 * CPI).
  ANNUAL_EXEMPT_CEILING_NIS: 13750,

  // Bituach Leumi / Health tax on severance above exempt ceiling — Israeli
  // severance is generally NOT subject to Bituach Leumi, only income tax.
  // Kept as flag in case of future change.
  SUBJECT_TO_BITUACH_LEUMI: false,

  // Default marginal tax bracket to apply on the taxable portion when no
  // employee marginal rate is supplied (conservative 35%).
  DEFAULT_MARGINAL_RATE: 0.35,

  // Form 161 current schema version (Tax Authority — טופס 161)
  FORM_161_VERSION: '2026-01',

  // Reason → rights (see §2 of this file for the full matrix)
  // "full"    → full statutory severance + retention of Section 14
  // "partial" → 50 % unless otherwise in contract / collective agreement
  // "limited" → voluntary, generally no severance (Section 14 may survive)
  // "estate"  → paid to beneficiaries / estate (death)
  // "pension" → retirement — full severance, pension credit allowed
  // "relocation" → subject to contract clause; default: partial
  REASON_RIGHTS: {
    dismissal: { code: 'dismissal', rightsTier: 'full', he: 'פיטורים רגילים' },
    economic_layoff: { code: 'economic_layoff', rightsTier: 'full', he: 'צמצום / פיטורי התייעלות' },
    resignation: { code: 'resignation', rightsTier: 'limited', he: 'התפטרות' },
    constructive_dismissal: { code: 'constructive_dismissal', rightsTier: 'full', he: 'התפטרות בדין מפוטר' },
    death: { code: 'death', rightsTier: 'estate', he: 'פטירה (מוות)' },
    retirement: { code: 'retirement', rightsTier: 'pension', he: 'פרישה לפנסיה' },
    relocation: { code: 'relocation', rightsTier: 'partial', he: 'מעבר מקום מגורים (רלוקיישן)' },
    end_of_contract: { code: 'end_of_contract', rightsTier: 'full', he: 'סיום חוזה' },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Currency-safe rounding to 2 decimals (agorot precision). */
function round2(n) {
  // Use Math.round — agorot-precision, avoid banker's rounding surprises.
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Validates that x is a finite non-negative number. */
function assertNonNeg(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) {
    throw new TypeError(`${name} must be a non-negative finite number, got ${x}`);
  }
}

/** Normalises a YYYY-MM period key. */
function normalisePeriod(period) {
  if (!period) throw new TypeError('period is required (YYYY-MM)');
  const s = String(period).trim();
  if (!/^\d{4}-\d{2}$/.test(s)) {
    throw new TypeError(`period must be YYYY-MM, got "${s}"`);
  }
  return s;
}

/** Stable ISO timestamp (no deps). */
function nowIso() {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// SeveranceTracker — the main class
// ═══════════════════════════════════════════════════════════════════════════

class SeveranceTracker {
  /**
   * @param {object} [opts]
   * @param {object} [opts.constants] — override CONSTANTS_2026 for tests.
   * @param {function} [opts.clock]   — injectable clock returning ISO string.
   */
  constructor(opts = {}) {
    this.constants = { ...CONSTANTS_2026, ...(opts.constants || {}) };
    this._clock = typeof opts.clock === 'function' ? opts.clock : nowIso;

    // Append-only ledgers — לא מוחקים, רק משדרגים ומגדלים.
    // contributions: { employeeId, period, amount, pensionFund, ts }
    this.contributions = [];
    // returns: { pensionFund, period, returnPct, ts }
    this.returns = [];
    // elections & form 161 rows are persisted here too, append-only.
    this.elections = [];
    this.form161Rows = [];
  }

  // ─── Ledger I/O ──────────────────────────────────────────────────────────

  /**
   * Record a monthly severance contribution (the 8.33 % employer portion).
   *
   * @param {object} p
   * @param {string} p.employeeId  Unique employee identifier.
   * @param {string} p.period      'YYYY-MM' period the contribution relates to.
   * @param {number} p.amount      NIS (already computed = salary × 8.33%).
   * @param {string} p.pensionFund Fund code (e.g., 'migdal_makefet').
   * @returns {object} the stored contribution row.
   */
  recordContribution({ employeeId, period, amount, pensionFund }) {
    if (!employeeId) throw new TypeError('employeeId is required');
    if (!pensionFund) throw new TypeError('pensionFund is required');
    assertNonNeg(amount, 'amount');
    const row = {
      employeeId: String(employeeId),
      period: normalisePeriod(period),
      amount: round2(amount),
      pensionFund: String(pensionFund),
      ts: this._clock(),
    };
    this.contributions.push(row);
    return row;
  }

  /**
   * Record a fund's monthly return. Positive numbers = profit, negative = loss.
   *
   * @param {object} p
   * @param {string} p.pensionFund Fund code.
   * @param {string} p.period      'YYYY-MM'.
   * @param {number} p.returnPct   Decimal (0.004 = +0.4%, -0.012 = -1.2%).
   * @returns {object}
   */
  recordReturn({ pensionFund, period, returnPct }) {
    if (!pensionFund) throw new TypeError('pensionFund is required');
    if (typeof returnPct !== 'number' || !Number.isFinite(returnPct)) {
      throw new TypeError(`returnPct must be a finite number, got ${returnPct}`);
    }
    const row = {
      pensionFund: String(pensionFund),
      period: normalisePeriod(period),
      returnPct,
      ts: this._clock(),
    };
    this.returns.push(row);
    return row;
  }

  // ─── Balance calculation ─────────────────────────────────────────────────

  /**
   * Current fund balance for a single employee, period by period, with
   * monthly compounding of the fund's returns applied to the running
   * balance. Contributions are assumed to be deposited at period-start.
   *
   * Algorithm:
   *   1. Collect all contributions for this employee.
   *   2. Sort by period ascending.
   *   3. Walk the timeline from earliest to latest (or to "asOf" if given):
   *        balance += contribution_for_period
   *        balance *= (1 + return_for_period)   // applied to the running bal
   *
   * Funds with no return for a given period compound at 0 %.
   *
   * @param {string} employeeId
   * @param {object} [opts]
   * @param {string} [opts.asOf] — 'YYYY-MM' cut-off (inclusive).
   * @returns {{balance:number, contributed:number, returnsEarned:number, periods:string[]}}
   */
  getBalance(employeeId, opts = {}) {
    if (!employeeId) throw new TypeError('employeeId is required');
    const cutoff = opts.asOf ? normalisePeriod(opts.asOf) : null;

    // Filter this employee's contributions.
    const mine = this.contributions
      .filter((c) => c.employeeId === String(employeeId))
      .filter((c) => !cutoff || c.period <= cutoff);

    if (mine.length === 0) {
      return { balance: 0, contributed: 0, returnsEarned: 0, periods: [] };
    }

    // Group contributions by period; assume one active fund per employee,
    // but we sum across funds (mobility between חברות ביטוח) — the balance
    // tracked here is the severance-component total.
    const byPeriod = new Map();
    for (const c of mine) {
      byPeriod.set(c.period, (byPeriod.get(c.period) || 0) + c.amount);
    }

    // Sorted unique periods from first contribution to cutoff (or last contribution).
    const firstPeriod = [...byPeriod.keys()].sort()[0];
    const lastPeriod = cutoff || [...byPeriod.keys()].sort().slice(-1)[0];

    const periods = expandMonthRange(firstPeriod, lastPeriod);

    // Index returns by fund+period. For the balance we need the weighted
    // return. If an employee holds in one fund, we use that fund's return.
    // If split, we use the mix ratio by contribution share in that period.
    const fundShareByPeriod = new Map(); // period -> { fundCode: share }
    for (const p of periods) {
      const contribs = mine.filter((c) => c.period === p);
      const total = contribs.reduce((s, c) => s + c.amount, 0);
      const mix = {};
      if (total > 0) {
        for (const c of contribs) {
          mix[c.pensionFund] = (mix[c.pensionFund] || 0) + c.amount / total;
        }
      }
      fundShareByPeriod.set(p, mix);
    }

    // Running fund mix (cumulative shares) — used to apply returns on the
    // existing balance (not just the new contribution).
    let runningMix = {};

    let balance = 0;
    let contributed = 0;
    let cumulativeContribByFund = {};

    for (const p of periods) {
      const contribThis = byPeriod.get(p) || 0;
      balance += contribThis;
      contributed += contribThis;

      // Update running mix weights based on cumulative contributions.
      const contribsThis = mine.filter((c) => c.period === p);
      for (const c of contribsThis) {
        cumulativeContribByFund[c.pensionFund] =
          (cumulativeContribByFund[c.pensionFund] || 0) + c.amount;
      }
      const totalCum = Object.values(cumulativeContribByFund).reduce((a, b) => a + b, 0);
      runningMix = {};
      if (totalCum > 0) {
        for (const [k, v] of Object.entries(cumulativeContribByFund)) {
          runningMix[k] = v / totalCum;
        }
      }

      // Compound period return using the running mix.
      let periodReturnPct = 0;
      for (const [fundCode, share] of Object.entries(runningMix)) {
        const r = this.returns.find(
          (x) => x.pensionFund === fundCode && x.period === p,
        );
        if (r) periodReturnPct += r.returnPct * share;
      }
      balance = balance * (1 + periodReturnPct);
    }

    const returnsEarned = balance - contributed;
    return {
      balance: round2(balance),
      contributed: round2(contributed),
      returnsEarned: round2(returnsEarned),
      periods,
    };
  }

  // ─── Statutory severance & employer top-up ───────────────────────────────

  /**
   * Computes statutory severance owed under Israeli law, compares to the
   * accumulated fund balance, and returns the employer top-up (if any).
   *
   * Statutory formula:
   *      severance = last_monthly_salary × years_employed × rights_multiplier
   *
   * rights_multiplier depends on the termination reason:
   *      full        → 1.00
   *      economic    → 1.00
   *      pension     → 1.00
   *      estate      → 1.00 (paid to dependants)
   *      partial     → 0.50
   *      limited     → 0.00 (resignation w/o "derogate" cause)
   *      constructive→ 1.00 (התפטרות בדין מפוטר)
   *
   * @param {object} p
   * @param {object} p.employee — { id, lastMonthlySalary, ... }
   * @param {string} p.finalMonth — 'YYYY-MM' of termination.
   * @param {number} p.yearsEmployed — decimal years, e.g. 4.25
   * @param {string} p.reason — key into CONSTANTS.REASON_RIGHTS.
   * @returns {object}
   */
  computeSeveranceOwed({ employee, finalMonth, yearsEmployed, reason }) {
    if (!employee || !employee.id) throw new TypeError('employee.id is required');
    assertNonNeg(employee.lastMonthlySalary, 'employee.lastMonthlySalary');
    assertNonNeg(yearsEmployed, 'yearsEmployed');
    const reasonRow = this.constants.REASON_RIGHTS[reason];
    if (!reasonRow) {
      throw new TypeError(
        `Unknown reason "${reason}". Valid: ${Object.keys(this.constants.REASON_RIGHTS).join(', ')}`,
      );
    }

    const multiplier = this._rightsMultiplier(reasonRow.rightsTier, employee);
    const statutory = round2(
      employee.lastMonthlySalary * yearsEmployed * multiplier,
    );

    const { balance: fundBalance } = this.getBalance(employee.id, { asOf: finalMonth });

    // Employer top-up: the part the employer still owes if the fund is short.
    // If the fund has a surplus, the difference is employee upside (השלמה
    // לעובד) — we surface it as `fundSurplus` rather than silently hiding.
    const gap = round2(statutory - fundBalance);
    const topUp = gap > 0 ? gap : 0;
    const fundSurplus = gap < 0 ? -gap : 0;

    return {
      employeeId: employee.id,
      finalMonth: normalisePeriod(finalMonth),
      yearsEmployed,
      reason: reasonRow.code,
      reasonHebrew: reasonRow.he,
      rightsTier: reasonRow.rightsTier,
      rightsMultiplier: multiplier,
      lastMonthlySalary: round2(employee.lastMonthlySalary),
      statutorySeverance: statutory,
      fundBalance,
      employerTopUp: topUp,
      fundSurplus,
      totalPaidToEmployee: round2(Math.max(statutory, fundBalance)),
    };
  }

  /**
   * Resolve rights multiplier for a tier. Override hook: contracts may
   * upgrade a "limited" (resignation) tier to "full" under Section 11
   * circumstances (הרעת תנאים, etc.).
   */
  _rightsMultiplier(tier, employee) {
    // Contract / collective-agreement override wins if explicitly provided.
    if (employee && typeof employee.overrideRightsMultiplier === 'number') {
      return employee.overrideRightsMultiplier;
    }
    switch (tier) {
      case 'full':
      case 'estate':
      case 'pension':
        return 1.0;
      case 'partial':
        return 0.5;
      case 'limited':
        return 0.0;
      default:
        return 1.0;
    }
  }

  // ─── Tax ──────────────────────────────────────────────────────────────────

  /**
   * Israeli severance tax with the per-year exempt ceiling (פיצויים פטורים).
   *
   *     exempt   = min(severance, ceilingPerYear × yearsEmployed)
   *     taxable  = max(0, severance − exempt)
   *     tax      = taxable × marginal_rate
   *
   * Real life: taxpayers often elect to spread (פריסה) under Sec. 8(ג)(3)
   * and/or to retain pension credit under Sec. 161 — see section161Election.
   *
   * @param {object} p
   * @param {number} p.severance       Gross severance (NIS).
   * @param {number} p.yearsEmployed   Years (may be decimal).
   * @param {object} [p.employee]      optional; marginalRate override.
   * @returns {object}
   */
  computeTaxOnSeverance({ severance, yearsEmployed, employee }) {
    assertNonNeg(severance, 'severance');
    assertNonNeg(yearsEmployed, 'yearsEmployed');

    const ceiling = round2(
      this.constants.ANNUAL_EXEMPT_CEILING_NIS * yearsEmployed,
    );
    const exempt = round2(Math.min(severance, ceiling));
    const taxable = round2(Math.max(0, severance - exempt));

    const marginal =
      employee && typeof employee.marginalRate === 'number'
        ? employee.marginalRate
        : this.constants.DEFAULT_MARGINAL_RATE;

    if (marginal < 0 || marginal > 0.5) {
      throw new RangeError(
        `marginalRate out of bounds (0..0.5), got ${marginal}`,
      );
    }

    const tax = round2(taxable * marginal);
    const net = round2(severance - tax);

    return {
      severance: round2(severance),
      yearsEmployed,
      exemptCeiling: ceiling,
      exemptAmount: exempt,
      taxableAmount: taxable,
      marginalRate: marginal,
      taxDue: tax,
      netToEmployee: net,
      bituachLeumiDue: this.constants.SUBJECT_TO_BITUACH_LEUMI ? round2(taxable * 0.07) : 0,
    };
  }

  // ─── Section 161 election ─────────────────────────────────────────────────

  /**
   * Offers the employee the choice between:
   *   (a) Cash now — tax the taxable portion at the marginal rate.
   *   (b) Retain in pension fund — defer tax to actual retirement
   *       (רצף זכויות קצבה under Sec. 161).
   *
   * Returns a structured breakdown of both options so the caller can render
   * an informed choice.
   *
   * @param {object} severanceResult — result of computeSeveranceOwed
   * @param {object} [opts]
   * @param {number} [opts.marginalRate] default 0.35
   * @param {number} [opts.yearsEmployed] required if missing in severanceResult
   * @returns {{ cashNow:object, pensionCredit:object, recommended:'cash'|'pension'|'neutral' }}
   */
  section161Election(severanceResult, opts = {}) {
    if (!severanceResult || typeof severanceResult !== 'object') {
      throw new TypeError('severanceResult is required');
    }
    const years =
      typeof opts.yearsEmployed === 'number'
        ? opts.yearsEmployed
        : severanceResult.yearsEmployed;
    assertNonNeg(years, 'yearsEmployed');
    const grossSeverance = severanceResult.totalPaidToEmployee;
    if (typeof grossSeverance !== 'number') {
      throw new TypeError('severanceResult.totalPaidToEmployee missing');
    }

    const marginalRate =
      typeof opts.marginalRate === 'number'
        ? opts.marginalRate
        : this.constants.DEFAULT_MARGINAL_RATE;

    // Option A — cash now
    const cashResult = this.computeTaxOnSeverance({
      severance: grossSeverance,
      yearsEmployed: years,
      employee: { marginalRate },
    });

    // Option B — retain rights to future pension (רצף קצבה)
    // No tax crystallised now; taxable portion rides into the pension-credit
    // basket and is taxed at retirement on monthly pension streams.
    const pensionCredit = {
      severance: grossSeverance,
      exemptCeiling: cashResult.exemptCeiling,
      exemptAmount: cashResult.exemptAmount,
      deferredTaxable: cashResult.taxableAmount,
      taxDueNow: 0,
      // Book the deferred-tax estimate for disclosure (same marginal rate).
      deferredTaxEstimate: round2(cashResult.taxableAmount * marginalRate),
      netToEmployeeNow: round2(cashResult.exemptAmount), // only exempt portion cash
      pensionCreditDeposit: round2(cashResult.taxableAmount),
    };

    // Heuristic recommendation: pension continuity if employee is far from
    // retirement (yearsEmployed < 20 and expected future tax rate lower).
    let recommended = 'neutral';
    if (cashResult.taxableAmount <= 0) {
      recommended = 'cash'; // no tax savings to gain
    } else if (grossSeverance > cashResult.exemptCeiling * 1.5) {
      recommended = 'pension'; // big taxable chunk → defer
    }

    const election = {
      cashNow: cashResult,
      pensionCredit,
      recommended,
      elected: null, // caller fills in after employee signs
      electedAt: null,
      ts: this._clock(),
    };
    this.elections.push(election);
    return election;
  }

  // ─── Form 161 ─────────────────────────────────────────────────────────────

  /**
   * Generates a טופס 161 (Form 161) row for filing with רשות המסים.
   *
   * Form 161 is the Israeli Tax Authority form an employer submits when
   * an employee leaves and severance is paid / credited. Key fields:
   *   • employer & employee IDs (ח.פ / ת.ז)
   *   • employment dates
   *   • gross severance
   *   • exempt / taxable split
   *   • election: cash now / pension continuity
   *   • tax withheld
   *
   * This function returns a **row** object ready to be rendered into PDF /
   * CSV / API payload by whatever submission client the ERP uses.
   *
   * @param {object} employee
   * @param {object} severanceResult — computeSeveranceOwed() output
   * @returns {object}
   */
  generateForm161(employee, severanceResult) {
    if (!employee || !employee.id) throw new TypeError('employee.id is required');
    if (!severanceResult) throw new TypeError('severanceResult is required');

    const tax = this.computeTaxOnSeverance({
      severance: severanceResult.totalPaidToEmployee,
      yearsEmployed: severanceResult.yearsEmployed,
      employee,
    });

    const row = {
      schema: this.constants.FORM_161_VERSION,
      formName: 'טופס 161 — הודעה על פרישה מעבודה',
      formNameEn: 'Form 161 — Notice of termination of employment',

      // Employer block
      employer: {
        companyId: employee.employerCompanyId || null, // ח.פ
        companyName: employee.employerName || null,
        taxFileNumber: employee.employerTaxFile || null, // תיק ניכויים
      },

      // Employee block
      employee: {
        id: employee.id,
        teudatZehut: employee.teudatZehut || null,
        nameHebrew: employee.nameHebrew || employee.name || null,
        startDate: employee.startDate || null,
        endDate: employee.endDate || null,
        yearsEmployed: severanceResult.yearsEmployed,
        lastMonthlySalary: severanceResult.lastMonthlySalary,
      },

      // Termination
      termination: {
        reasonCode: severanceResult.reason,
        reasonHebrew: severanceResult.reasonHebrew,
        rightsTier: severanceResult.rightsTier,
        finalMonth: severanceResult.finalMonth,
      },

      // Severance amounts
      amounts: {
        statutorySeverance: severanceResult.statutorySeverance,
        fundBalance: severanceResult.fundBalance,
        employerTopUp: severanceResult.employerTopUp,
        fundSurplus: severanceResult.fundSurplus,
        grossPaid: severanceResult.totalPaidToEmployee,
        exemptCeiling: tax.exemptCeiling,
        exemptAmount: tax.exemptAmount,
        taxableAmount: tax.taxableAmount,
        marginalRate: tax.marginalRate,
        taxWithheld: tax.taxDue,
        netToEmployee: tax.netToEmployee,
      },

      // Section 161 election (if present)
      election: null,

      generatedAt: this._clock(),
    };

    this.form161Rows.push(row);
    return row;
  }

  // ─── Convenience: run the full flow in one call ─────────────────────────

  /**
   * Orchestration helper — run the full termination flow and return every
   * intermediate result. Used by the HR termination wizard UI.
   */
  terminateEmployee({ employee, finalMonth, yearsEmployed, reason }) {
    const severance = this.computeSeveranceOwed({
      employee, finalMonth, yearsEmployed, reason,
    });
    const tax = this.computeTaxOnSeverance({
      severance: severance.totalPaidToEmployee,
      yearsEmployed: severance.yearsEmployed,
      employee,
    });
    const election = this.section161Election(severance, {
      marginalRate: employee.marginalRate,
      yearsEmployed: severance.yearsEmployed,
    });
    const form161 = this.generateForm161(employee, severance);
    form161.election = {
      recommended: election.recommended,
      cashNowTaxDue: election.cashNow.taxDue,
      pensionDeferredTax: election.pensionCredit.deferredTaxEstimate,
    };
    return { severance, tax, election, form161 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: expand a 'YYYY-MM' range into the list of consecutive months.
// ═══════════════════════════════════════════════════════════════════════════

function expandMonthRange(fromYM, toYM) {
  const [fy, fm] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  const out = [];
  let y = fy;
  let m = fm;
  // Cap at 600 months (50 years) for safety.
  for (let i = 0; i < 600; i++) {
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
    if (y === ty && m === tm) break;
    m++;
    if (m > 12) { m = 1; y++; }
    if (y > ty + 5) break;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  SeveranceTracker,
  CONSTANTS_2026,
  // internal helpers exported for the test suite
  _internal: { round2, expandMonthRange, normalisePeriod },
};
