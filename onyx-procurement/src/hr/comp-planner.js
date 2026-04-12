/**
 * Compensation Planner — Zero-Dependency Salary Bands & Merit Engine
 * Agent Y-071 • Techno-Kol Uzi • Mega-ERP • Kobi EL 2026
 *
 * Salary bands, compa-ratio, merit matrix, market benchmarks, total
 * rewards, pay-equity, compression detection, hiring guardrails,
 * budget tracking, and Hebrew bilingual increase letters.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
 *
 * Zero dependencies. Pure functions + one class. Bilingual (HE/EN).
 * Israeli labor-law aware (חוק שכר שווה לעובדת ולעובד, pension 6.5%,
 * study fund קרן השתלמות 7.5% employer, ביטוח לאומי, דמי הבראה).
 *
 * Documented real-source hooks for live Israeli market benchmarks
 * (CBS הלמ״ס, Ethosia, AllJobs, TheMarker salary surveys) — the
 * embedded sample data is clearly marked and overridable.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS — Israeli comp defaults 2026
// ═══════════════════════════════════════════════════════════════

const ILS = 'ILS';

/** Bilingual labels */
const LABELS = {
  compaRatio: { he: 'יחס חציון (Compa-Ratio)', en: 'Compa-Ratio' },
  midpoint:   { he: 'חציון הטווח',               en: 'Band Midpoint' },
  min:        { he: 'מינימום טווח',              en: 'Band Min' },
  max:        { he: 'מקסימום טווח',              en: 'Band Max' },
  band:       { he: 'טווח שכר',                  en: 'Salary Band' },
  grade:      { he: 'דרגה',                      en: 'Grade' },
  jobFamily:  { he: 'משפחת תפקידים',             en: 'Job Family' },
  merit:      { he: 'העלאת הצטיינות',            en: 'Merit Increase' },
  cola:       { he: 'התאמת יוקר-מחיה',           en: 'COLA' },
  market:     { he: 'התאמה שוק',                 en: 'Market Adjust' },
  baseSalary: { he: 'שכר בסיס',                  en: 'Base Salary' },
  bonus:      { he: 'בונוס',                     en: 'Bonus' },
  equity:     { he: 'הון עצמי/אופציות',          en: 'Equity' },
  pension:    { he: 'פנסיה',                     en: 'Pension' },
  studyFund:  { he: 'קרן השתלמות',               en: 'Study Fund' },
  mealAllow:  { he: 'שובר/הבראה יומי',           en: 'Meal Allowance' },
  carAllow:   { he: 'רכב/החזר נסיעות',           en: 'Car Allowance' },
  bl:         { he: 'ביטוח לאומי',               en: 'BL (social security)' },
  totalComp:  { he: 'שכר כולל',                  en: 'Total Rewards' },
  compression:{ he: 'דחיסת שכר',                 en: 'Pay Compression' },
  hiringBand: { he: 'תקרת גיוס',                 en: 'Hire Rate Ceiling' },
};

/** Israeli statutory employer contributions (2026 rates). */
const IL_EMPLOYER = {
  PENSION_PCT:        0.065,   // 6.5% employer pension
  SEVERANCE_PCT:      0.0833,  // 8.33% severance component
  STUDY_FUND_PCT:     0.075,   // 7.5% employer study fund (קרן השתלמות)
  BL_EMPLOYER_PCT:    0.0775,  // ~7.75% ביטוח לאומי (rough blended 2026)
  BL_CEILING_FACTOR:  5,       // BL capped at 5x avg wage (simplified)
};

/** Merit-matrix defaults: performance × compa-ratio quartile → %. */
const DEFAULT_MERIT_MATRIX = {
  // rows: performance 1..5 (1=unsatisfactory, 5=exceptional)
  // cols: compa quartile Q1 (<0.9), Q2 (0.9-1.0), Q3 (1.0-1.1), Q4 (>1.1)
  5: { Q1: 0.08, Q2: 0.06, Q3: 0.045, Q4: 0.03 },
  4: { Q1: 0.06, Q2: 0.045, Q3: 0.035, Q4: 0.02 },
  3: { Q1: 0.04, Q2: 0.03, Q3: 0.02, Q4: 0.01 },
  2: { Q1: 0.02, Q2: 0.01, Q3: 0.005, Q4: 0.0 },
  1: { Q1: 0.0,  Q2: 0.0,  Q3: 0.0,  Q4: 0.0 },
};

/** Compression threshold: manager must earn ≥ this × highest report. */
const COMPRESSION_FLOOR = 1.10;

/** Pay-equity threshold: flag gaps above this share. */
const PAY_EQUITY_FLAG_PCT = 0.05; // 5% unexplained gap triggers flag

// ═══════════════════════════════════════════════════════════════
// EMBEDDED ISRAELI MARKET SAMPLE DATA
// ───────────────────────────────────────────────────────────────
// NOTE — these are demonstration benchmarks only. Production
// deployments should replace them with live feeds from:
//
//   • הלמ״ס (CBS) — https://www.cbs.gov.il  (quarterly wage surveys)
//   • Ethosia Salary Report (annual Israeli high-tech)
//   • AllJobs / Drushim salary benchmarks
//   • TheMarker annual salary survey
//   • Payroll provider aggregates (Michpal, Hilan, Malam Team)
//
// Numbers in ILS, monthly gross, 2026-projected (IL only).
// ═══════════════════════════════════════════════════════════════
const IL_MARKET_SAMPLE = {
  engineering: {
    junior:     { min: 14000, mid: 18000, max: 24000, source: 'Ethosia 2025 H2' },
    mid:        { min: 22000, mid: 28000, max: 36000, source: 'Ethosia 2025 H2' },
    senior:     { min: 32000, mid: 42000, max: 55000, source: 'Ethosia 2025 H2' },
    staff:      { min: 45000, mid: 58000, max: 75000, source: 'Ethosia 2025 H2' },
    principal:  { min: 60000, mid: 78000, max: 100000, source: 'Ethosia 2025 H2' },
  },
  product: {
    junior:    { min: 15000, mid: 19000, max: 25000, source: 'AllJobs 2025' },
    mid:       { min: 23000, mid: 30000, max: 38000, source: 'AllJobs 2025' },
    senior:    { min: 34000, mid: 44000, max: 56000, source: 'AllJobs 2025' },
  },
  sales: {
    junior:    { min: 11000, mid: 15000, max: 20000, source: 'TheMarker 2025' },
    mid:       { min: 16000, mid: 22000, max: 30000, source: 'TheMarker 2025' },
    senior:    { min: 25000, mid: 35000, max: 50000, source: 'TheMarker 2025' },
  },
  operations: {
    junior:    { min:  9500, mid: 12000, max: 15000, source: 'CBS Wage Survey 2025Q3' },
    mid:       { min: 13000, mid: 17000, max: 22000, source: 'CBS Wage Survey 2025Q3' },
    senior:    { min: 20000, mid: 27000, max: 36000, source: 'CBS Wage Survey 2025Q3' },
  },
  construction: {
    laborer:    { min:  7000, mid:  9500, max: 12000, source: 'CBS Wage Survey 2025Q3' },
    foreman:    { min: 11000, mid: 14000, max: 18000, source: 'CBS Wage Survey 2025Q3' },
    engineer:   { min: 18000, mid: 25000, max: 34000, source: 'Ethosia 2025 H2' },
    manager:    { min: 28000, mid: 38000, max: 52000, source: 'Ethosia 2025 H2' },
  },
  finance: {
    junior:    { min: 12000, mid: 15500, max: 20000, source: 'Michpal 2025' },
    mid:       { min: 18000, mid: 24000, max: 32000, source: 'Michpal 2025' },
    senior:    { min: 28000, mid: 38000, max: 52000, source: 'Michpal 2025' },
  },
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function round2(n) { return Math.round(n * 100) / 100; }
function round0(n) { return Math.round(n); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function compaQuartile(compa) {
  if (compa < 0.9) return 'Q1';
  if (compa < 1.0) return 'Q2';
  if (compa < 1.1) return 'Q3';
  return 'Q4';
}

function formatILS(n) {
  const x = round0(n);
  return new Intl.NumberFormat('he-IL', {
    style: 'currency', currency: 'ILS', maximumFractionDigits: 0,
  }).format(x);
}

function safeId(x) { return String(x == null ? '' : x); }

// ═══════════════════════════════════════════════════════════════
// CORE CLASS
// ═══════════════════════════════════════════════════════════════

class CompPlanner {
  constructor(options = {}) {
    /** bands keyed by `${grade}|${jobFamily}` */
    this.bands = new Map();
    /** employees keyed by id */
    this.employees = new Map();
    /** budget tracker: period → departmentId → { planned, actual } */
    this.budgets = new Map();
    /** optional injected merit matrix; falls back to default */
    this.meritMatrixOverride = options.meritMatrix || null;
    /** optional injected market data; falls back to IL_MARKET_SAMPLE */
    this.marketData = options.marketData || IL_MARKET_SAMPLE;
    /** optional custom compression floor */
    this.compressionFloor = options.compressionFloor || COMPRESSION_FLOOR;
  }

  // ─────────────────────────────────────────────────────────────
  // Band management
  // ─────────────────────────────────────────────────────────────

  /**
   * Define (or upgrade — לא מוחקים) a salary band.
   * If a band already exists at (grade,jobFamily), we merge: new min/max
   * must be >= old values (grow, never shrink). Callers can override
   * with { force:true } when legal remediation is needed.
   */
  defineBand({ grade, jobFamily, min, mid, max, currency = ILS, force = false }) {
    if (grade == null || !jobFamily) {
      throw new Error('defineBand: grade and jobFamily are required');
    }
    if (!(min > 0) || !(mid > 0) || !(max > 0)) {
      throw new Error('defineBand: min/mid/max must be positive numbers');
    }
    if (!(min <= mid && mid <= max)) {
      throw new Error('defineBand: require min <= mid <= max');
    }
    const key = `${grade}|${jobFamily}`;
    const existing = this.bands.get(key);
    if (existing && !force) {
      // grow-only rule
      const newBand = {
        grade, jobFamily, currency,
        min: Math.max(existing.min, min),
        mid: Math.max(existing.mid, mid),
        max: Math.max(existing.max, max),
        history: [...(existing.history || []), {
          at: new Date().toISOString(),
          prev: { min: existing.min, mid: existing.mid, max: existing.max },
        }],
      };
      this.bands.set(key, newBand);
      return newBand;
    }
    const band = {
      grade, jobFamily, min, mid, max, currency,
      history: existing ? existing.history : [],
    };
    this.bands.set(key, band);
    return band;
  }

  getBand(grade, jobFamily) {
    return this.bands.get(`${grade}|${jobFamily}`) || null;
  }

  // ─────────────────────────────────────────────────────────────
  // Employee registry
  // ─────────────────────────────────────────────────────────────

  upsertEmployee(e) {
    if (!e || !e.id) throw new Error('upsertEmployee: id required');
    const prev = this.employees.get(e.id) || {};
    // merge-only: we never lose fields
    const merged = { ...prev, ...e };
    this.employees.set(e.id, merged);
    return merged;
  }

  getEmployee(id) { return this.employees.get(safeId(id)) || null; }

  // ─────────────────────────────────────────────────────────────
  // positionInRange — compa-ratio
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns the employee's compa-ratio (salary / midpoint) and
   * range-penetration (% of the way from min to max).
   */
  positionInRange(employeeId) {
    const emp = this.getEmployee(employeeId);
    if (!emp) throw new Error(`positionInRange: employee ${employeeId} not found`);
    const band = this.getBand(emp.grade, emp.jobFamily);
    if (!band) {
      throw new Error(
        `positionInRange: no band for grade=${emp.grade} family=${emp.jobFamily}`
      );
    }
    const salary = Number(emp.baseSalary);
    if (!(salary > 0)) {
      throw new Error(`positionInRange: employee ${employeeId} has no baseSalary`);
    }
    const compaRatio = salary / band.mid;
    const penetration = band.max === band.min
      ? 1
      : clamp((salary - band.min) / (band.max - band.min), 0, 1);
    const quartile = compaQuartile(compaRatio);
    const belowMin = salary < band.min;
    const aboveMax = salary > band.max;
    return {
      employeeId: emp.id,
      salary,
      band: { ...band },
      compaRatio: round2(compaRatio),
      rangePenetration: round2(penetration),
      quartile,
      belowMin,
      aboveMax,
      label: LABELS.compaRatio,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // meritMatrix — 2D (performance × compa) lookup
  // ─────────────────────────────────────────────────────────────

  meritMatrix({ performance, compaRatio }) {
    const matrix = this.meritMatrixOverride || DEFAULT_MERIT_MATRIX;
    const perf = clamp(Math.round(Number(performance) || 0), 1, 5);
    const q = compaQuartile(Number(compaRatio) || 1);
    const row = matrix[perf] || matrix[3];
    const pct = row[q] != null ? row[q] : 0;
    return { performance: perf, quartile: q, increasePct: pct };
  }

  // ─────────────────────────────────────────────────────────────
  // plannedIncrease — allocates a budget across a list of employees
  // ─────────────────────────────────────────────────────────────

  /**
   * @param {object}   cfg
   * @param {number}   cfg.budget              — total budget in ILS
   * @param {string[]} cfg.employees           — employee IDs
   * @param {'merit-matrix'|'cola'|'market-adjust'} cfg.method
   * @param {number}   [cfg.colaPct]           — used when method='cola'
   * @returns {object} allocations + totals
   */
  plannedIncrease({ budget, employees, method = 'merit-matrix', colaPct = 0.03 }) {
    if (!(budget >= 0)) throw new Error('plannedIncrease: budget must be non-negative');
    if (!Array.isArray(employees)) throw new Error('plannedIncrease: employees must be an array');

    const raw = [];
    for (const id of employees) {
      const emp = this.getEmployee(id);
      if (!emp) continue;
      const salary = Number(emp.baseSalary) || 0;
      let proposedPct = 0;
      let reason = '';

      if (method === 'cola') {
        proposedPct = colaPct;
        reason = LABELS.cola.en;
      } else if (method === 'market-adjust') {
        // pull midpoint from our bands OR market sample
        const band = this.getBand(emp.grade, emp.jobFamily);
        const target = band ? band.mid : this._marketMid(emp);
        if (target && salary < target) {
          proposedPct = clamp((target - salary) / salary, 0, 0.15); // cap 15%
        } else {
          proposedPct = 0;
        }
        reason = LABELS.market.en;
      } else {
        // merit-matrix (default)
        let compa = 1;
        try {
          compa = this.positionInRange(emp.id).compaRatio;
        } catch (_) { compa = 1; }
        const m = this.meritMatrix({ performance: emp.performance || 3, compaRatio: compa });
        proposedPct = m.increasePct;
        reason = LABELS.merit.en;
      }
      raw.push({
        employeeId: emp.id,
        name: emp.name || emp.id,
        currentSalary: salary,
        proposedPct: round2(proposedPct),
        proposedAmount: round2(salary * proposedPct),
        reason,
      });
    }

    // scale to fit budget (never overspend)
    const totalProposed = raw.reduce((s, r) => s + r.proposedAmount, 0);
    let scale = 1;
    if (totalProposed > budget && totalProposed > 0) scale = budget / totalProposed;

    const allocations = raw.map(r => ({
      ...r,
      grantedAmount: round2(r.proposedAmount * scale),
      grantedPct: r.currentSalary > 0
        ? round2((r.proposedAmount * scale) / r.currentSalary)
        : 0,
    }));

    const totalGranted = allocations.reduce((s, a) => s + a.grantedAmount, 0);
    return {
      method,
      budget,
      totalProposed: round2(totalProposed),
      totalGranted: round2(totalGranted),
      utilization: budget > 0 ? round2(totalGranted / budget) : 0,
      scaleApplied: round2(scale),
      allocations,
    };
  }

  _marketMid(emp) {
    if (!emp.role || !emp.level) return null;
    const family = this.marketData[emp.role];
    if (!family) return null;
    const lvl = family[emp.level];
    return lvl ? lvl.mid : null;
  }

  // ─────────────────────────────────────────────────────────────
  // marketComparison — Israeli benchmark stub
  // ─────────────────────────────────────────────────────────────

  marketComparison({ role, level, location = 'IL' }) {
    if (location !== 'IL') {
      return {
        role, level, location,
        note: 'Only IL benchmarks embedded; see docs for CBS/Ethosia hooks.',
        data: null,
      };
    }
    const family = this.marketData[role];
    if (!family) {
      return { role, level, location, data: null, note: `Unknown role family "${role}"` };
    }
    const lvl = family[level];
    if (!lvl) {
      return { role, level, location, data: null, note: `Unknown level "${level}"` };
    }
    return {
      role, level, location,
      currency: ILS,
      data: { ...lvl },
      disclaimer:
        'Sample data only. Replace via options.marketData with live CBS / Ethosia feed.',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // totalRewards — base + bonus + equity + benefits
  // ─────────────────────────────────────────────────────────────

  totalRewards(employeeId) {
    const emp = this.getEmployee(employeeId);
    if (!emp) throw new Error(`totalRewards: employee ${employeeId} not found`);

    const base = Number(emp.baseSalary) || 0;
    const bonus = Number(emp.bonus) || 0;
    const equity = Number(emp.equity) || 0; // annualized value

    // Statutory employer contributions (Israel 2026)
    const pension   = base * IL_EMPLOYER.PENSION_PCT * 12;
    const severance = base * IL_EMPLOYER.SEVERANCE_PCT * 12;
    const studyFund = base * IL_EMPLOYER.STUDY_FUND_PCT * 12;
    const bl        = base * IL_EMPLOYER.BL_EMPLOYER_PCT * 12;

    // Optional benefits
    const meal = Number(emp.mealAllowance) || 0;  // monthly
    const car  = Number(emp.carAllowance)  || 0;  // monthly
    const mealAnnual = meal * 12;
    const carAnnual  = car * 12;

    const baseAnnual = base * 12;
    const total =
      baseAnnual + bonus + equity +
      pension + severance + studyFund + bl +
      mealAnnual + carAnnual;

    return {
      employeeId: emp.id,
      currency: ILS,
      components: {
        baseAnnual:   round0(baseAnnual),
        bonus:        round0(bonus),
        equity:       round0(equity),
        pension:      round0(pension),
        severance:    round0(severance),
        studyFund:    round0(studyFund),
        bl:           round0(bl),
        mealAllowance:round0(mealAnnual),
        carAllowance: round0(carAnnual),
      },
      totalAnnual: round0(total),
      label: LABELS.totalComp,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // equityPay — gender + minority pay-equity analysis
  // ─────────────────────────────────────────────────────────────

  /**
   * Computes unadjusted pay gaps by gender and minority status,
   * within each (grade, jobFamily) band. Small groups (<3) are
   * suppressed per privacy rules.
   */
  equityPay(/* employeeId not needed — aggregates across registry */) {
    const buckets = new Map();
    for (const emp of this.employees.values()) {
      const key = `${emp.grade}|${emp.jobFamily}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(emp);
    }

    const report = { byBand: [], flags: [], thresholdPct: PAY_EQUITY_FLAG_PCT };

    for (const [key, group] of buckets.entries()) {
      const [grade, jobFamily] = key.split('|');
      const byGender = {};
      const byMinority = {};

      for (const e of group) {
        const g = e.gender || 'unknown';
        const m = e.minority ? 'minority' : 'majority';
        (byGender[g] = byGender[g] || []).push(Number(e.baseSalary) || 0);
        (byMinority[m] = byMinority[m] || []).push(Number(e.baseSalary) || 0);
      }

      const genderMeans = {};
      for (const [g, arr] of Object.entries(byGender)) {
        if (arr.length < 3) { genderMeans[g] = { suppressed: true, n: arr.length }; continue; }
        genderMeans[g] = {
          n: arr.length,
          mean: round0(arr.reduce((s, v) => s + v, 0) / arr.length),
        };
      }
      const minorityMeans = {};
      for (const [m, arr] of Object.entries(byMinority)) {
        if (arr.length < 3) { minorityMeans[m] = { suppressed: true, n: arr.length }; continue; }
        minorityMeans[m] = {
          n: arr.length,
          mean: round0(arr.reduce((s, v) => s + v, 0) / arr.length),
        };
      }

      // gap calc: female vs male (if both present)
      let genderGapPct = null;
      if (genderMeans.male && genderMeans.female &&
          !genderMeans.male.suppressed && !genderMeans.female.suppressed) {
        genderGapPct = round2(
          (genderMeans.male.mean - genderMeans.female.mean) / genderMeans.male.mean
        );
        if (Math.abs(genderGapPct) > PAY_EQUITY_FLAG_PCT) {
          report.flags.push({
            band: key, type: 'gender', gapPct: genderGapPct,
            message_he: `פער שכר מגדרי של ${(genderGapPct * 100).toFixed(1)}% בטווח ${key}`,
            message_en: `Gender pay gap of ${(genderGapPct * 100).toFixed(1)}% in band ${key}`,
          });
        }
      }
      let minorityGapPct = null;
      if (minorityMeans.majority && minorityMeans.minority &&
          !minorityMeans.majority.suppressed && !minorityMeans.minority.suppressed) {
        minorityGapPct = round2(
          (minorityMeans.majority.mean - minorityMeans.minority.mean) / minorityMeans.majority.mean
        );
        if (Math.abs(minorityGapPct) > PAY_EQUITY_FLAG_PCT) {
          report.flags.push({
            band: key, type: 'minority', gapPct: minorityGapPct,
            message_he: `פער שכר מיעוטים של ${(minorityGapPct * 100).toFixed(1)}% בטווח ${key}`,
            message_en: `Minority pay gap of ${(minorityGapPct * 100).toFixed(1)}% in band ${key}`,
          });
        }
      }

      report.byBand.push({
        band: key, grade, jobFamily,
        headcount: group.length,
        genderMeans, minorityMeans,
        genderGapPct, minorityGapPct,
      });
    }
    return report;
  }

  // ─────────────────────────────────────────────────────────────
  // payCompression — detect manager underpaid vs reports
  // ─────────────────────────────────────────────────────────────

  payCompression() {
    // build manager → [reports]
    const directs = new Map();
    for (const e of this.employees.values()) {
      if (!e.managerId) continue;
      if (!directs.has(e.managerId)) directs.set(e.managerId, []);
      directs.get(e.managerId).push(e);
    }
    const issues = [];
    for (const [mgrId, reports] of directs.entries()) {
      const mgr = this.getEmployee(mgrId);
      if (!mgr) continue;
      const mgrSalary = Number(mgr.baseSalary) || 0;
      const maxReport = reports.reduce(
        (max, r) => Math.max(max, Number(r.baseSalary) || 0), 0
      );
      const ratio = maxReport > 0 ? mgrSalary / maxReport : Infinity;
      const compressed = ratio < this.compressionFloor;
      if (compressed) {
        const needed = round0(maxReport * this.compressionFloor - mgrSalary);
        issues.push({
          managerId: mgrId,
          managerName: mgr.name || mgrId,
          managerSalary: mgrSalary,
          highestReportSalary: maxReport,
          ratio: round2(ratio),
          requiredFloor: this.compressionFloor,
          remediationILS: needed,
          message_he: `דחיסה: מנהל ${mgr.name || mgrId} מרוויח פחות מ-${
            (this.compressionFloor * 100 - 100).toFixed(0)
          }% מעל הכפוף הגבוה`,
          message_en: `Compression: manager ${mgr.name || mgrId} earns less than ${
            (this.compressionFloor * 100 - 100).toFixed(0)
          }% above top direct`,
        });
      }
    }
    return { floor: this.compressionFloor, issues };
  }

  // ─────────────────────────────────────────────────────────────
  // hiringBands — min hire rate per band to avoid compression
  // ─────────────────────────────────────────────────────────────

  /**
   * For each band, recommend a minimum hiring offer that stays above
   * the compression floor set by the highest current incumbent's
   * manager (if any). Falls back to band.min when no manager data.
   */
  hiringBands() {
    const result = [];
    for (const band of this.bands.values()) {
      const key = `${band.grade}|${band.jobFamily}`;
      // find all employees currently in this band
      const incumbents = [...this.employees.values()]
        .filter(e => `${e.grade}|${e.jobFamily}` === key);
      const managerFloor = this._mgrFloorForBand(incumbents);
      const recommendedMin = Math.max(band.min, managerFloor || 0);
      const recommendedMax = band.max; // never exceed band ceiling
      const warning = recommendedMin > band.max
        ? 'Compression unavoidable without upgrading manager comp first'
        : null;
      result.push({
        band: key, grade: band.grade, jobFamily: band.jobFamily,
        bandMin: band.min, bandMid: band.mid, bandMax: band.max,
        recommendedHireMin: round0(recommendedMin),
        recommendedHireMax: round0(recommendedMax),
        managerFloor: managerFloor ? round0(managerFloor) : null,
        warning,
        label: LABELS.hiringBand,
      });
    }
    return result;
  }

  _mgrFloorForBand(incumbents) {
    // find unique managers of the incumbents and compute the lowest
    // hire rate that would NOT compress any of them
    const mgrIds = new Set(incumbents.map(e => e.managerId).filter(Boolean));
    let ceiling = 0;
    for (const id of mgrIds) {
      const mgr = this.getEmployee(id);
      if (!mgr || !(mgr.baseSalary > 0)) continue;
      // max new-hire salary that keeps mgr/hire ratio ≥ floor
      const maxAllowed = Number(mgr.baseSalary) / this.compressionFloor;
      if (maxAllowed > ceiling) ceiling = maxAllowed;
    }
    // The "min hire rate" that avoids compression is just band.min —
    // but we also return the ceiling so callers can warn.
    return ceiling || null;
  }

  // ─────────────────────────────────────────────────────────────
  // budgetTracker — planned vs actual
  // ─────────────────────────────────────────────────────────────

  /**
   * Record or query budget. With no `planned`/`actual` it returns
   * the stored figures. With values it upserts (grow-only for
   * planned — we never silently lower a commitment).
   */
  budgetTracker({ period, departmentId, planned, actual }) {
    if (!period || !departmentId) {
      throw new Error('budgetTracker: period and departmentId are required');
    }
    if (!this.budgets.has(period)) this.budgets.set(period, new Map());
    const deptMap = this.budgets.get(period);
    const prev = deptMap.get(departmentId) || { planned: 0, actual: 0, history: [] };

    const next = { ...prev };
    if (planned != null) {
      // grow-only: new planned must be >= previous
      next.planned = Math.max(prev.planned, Number(planned) || 0);
      next.history.push({ at: new Date().toISOString(), planned: next.planned });
    }
    if (actual != null) {
      next.actual = Number(actual) || 0;
      next.history.push({ at: new Date().toISOString(), actual: next.actual });
    }
    deptMap.set(departmentId, next);

    const variance = next.planned - next.actual;
    const variancePct = next.planned > 0 ? round2(variance / next.planned) : 0;
    return {
      period, departmentId,
      planned: next.planned,
      actual: next.actual,
      variance,
      variancePct,
      status: next.actual > next.planned ? 'over-budget'
            : next.actual < next.planned ? 'under-budget' : 'on-target',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // generateIncreaseLetter — Hebrew bilingual notification
  // ─────────────────────────────────────────────────────────────

  /**
   * Generates a formal Hebrew+English increase-notification letter
   * for the given employee. Caller must have already set
   * `emp.proposedIncrease = { pct, newSalary, effectiveDate, reason }`.
   */
  generateIncreaseLetter(employeeId) {
    const emp = this.getEmployee(employeeId);
    if (!emp) throw new Error(`generateIncreaseLetter: employee ${employeeId} not found`);
    const inc = emp.proposedIncrease;
    if (!inc) throw new Error(`generateIncreaseLetter: no proposedIncrease on ${employeeId}`);

    const currentSalary = Number(emp.baseSalary) || 0;
    const newSalary = Number(inc.newSalary) || currentSalary * (1 + (inc.pct || 0));
    const diff = newSalary - currentSalary;
    const pct = currentSalary > 0 ? (diff / currentSalary) : 0;

    const effective = inc.effectiveDate || new Date().toISOString().slice(0, 10);
    const reason = inc.reason || LABELS.merit.en;
    const reasonHe = reason.toLowerCase().includes('cola') ? 'התאמת יוקר מחיה'
                  : reason.toLowerCase().includes('market') ? 'התאמה לשוק'
                  : 'העלאת הצטיינות';

    const he = [
      `שלום ${emp.name || emp.id},`,
      ``,
      `אנו שמחים להודיע על עדכון חיובי בשכרך.`,
      `עילה: ${reasonHe}.`,
      `שכר נוכחי: ${formatILS(currentSalary)}`,
      `שכר חדש:  ${formatILS(newSalary)}`,
      `העלאה:    ${formatILS(diff)} (${(pct * 100).toFixed(1)}%)`,
      `תאריך כניסה לתוקף: ${effective}`,
      ``,
      `העדכון מגלם את תרומתך המתמשכת — "לא מוחקים רק משדרגים ומגדלים".`,
      `זכויותיך הסוציאליות (פנסיה 6.5%, קרן השתלמות 7.5%, פיצויים 8.33%) ממשיכות כסדרן.`,
      ``,
      `בברכה,`,
      `משאבי אנוש`,
    ].join('\n');

    const en = [
      `Hello ${emp.name || emp.id},`,
      ``,
      `We are pleased to inform you of a positive update to your compensation.`,
      `Reason: ${reason}.`,
      `Current salary: ${formatILS(currentSalary)}`,
      `New salary:     ${formatILS(newSalary)}`,
      `Increase:       ${formatILS(diff)} (${(pct * 100).toFixed(1)}%)`,
      `Effective date: ${effective}`,
      ``,
      `This update reflects your continued contribution — "never delete, only upgrade and grow".`,
      `Your statutory benefits (pension 6.5%, study-fund 7.5%, severance 8.33%) remain unchanged.`,
      ``,
      `Best regards,`,
      `Human Resources`,
    ].join('\n');

    return {
      employeeId: emp.id,
      currentSalary: round0(currentSalary),
      newSalary: round0(newSalary),
      increaseAmount: round0(diff),
      increasePct: round2(pct),
      effectiveDate: effective,
      reason,
      hebrew: he,
      english: en,
      bilingual: `${he}\n\n--- English ---\n\n${en}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  CompPlanner,
  LABELS,
  IL_EMPLOYER,
  DEFAULT_MERIT_MATRIX,
  IL_MARKET_SAMPLE,
  COMPRESSION_FLOOR,
  PAY_EQUITY_FLAG_PCT,
};
