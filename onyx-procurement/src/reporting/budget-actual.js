/**
 * Budget vs Actual Engine — Techno-Kol Uzi Mega-ERP
 * מנוע השוואת תקציב מול ביצוע — טכנו-קול עוזי
 *
 * Agent Y-189 | Reporting Swarm | 2026-04-11
 *
 * Zero-dependency budget-vs-actual engine with rolling forecasts,
 * full-year outlook, owner accountability, and bilingual line items.
 *
 * Rules honored:
 *   - Node built-ins only (no npm deps)
 *   - Never deletes — all loads are additive + snapshot-preserving
 *   - Bilingual labels (Hebrew + English) on every line item and alert
 *   - Israeli fiscal year = calendar year (per tax law / פקודת מס הכנסה)
 *
 * Public surface (class BudgetActual):
 *   - loadBudget(period, lines)        // ingest budget for a fiscal period
 *   - loadActual(period, lines)        // ingest actual spend for a period
 *   - computeVariance(period, lineId)  // absolute + percent variance
 *   - ytd(throughMonth)                // year-to-date totals
 *   - fullYearOutlook(throughMonth)    // annualization + rolling forecast
 *   - ownerAssignment(lineId, owner)   // assign an accountable owner
 *   - getOwner(lineId)
 *   - alerts(thresholdPct)             // unfavorable variance alerts
 *   - report(throughMonth)             // bilingual variance report
 *   - getLine(lineId)
 *   - listLines()
 *   - history(lineId)                  // immutable audit trail
 *   - fiscalYear()                     // Israeli fiscal year helper
 *
 * Run tests:
 *   node --test test/reporting/budget-actual.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// Constants — Israeli fiscal calendar (calendar year per tax law)
// ═══════════════════════════════════════════════════════════════════════

const MONTHS = Object.freeze([
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]);

const MONTH_LABELS_HE = Object.freeze([
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]);

const DEFAULT_UNFAVORABLE_PCT = 10; // >10% unfavorable triggers alert

const SEVERITY = Object.freeze({
  INFO:     { level: 0, label_en: 'Info',     label_he: 'מידע' },
  WATCH:    { level: 1, label_en: 'Watch',    label_he: 'מעקב' },
  WARNING:  { level: 2, label_en: 'Warning',  label_he: 'אזהרה' },
  CRITICAL: { level: 3, label_en: 'Critical', label_he: 'קריטי' },
});

// Expense-like categories: overspend is UNFAVORABLE.
// Revenue-like categories: undershoot is UNFAVORABLE.
// Default direction is 'expense' when caller omits it.
const DIRECTION = Object.freeze({
  EXPENSE: 'expense', // actual > budget = unfavorable
  REVENUE: 'revenue', // actual < budget = unfavorable
});

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function _assertNumber(n, field) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new TypeError(`${field} must be a finite number, got: ${n}`);
  }
}

function _normalizePeriod(period) {
  // Accept "2026-04", "2026/04", "2026-4", 202604, {year, month}, or "APR-2026"
  if (period == null) {
    throw new TypeError('period is required');
  }
  let year, month;
  if (typeof period === 'object' && period.year && period.month) {
    year = Number(period.year);
    month = Number(period.month);
  } else if (typeof period === 'number') {
    year = Math.floor(period / 100);
    month = period % 100;
  } else {
    const s = String(period).toUpperCase().trim();
    const mIso = s.match(/^(\d{4})[-/](\d{1,2})$/);
    const mRev = s.match(/^(\d{1,2})[-/](\d{4})$/);
    const mNam = s.match(/^([A-Z]{3})[-/](\d{4})$/);
    if (mIso) {
      year = Number(mIso[1]);
      month = Number(mIso[2]);
    } else if (mRev) {
      month = Number(mRev[1]);
      year = Number(mRev[2]);
    } else if (mNam) {
      const idx = MONTHS.indexOf(mNam[1]);
      if (idx < 0) throw new RangeError(`Unknown month abbrev: ${mNam[1]}`);
      month = idx + 1;
      year = Number(mNam[2]);
    } else {
      throw new RangeError(`Unparseable period: ${period}`);
    }
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2999) {
    throw new RangeError(`Invalid fiscal year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }
  return { year, month, key: `${year}-${String(month).padStart(2, '0')}` };
}

function _round2(n) {
  return Math.round(n * 100) / 100;
}

function _pctOf(part, whole) {
  if (whole === 0) {
    if (part === 0) return 0;
    return part > 0 ? Infinity : -Infinity;
  }
  return _round2((part / whole) * 100);
}

function _classifySeverity(absPct, direction, sign) {
  // sign > 0 means overspend (or revenue shortfall depending on direction)
  // Return severity according to unfavorable magnitude.
  const unfavorable = _isUnfavorable(sign, direction);
  if (!unfavorable) return SEVERITY.INFO;
  if (absPct >= 25) return SEVERITY.CRITICAL;
  if (absPct >  10) return SEVERITY.WARNING;
  if (absPct >=  5) return SEVERITY.WATCH;
  return SEVERITY.INFO;
}

function _isUnfavorable(sign, direction) {
  // sign is (actual - budget). For expense, positive = unfavorable.
  // For revenue, negative = unfavorable.
  if (direction === DIRECTION.REVENUE) return sign < 0;
  return sign > 0;
}

function _bilingualStatus(absPct, direction, sign) {
  if (sign === 0 || absPct === 0) {
    return { label_en: 'On target', label_he: 'עמידה ביעד' };
  }
  if (_isUnfavorable(sign, direction)) {
    return { label_en: 'Unfavorable', label_he: 'חריגה לרעה' };
  }
  return { label_en: 'Favorable', label_he: 'חיסכון חיובי' };
}

// ═══════════════════════════════════════════════════════════════════════
// Class BudgetActual
// ═══════════════════════════════════════════════════════════════════════

class BudgetActual {
  /**
   * @param {object} [opts]
   * @param {number} [opts.fiscalYear] - Israeli fiscal year (calendar year)
   * @param {number} [opts.unfavorableThresholdPct=10]
   */
  constructor(opts = {}) {
    const fy = opts.fiscalYear != null ? Number(opts.fiscalYear) : new Date().getUTCFullYear();
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2999) {
      throw new RangeError(`Invalid fiscal year: ${opts.fiscalYear}`);
    }
    this._fiscalYear = fy;
    this._threshold = opts.unfavorableThresholdPct != null
      ? Number(opts.unfavorableThresholdPct)
      : DEFAULT_UNFAVORABLE_PCT;

    // lines: Map<lineId, { id, label_en, label_he, direction, owner, createdAt }>
    this._lines = new Map();
    // budget: Map<lineId, Map<periodKey, amount>>
    this._budget = new Map();
    // actual: Map<lineId, Map<periodKey, amount>>
    this._actual = new Map();
    // history: Array<{ ts, kind, periodKey, lineId, amount, source }>
    this._history = [];
    // owners: Map<lineId, { name, email, department, assignedAt }>
    this._owners = new Map();
  }

  // ─────────────────────────── Fiscal year ───────────────────────────

  fiscalYear() { return this._fiscalYear; }

  /**
   * Israeli tax law: fiscal year == calendar year for the vast majority of
   * taxpayers (סעיף 7 לפקודת מס הכנסה). Exposed here so consumers can
   * assert the alignment explicitly.
   */
  static fiscalYearFromDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${date}`);
    return d.getUTCFullYear();
  }

  static isCalendarFiscalYear() { return true; }

  // ─────────────────────────── Line registry ─────────────────────────

  /**
   * Register (or merge) a bilingual budget line.
   * Merging is additive — existing metadata is preserved unless overridden.
   */
  registerLine(line) {
    if (!line || !line.id) {
      throw new TypeError('line.id is required');
    }
    const id = String(line.id);
    const existing = this._lines.get(id) || {};
    const merged = Object.freeze({
      id,
      label_en: line.label_en || existing.label_en || id,
      label_he: line.label_he || existing.label_he || id,
      direction: line.direction || existing.direction || DIRECTION.EXPENSE,
      category:  line.category  || existing.category  || 'GENERAL',
      owner:     line.owner     || existing.owner     || null,
      createdAt: existing.createdAt || new Date().toISOString(),
    });
    this._lines.set(id, merged);
    return merged;
  }

  getLine(id) {
    const line = this._lines.get(String(id));
    return line ? { ...line } : null;
  }

  listLines() {
    return Array.from(this._lines.values()).map((l) => ({ ...l }));
  }

  // ─────────────────────────── loadBudget ────────────────────────────

  /**
   * Ingest a set of budget line amounts for a given period.
   * `lines` is an array of { id, amount, label_en?, label_he?, direction? }.
   * Additive: calling twice with overlapping lines replaces the amount for
   * that (period, line) pair but keeps the previous values in history.
   */
  loadBudget(period, lines) {
    const p = _normalizePeriod(period);
    if (p.year !== this._fiscalYear) {
      throw new RangeError(
        `period ${p.key} outside fiscal year ${this._fiscalYear}`,
      );
    }
    if (!Array.isArray(lines)) {
      throw new TypeError('lines must be an array');
    }
    const results = [];
    for (const row of lines) {
      if (!row || row.id == null) {
        throw new TypeError('each budget line requires an id');
      }
      _assertNumber(row.amount, `budget amount for ${row.id}`);
      const reg = this.registerLine(row);
      if (!this._budget.has(reg.id)) this._budget.set(reg.id, new Map());
      this._budget.get(reg.id).set(p.key, _round2(row.amount));
      this._history.push(Object.freeze({
        ts: new Date().toISOString(),
        kind: 'BUDGET',
        periodKey: p.key,
        lineId: reg.id,
        amount: _round2(row.amount),
        source: row.source || 'manual',
      }));
      results.push({ id: reg.id, periodKey: p.key, amount: _round2(row.amount) });
    }
    return results;
  }

  // ─────────────────────────── loadActual ────────────────────────────

  loadActual(period, lines) {
    const p = _normalizePeriod(period);
    if (p.year !== this._fiscalYear) {
      throw new RangeError(
        `period ${p.key} outside fiscal year ${this._fiscalYear}`,
      );
    }
    if (!Array.isArray(lines)) {
      throw new TypeError('lines must be an array');
    }
    const results = [];
    for (const row of lines) {
      if (!row || row.id == null) {
        throw new TypeError('each actual line requires an id');
      }
      _assertNumber(row.amount, `actual amount for ${row.id}`);
      // Register the line if not seen yet so actuals without a prior budget
      // still produce valid variance rows.
      const reg = this.registerLine(row);
      if (!this._actual.has(reg.id)) this._actual.set(reg.id, new Map());
      this._actual.get(reg.id).set(p.key, _round2(row.amount));
      this._history.push(Object.freeze({
        ts: new Date().toISOString(),
        kind: 'ACTUAL',
        periodKey: p.key,
        lineId: reg.id,
        amount: _round2(row.amount),
        source: row.source || 'manual',
      }));
      results.push({ id: reg.id, periodKey: p.key, amount: _round2(row.amount) });
    }
    return results;
  }

  // ─────────────────────────── Lookups ───────────────────────────────

  getBudget(lineId, period) {
    const map = this._budget.get(String(lineId));
    if (!map) return 0;
    if (period == null) {
      // Sum over all periods for this line
      let sum = 0;
      for (const v of map.values()) sum += v;
      return _round2(sum);
    }
    const p = _normalizePeriod(period);
    return _round2(map.get(p.key) || 0);
  }

  getActual(lineId, period) {
    const map = this._actual.get(String(lineId));
    if (!map) return 0;
    if (period == null) {
      let sum = 0;
      for (const v of map.values()) sum += v;
      return _round2(sum);
    }
    const p = _normalizePeriod(period);
    return _round2(map.get(p.key) || 0);
  }

  // ─────────────────────────── computeVariance ───────────────────────

  /**
   * Absolute + percent variance for a line in a specific period (or
   * full-year if period omitted).
   *
   * variance.absolute = actual - budget
   * variance.percent  = (actual - budget) / |budget| * 100
   *
   * Positive `absolute` means actual exceeded budget. For expense lines
   * that is unfavorable; for revenue lines it is favorable.
   */
  computeVariance(period, lineId) {
    // Overload: computeVariance(lineId) => full-year variance
    if (lineId === undefined && typeof period === 'string' && this._lines.has(period)) {
      return this._varianceForLine(period, null);
    }
    if (lineId === undefined) {
      // treat single-arg as period => aggregate for all lines that period
      const p = _normalizePeriod(period);
      const out = [];
      for (const id of this._lines.keys()) {
        out.push(this._varianceForLine(id, p));
      }
      return out;
    }
    const p = _normalizePeriod(period);
    return this._varianceForLine(String(lineId), p);
  }

  _varianceForLine(lineId, p) {
    const line = this._lines.get(lineId);
    if (!line) {
      throw new RangeError(`Unknown line: ${lineId}`);
    }
    const budget = p ? this.getBudget(lineId, p) : this.getBudget(lineId);
    const actual = p ? this.getActual(lineId, p) : this.getActual(lineId);
    const absolute = _round2(actual - budget);
    const percent = _pctOf(absolute, Math.abs(budget));
    const status = _bilingualStatus(Math.abs(percent), line.direction, absolute);
    const severity = _classifySeverity(Math.abs(percent), line.direction, absolute);
    return Object.freeze({
      lineId,
      periodKey: p ? p.key : 'FY',
      label_en: line.label_en,
      label_he: line.label_he,
      direction: line.direction,
      owner: this._owners.get(lineId) || line.owner || null,
      budget,
      actual,
      absolute,
      percent,
      unfavorable: _isUnfavorable(absolute, line.direction),
      status_en: status.label_en,
      status_he: status.label_he,
      severity_en: severity.label_en,
      severity_he: severity.label_he,
      severity_level: severity.level,
    });
  }

  // ─────────────────────────── YTD ───────────────────────────────────

  /**
   * Year-to-date totals through the given month (inclusive).
   * Returns per-line budget, actual, absolute + percent variance.
   */
  ytd(throughMonth) {
    const m = Number(throughMonth);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new RangeError(`throughMonth must be 1..12, got ${throughMonth}`);
    }
    const results = [];
    for (const lineId of this._lines.keys()) {
      let budget = 0;
      let actual = 0;
      for (let mm = 1; mm <= m; mm++) {
        const key = `${this._fiscalYear}-${String(mm).padStart(2, '0')}`;
        const bMap = this._budget.get(lineId);
        const aMap = this._actual.get(lineId);
        if (bMap && bMap.has(key)) budget += bMap.get(key);
        if (aMap && aMap.has(key)) actual += aMap.get(key);
      }
      const line = this._lines.get(lineId);
      const absolute = _round2(actual - budget);
      const percent = _pctOf(absolute, Math.abs(budget));
      const severity = _classifySeverity(Math.abs(percent), line.direction, absolute);
      const status = _bilingualStatus(Math.abs(percent), line.direction, absolute);
      results.push(Object.freeze({
        lineId,
        label_en: line.label_en,
        label_he: line.label_he,
        direction: line.direction,
        owner: this._owners.get(lineId) || line.owner || null,
        throughMonth: m,
        budget: _round2(budget),
        actual: _round2(actual),
        absolute,
        percent,
        unfavorable: _isUnfavorable(absolute, line.direction),
        status_en: status.label_en,
        status_he: status.label_he,
        severity_en: severity.label_en,
        severity_he: severity.label_he,
        severity_level: severity.level,
      }));
    }
    return results;
  }

  // ─────────────────────────── fullYearOutlook ───────────────────────

  /**
   * Build a full-year outlook combining:
   *   - YTD actuals through `throughMonth`
   *   - Rolling forecast for remaining months (average of the most
   *     recent `rollingWindow` months of actuals, falling back to the
   *     budgeted amount for any month lacking actuals)
   *   - Annualized projection = YTD actual * (12 / throughMonth) as
   *     a sanity cross-check
   *   - Variance vs full-year budget
   *
   * Returned per-line object is immutable.
   */
  fullYearOutlook(throughMonth, opts = {}) {
    const m = Number(throughMonth);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new RangeError(`throughMonth must be 1..12, got ${throughMonth}`);
    }
    const rollingWindow = Number(opts.rollingWindow || 3);
    if (!Number.isInteger(rollingWindow) || rollingWindow < 1) {
      throw new RangeError(`rollingWindow must be a positive integer`);
    }

    const results = [];
    for (const lineId of this._lines.keys()) {
      const line = this._lines.get(lineId);
      const bMap = this._budget.get(lineId) || new Map();
      const aMap = this._actual.get(lineId) || new Map();

      // Sum YTD actual + YTD budget
      let ytdActual = 0;
      let ytdBudget = 0;
      const monthly = [];
      for (let mm = 1; mm <= 12; mm++) {
        const key = `${this._fiscalYear}-${String(mm).padStart(2, '0')}`;
        const b = bMap.get(key) || 0;
        const a = aMap.get(key) || 0;
        monthly.push({ month: mm, budget: b, actual: a });
        if (mm <= m) {
          ytdActual += a;
          ytdBudget += b;
        }
      }

      // Rolling forecast: average of the last `rollingWindow` actual months
      // (counting only months 1..m that actually have an actual loaded).
      const recentActuals = [];
      for (let mm = m; mm >= 1 && recentActuals.length < rollingWindow; mm--) {
        const key = `${this._fiscalYear}-${String(mm).padStart(2, '0')}`;
        if (aMap.has(key)) recentActuals.push(aMap.get(key));
      }
      const rollingAvg = recentActuals.length > 0
        ? recentActuals.reduce((x, y) => x + y, 0) / recentActuals.length
        : 0;

      // Forecast remaining months: rolling avg when available,
      // else the budgeted amount for that month.
      let forecastRest = 0;
      const forecastMonthly = [];
      for (let mm = m + 1; mm <= 12; mm++) {
        const key = `${this._fiscalYear}-${String(mm).padStart(2, '0')}`;
        const monthForecast = recentActuals.length > 0
          ? rollingAvg
          : (bMap.get(key) || 0);
        forecastRest += monthForecast;
        forecastMonthly.push({ month: mm, forecast: _round2(monthForecast) });
      }

      // Annualized = YTD actual * (12 / throughMonth); used as an
      // independent sanity check against the rolling forecast.
      const annualized = m > 0 ? _round2(ytdActual * (12 / m)) : 0;

      const fullYearBudget = _round2(
        Array.from(bMap.values()).reduce((x, y) => x + y, 0),
      );
      const projectedFullYear = _round2(ytdActual + forecastRest);
      const absolute = _round2(projectedFullYear - fullYearBudget);
      const percent = _pctOf(absolute, Math.abs(fullYearBudget));
      const severity = _classifySeverity(Math.abs(percent), line.direction, absolute);
      const status = _bilingualStatus(Math.abs(percent), line.direction, absolute);

      results.push(Object.freeze({
        lineId,
        label_en: line.label_en,
        label_he: line.label_he,
        direction: line.direction,
        owner: this._owners.get(lineId) || line.owner || null,
        throughMonth: m,
        fiscalYear: this._fiscalYear,
        ytdBudget: _round2(ytdBudget),
        ytdActual: _round2(ytdActual),
        rollingWindow,
        rollingAverage: _round2(rollingAvg),
        forecastRest: _round2(forecastRest),
        annualized,
        projectedFullYear,
        fullYearBudget,
        absolute,
        percent,
        unfavorable: _isUnfavorable(absolute, line.direction),
        status_en: status.label_en,
        status_he: status.label_he,
        severity_en: severity.label_en,
        severity_he: severity.label_he,
        severity_level: severity.level,
        forecastMonthly: Object.freeze(forecastMonthly),
        monthly: Object.freeze(monthly),
      }));
    }
    return results;
  }

  // ─────────────────────────── ownerAssignment ───────────────────────

  /**
   * Assign a human owner to a line. Accountable owners appear on every
   * variance row, alert, and report. Assigning a new owner NEVER deletes
   * the previous assignment — the prior assignment is preserved in
   * `history` for audit (matches the 'never delete' rule).
   */
  ownerAssignment(lineId, owner) {
    const id = String(lineId);
    if (!this._lines.has(id)) {
      throw new RangeError(`Unknown line: ${id}`);
    }
    if (!owner || !owner.name) {
      throw new TypeError('owner.name is required');
    }
    const prev = this._owners.get(id) || null;
    const next = Object.freeze({
      name: String(owner.name),
      email: owner.email ? String(owner.email) : null,
      department: owner.department ? String(owner.department) : null,
      department_he: owner.department_he ? String(owner.department_he) : null,
      assignedAt: new Date().toISOString(),
      previous: prev,
    });
    this._owners.set(id, next);
    this._history.push(Object.freeze({
      ts: next.assignedAt,
      kind: 'OWNER',
      lineId: id,
      owner: { name: next.name, email: next.email },
      previousOwner: prev ? { name: prev.name, email: prev.email } : null,
    }));
    return next;
  }

  getOwner(lineId) {
    const rec = this._owners.get(String(lineId));
    return rec ? { ...rec } : null;
  }

  // ─────────────────────────── alerts ────────────────────────────────

  /**
   * Return alerts for lines whose UNFAVORABLE variance exceeds
   * `thresholdPct` (default 10%). Evaluates YTD variance when
   * `throughMonth` is provided, else total-so-far variance.
   *
   * Pass `mode: 'outlook'` to alert against the full-year projection
   * instead of YTD.
   */
  alerts(opts = {}) {
    const thresholdPct = opts.thresholdPct != null ? Number(opts.thresholdPct) : this._threshold;
    const throughMonth = opts.throughMonth != null ? Number(opts.throughMonth) : null;
    const mode = opts.mode || 'ytd';
    if (thresholdPct < 0) {
      throw new RangeError(`thresholdPct must be >= 0`);
    }

    let rows;
    if (throughMonth != null && mode === 'outlook') {
      rows = this.fullYearOutlook(throughMonth, opts);
    } else if (throughMonth != null) {
      rows = this.ytd(throughMonth);
    } else {
      rows = Array.from(this._lines.keys()).map((id) => this._varianceForLine(id, null));
    }

    const out = [];
    for (const r of rows) {
      if (!r.unfavorable) continue;
      const pct = Math.abs(r.percent);
      const budget = r.budget != null ? r.budget : (r.ytdBudget != null ? r.ytdBudget : r.fullYearBudget);
      const actual = r.actual != null ? r.actual : (r.ytdActual != null ? r.ytdActual : r.projectedFullYear);
      if (!Number.isFinite(pct)) {
        // Zero-budget line with nonzero actual → always escalate.
        out.push(Object.freeze({
          lineId: r.lineId,
          label_en: r.label_en,
          label_he: r.label_he,
          owner: r.owner,
          budget,
          actual,
          absolute: r.absolute,
          percent: pct,
          severity_en: 'Critical',
          severity_he: 'קריטי',
          message_en: `${r.label_en}: no budget but actual spend recorded`,
          message_he: `${r.label_he}: אין תקציב אך נרשם ביצוע`,
        }));
        continue;
      }
      if (pct > thresholdPct) {
        out.push(Object.freeze({
          lineId: r.lineId,
          label_en: r.label_en,
          label_he: r.label_he,
          owner: r.owner,
          budget,
          actual,
          absolute: r.absolute,
          percent: pct,
          severity_en: r.severity_en,
          severity_he: r.severity_he,
          message_en: `${r.label_en}: unfavorable variance ${pct.toFixed(2)}% exceeds ${thresholdPct}% threshold`,
          message_he: `${r.label_he}: חריגה לרעה ${pct.toFixed(2)}% מעל סף ${thresholdPct}%`,
        }));
      }
    }
    // Sort by severity descending then percent descending
    out.sort((a, b) => (b.percent - a.percent));
    return out;
  }

  // ─────────────────────────── report ────────────────────────────────

  /**
   * Bilingual variance report. Returns a structured object that callers
   * can render as JSON, table, or print-friendly text.
   */
  report(throughMonth, opts = {}) {
    const m = Number(throughMonth);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new RangeError(`throughMonth must be 1..12, got ${throughMonth}`);
    }
    const ytd = this.ytd(m);
    const outlook = this.fullYearOutlook(m, opts);
    const alerts = this.alerts({ throughMonth: m, ...opts });
    const byId = new Map(outlook.map((r) => [r.lineId, r]));

    const lines = ytd.map((row) => {
      const o = byId.get(row.lineId) || {};
      return Object.freeze({
        lineId: row.lineId,
        label_en: row.label_en,
        label_he: row.label_he,
        owner: row.owner,
        ytdBudget: row.budget,
        ytdActual: row.actual,
        ytdVariance: row.absolute,
        ytdPct: row.percent,
        ytdStatus_en: row.status_en,
        ytdStatus_he: row.status_he,
        projectedFullYear: o.projectedFullYear,
        fullYearBudget: o.fullYearBudget,
        fullYearVariance: o.absolute,
        fullYearPct: o.percent,
        fullYearStatus_en: o.status_en,
        fullYearStatus_he: o.status_he,
        severity_en: o.severity_en,
        severity_he: o.severity_he,
      });
    });

    const totals = lines.reduce(
      (acc, l) => {
        acc.ytdBudget += l.ytdBudget || 0;
        acc.ytdActual += l.ytdActual || 0;
        acc.projectedFullYear += l.projectedFullYear || 0;
        acc.fullYearBudget += l.fullYearBudget || 0;
        return acc;
      },
      { ytdBudget: 0, ytdActual: 0, projectedFullYear: 0, fullYearBudget: 0 },
    );
    totals.ytdBudget = _round2(totals.ytdBudget);
    totals.ytdActual = _round2(totals.ytdActual);
    totals.projectedFullYear = _round2(totals.projectedFullYear);
    totals.fullYearBudget = _round2(totals.fullYearBudget);
    totals.ytdVariance = _round2(totals.ytdActual - totals.ytdBudget);
    totals.fullYearVariance = _round2(totals.projectedFullYear - totals.fullYearBudget);

    return Object.freeze({
      title_en: `Budget vs Actual — FY ${this._fiscalYear} through month ${m}`,
      title_he: `תקציב מול ביצוע — שנת כספים ${this._fiscalYear} עד חודש ${m} (${MONTH_LABELS_HE[m - 1]})`,
      fiscalYear: this._fiscalYear,
      throughMonth: m,
      generatedAt: new Date().toISOString(),
      lines: Object.freeze(lines),
      totals: Object.freeze(totals),
      alerts: Object.freeze(alerts),
    });
  }

  // ─────────────────────────── history ───────────────────────────────

  history(lineId) {
    const id = lineId != null ? String(lineId) : null;
    if (id == null) return this._history.slice();
    return this._history.filter((h) => h.lineId === id);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  BudgetActual,
  DIRECTION,
  SEVERITY,
  MONTHS,
  MONTH_LABELS_HE,
  DEFAULT_UNFAVORABLE_PCT,
  _normalizePeriod, // exported for tests
};
