/**
 * Budget Planner — Techno-Kol Uzi Mega-ERP
 * Agent X-27 | Swarm 3B | 2026-04-11
 *
 * Zero-dependency budget planning + variance analysis engine.
 * תכנון תקציב וניתוח סטיות — ללא תלויות חיצוניות.
 *
 * Budget hierarchy (היררכיה תקציבית):
 *   Year → Quarter → Month
 *   Company → Department → Cost Center → Account
 *
 * Chart of accounts aligned to Israeli 6111 format:
 *   0100s  הכנסות          (revenue)
 *   0200s  עלות מכר         (COGS)
 *   0300s  שכר              (payroll)
 *   0400s  הוצאות הנהלה     (G&A)
 *   0500s  הוצאות מימון     (finance)
 *   0600s  הכנסות/הוצאות אחרות (other income/expenses)
 *
 * Features:
 *   1. Create budget from template or copy prior year
 *   2. Top-down allocation (company → dept → cc)
 *   3. Bottom-up rollup (cc → dept → company)
 *   4. Monthly phasing (even, weighted, custom)
 *   5. Scenarios (base / optimistic / pessimistic)
 *   6. Commitment tracking (open POs reduce available)
 *   7. Variance analysis (actual vs budget, favorable/unfavorable)
 *   8. Forecast rest-of-year (YTD extrapolation)
 *   9. Approval workflow (draft → pending → approved → locked)
 *  10. Lock after approval (with controlled re-forecast)
 *
 * RULES respected:
 *   - Zero dependencies (only node:* built-ins — and even those are optional)
 *   - Hebrew bilingual labels on every status/category
 *   - Never deletes — lock/archive only, all history preserved
 *   - Real code exercised by test/payroll/budget-planner.test.js
 *
 * Run tests:
 *   node --test test/payroll/budget-planner.test.js
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// 1. Constants — Israeli 6111 Chart of Accounts Categories
// ═══════════════════════════════════════════════════════════════════════

const ACCOUNT_CATEGORIES = Object.freeze({
  REVENUE: Object.freeze({
    code: '0100',
    range: [100, 199],
    label_he: 'הכנסות',
    label_en: 'Revenue',
    sign: +1,               // positive = favorable when over budget
  }),
  COGS: Object.freeze({
    code: '0200',
    range: [200, 299],
    label_he: 'עלות מכר',
    label_en: 'Cost of Goods Sold',
    sign: -1,               // negative = favorable when under budget
  }),
  PAYROLL: Object.freeze({
    code: '0300',
    range: [300, 399],
    label_he: 'שכר',
    label_en: 'Payroll',
    sign: -1,
  }),
  GA: Object.freeze({
    code: '0400',
    range: [400, 499],
    label_he: 'הוצאות הנהלה',
    label_en: 'G&A Expenses',
    sign: -1,
  }),
  FINANCE: Object.freeze({
    code: '0500',
    range: [500, 599],
    label_he: 'הוצאות מימון',
    label_en: 'Finance Expenses',
    sign: -1,
  }),
  OTHER: Object.freeze({
    code: '0600',
    range: [600, 699],
    label_he: 'הכנסות/הוצאות אחרות',
    label_en: 'Other Income / Expenses',
    sign: 0,                // mixed — sign depends on the sub-item
  }),
});

const SCENARIOS = Object.freeze({
  BASE: 'base',
  OPTIMISTIC: 'optimistic',
  PESSIMISTIC: 'pessimistic',
});

const SCENARIO_LABELS = Object.freeze({
  base:        { he: 'בסיס',      en: 'Base' },
  optimistic:  { he: 'אופטימי',   en: 'Optimistic' },
  pessimistic: { he: 'פסימי',     en: 'Pessimistic' },
});

const STATUS = Object.freeze({
  DRAFT:     'draft',
  PENDING:   'pending_approval',
  APPROVED:  'approved',
  LOCKED:    'locked',
  ARCHIVED:  'archived',
});

const STATUS_LABELS = Object.freeze({
  draft:             { he: 'טיוטה',         en: 'Draft' },
  pending_approval:  { he: 'ממתין לאישור',  en: 'Pending Approval' },
  approved:          { he: 'מאושר',         en: 'Approved' },
  locked:            { he: 'נעול',          en: 'Locked' },
  archived:          { he: 'בארכיון',       en: 'Archived' },
});

const VARIANCE_STATUS = Object.freeze({
  FAVORABLE:   'favorable',
  UNFAVORABLE: 'unfavorable',
  ON_TARGET:   'on_target',
});

const VARIANCE_LABELS = Object.freeze({
  favorable:   { he: 'חיובי',    en: 'Favorable' },
  unfavorable: { he: 'שלילי',    en: 'Unfavorable' },
  on_target:   { he: 'על היעד',  en: 'On Target' },
});

const PHASING_METHODS = Object.freeze({
  EVEN:    'even',
  WEIGHTED: 'weighted',   // heavier in peak months (e.g. retail Q4)
  CUSTOM:  'custom',
});

// A sane default seasonality curve (sums to 12).
// Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
const DEFAULT_WEIGHTED_PHASING = Object.freeze([
  0.80, 0.85, 1.00, 1.00, 1.05, 1.05,
  0.90, 0.90, 1.10, 1.15, 1.15, 1.05,
]);

// ═══════════════════════════════════════════════════════════════════════
// 2. Helpers
// ═══════════════════════════════════════════════════════════════════════

function _round(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function _assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function _isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function _uid(prefix) {
  // Not cryptographic — just unique within the in-memory store.
  _uid._seq = (_uid._seq || 0) + 1;
  return `${prefix}_${Date.now().toString(36)}_${_uid._seq.toString(36)}`;
}

function _monthIndex(period) {
  // Accepts "2026-01" .. "2026-12", or plain 1..12.
  if (typeof period === 'number' && period >= 1 && period <= 12) return period - 1;
  if (typeof period !== 'string') throw new Error(`invalid period: ${period}`);
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`invalid period format: ${period} (expected YYYY-MM)`);
  const mm = parseInt(m[2], 10);
  if (mm < 1 || mm > 12) throw new Error(`invalid month: ${period}`);
  return mm - 1;
}

function _periodKey(year, monthIdx) {
  const mm = String(monthIdx + 1).padStart(2, '0');
  return `${year}-${mm}`;
}

function _quarterOf(monthIdx) {
  return Math.floor(monthIdx / 3) + 1; // 1..4
}

function _categorize(account) {
  // account can be a string like "0301" or a number like 301
  let num;
  if (typeof account === 'number') num = account;
  else if (typeof account === 'string') num = parseInt(account, 10);
  else throw new Error(`invalid account: ${account}`);

  if (!Number.isFinite(num)) throw new Error(`account must be numeric: ${account}`);

  for (const key of Object.keys(ACCOUNT_CATEGORIES)) {
    const cat = ACCOUNT_CATEGORIES[key];
    if (num >= cat.range[0] && num <= cat.range[1]) return { key, ...cat };
  }
  throw new Error(`account ${account} does not map to any 6111 category`);
}

function _normalizeAccount(account) {
  if (typeof account === 'number') return String(account).padStart(4, '0');
  const s = String(account).trim();
  if (!/^\d+$/.test(s)) throw new Error(`account must be numeric string: ${account}`);
  return s.padStart(4, '0');
}

// ═══════════════════════════════════════════════════════════════════════
// 3. In-memory store (injectable for tests / production DB adapters)
// ═══════════════════════════════════════════════════════════════════════

function createStore() {
  return {
    budgets: new Map(),     // budgetId → Budget
    commitments: [],        // audit-log of commitments (append-only)
    actuals: [],            // append-only log of recorded actuals
    approvals: [],          // audit-log of approval actions
  };
}

const _defaultStore = createStore();

// ═══════════════════════════════════════════════════════════════════════
// 4. Budget construction
// ═══════════════════════════════════════════════════════════════════════

function _emptyPeriods(year) {
  const periods = {};
  for (let m = 0; m < 12; m++) periods[_periodKey(year, m)] = 0;
  return periods;
}

function _emptyLine(account) {
  return {
    account: _normalizeAccount(account),
    category: _categorize(account).key,
    periods: null,          // filled per-year
    total: 0,
  };
}

function _ensureLine(budget, costCenter, account) {
  const ccKey = costCenter || '_unallocated_';
  if (!budget.lines[ccKey]) budget.lines[ccKey] = {};
  const accKey = _normalizeAccount(account);
  if (!budget.lines[ccKey][accKey]) {
    const line = _emptyLine(account);
    line.periods = _emptyPeriods(budget.year);
    budget.lines[ccKey][accKey] = line;
  }
  return budget.lines[ccKey][accKey];
}

/**
 * createBudget({ year, template, scenario, company, store })
 *
 * template: 'empty' | 'prior-year' | array-of-seed-lines
 * Returns: budgetId (string)
 */
function createBudget(opts = {}) {
  const {
    year,
    template = 'empty',
    scenario = SCENARIOS.BASE,
    company = 'TECHNO_KOL_UZI',
    fromBudgetId = null,
    uplift_pct = 0,
    store = _defaultStore,
  } = opts;

  _assert(Number.isInteger(year) && year >= 2000 && year <= 2100,
    `year must be an integer in 2000..2100, got ${year}`);
  _assert(Object.values(SCENARIOS).includes(scenario),
    `scenario must be one of ${Object.values(SCENARIOS).join(', ')}`);

  const budgetId = _uid('BUD');
  const budget = {
    budgetId,
    year,
    scenario,
    company,
    status: STATUS.DRAFT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: null,
    lockedAt: null,
    approvals: [],
    lines: {},             // { costCenter → { account → Line } }
    phasing: PHASING_METHODS.EVEN,
    notes: [],
    template: typeof template === 'string' ? template : 'custom-seed',
  };

  // Seed from template
  if (Array.isArray(template)) {
    for (const seed of template) {
      _assert(seed.account, 'template seed requires account');
      _assert(_isFiniteNumber(seed.amount), 'template seed requires numeric amount');
      _setAnnualAmount(budget, seed.costCenter || '_unallocated_', seed.account,
        seed.amount, PHASING_METHODS.EVEN);
    }
  } else if (template === 'prior-year' && fromBudgetId) {
    const prev = store.budgets.get(fromBudgetId);
    _assert(prev, `prior budget not found: ${fromBudgetId}`);
    for (const cc of Object.keys(prev.lines)) {
      for (const acc of Object.keys(prev.lines[cc])) {
        const prevLine = prev.lines[cc][acc];
        const uplifted = prevLine.total * (1 + (uplift_pct / 100));
        _setAnnualAmount(budget, cc, acc, uplifted, PHASING_METHODS.EVEN);
      }
    }
  }

  store.budgets.set(budgetId, budget);
  return budgetId;
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Phasing helpers (annual → monthly)
// ═══════════════════════════════════════════════════════════════════════

function _applyPhasing(annualAmount, method, customCurve) {
  const monthly = new Array(12).fill(0);
  if (method === PHASING_METHODS.EVEN) {
    const per = annualAmount / 12;
    for (let m = 0; m < 12; m++) monthly[m] = _round(per, 2);
  } else if (method === PHASING_METHODS.WEIGHTED) {
    const curve = DEFAULT_WEIGHTED_PHASING;
    const sumCurve = curve.reduce((a, b) => a + b, 0);
    for (let m = 0; m < 12; m++) {
      monthly[m] = _round((annualAmount * curve[m]) / sumCurve, 2);
    }
  } else if (method === PHASING_METHODS.CUSTOM) {
    _assert(Array.isArray(customCurve) && customCurve.length === 12,
      'custom phasing requires a 12-element curve');
    const sumCurve = customCurve.reduce((a, b) => a + b, 0);
    _assert(sumCurve > 0, 'custom phasing curve must sum to > 0');
    for (let m = 0; m < 12; m++) {
      monthly[m] = _round((annualAmount * customCurve[m]) / sumCurve, 2);
    }
  } else {
    throw new Error(`unknown phasing method: ${method}`);
  }

  // Fix rounding drift: push the delta onto December.
  const dist = monthly.reduce((a, b) => a + b, 0);
  const drift = _round(annualAmount - dist, 2);
  if (drift !== 0) monthly[11] = _round(monthly[11] + drift, 2);
  return monthly;
}

function _setAnnualAmount(budget, costCenter, account, annualAmount, phasingMethod, customCurve) {
  const line = _ensureLine(budget, costCenter, account);
  const monthly = _applyPhasing(annualAmount, phasingMethod || budget.phasing, customCurve);
  line.total = 0;
  for (let m = 0; m < 12; m++) {
    line.periods[_periodKey(budget.year, m)] = monthly[m];
    line.total += monthly[m];
  }
  line.total = _round(line.total, 2);
  budget.updatedAt = new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Public mutation APIs
// ═══════════════════════════════════════════════════════════════════════

/**
 * setAmount(budgetId, account, period, amount, opts?)
 *
 * period can be:
 *   - "YYYY-MM"          → set a single month directly
 *   - "annual"           → set an annual amount and auto-phase it
 *   - "Qn" (n=1..4)      → set a quarter, spread evenly across its 3 months
 */
function setAmount(budgetId, account, period, amount, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status !== STATUS.LOCKED, 'cannot setAmount on a LOCKED budget');
  _assert(_isFiniteNumber(amount), `amount must be numeric: ${amount}`);

  const costCenter = opts.costCenter || '_unallocated_';
  const phasingMethod = opts.phasing || budget.phasing || PHASING_METHODS.EVEN;

  if (period === 'annual') {
    _setAnnualAmount(budget, costCenter, account, amount, phasingMethod, opts.curve);
    return;
  }

  const qm = /^[Qq]([1-4])$/.exec(String(period));
  if (qm) {
    const q = parseInt(qm[1], 10);
    const line = _ensureLine(budget, costCenter, account);
    const per = amount / 3;
    for (let i = 0; i < 3; i++) {
      const mIdx = (q - 1) * 3 + i;
      line.periods[_periodKey(budget.year, mIdx)] = _round(per, 2);
    }
    line.total = Object.values(line.periods).reduce((a, b) => a + b, 0);
    line.total = _round(line.total, 2);
    budget.updatedAt = new Date().toISOString();
    return;
  }

  // Direct month set
  const mIdx = _monthIndex(period);
  const key = _periodKey(budget.year, mIdx);
  const line = _ensureLine(budget, costCenter, account);
  line.periods[key] = _round(amount, 2);
  line.total = Object.values(line.periods).reduce((a, b) => a + b, 0);
  line.total = _round(line.total, 2);
  budget.updatedAt = new Date().toISOString();
}

/**
 * topDownAllocate(budgetId, {account, annual, allocation})
 *
 * allocation is a map { costCenter: percent } summing to ~100.
 * Splits the annual amount proportionally and phases with the budget's method.
 */
function topDownAllocate(budgetId, opts) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status !== STATUS.LOCKED, 'cannot allocate on LOCKED budget');
  _assert(opts.account, 'account required');
  _assert(_isFiniteNumber(opts.annual), 'annual amount required');
  _assert(opts.allocation && typeof opts.allocation === 'object', 'allocation map required');

  const total = Object.values(opts.allocation).reduce((a, b) => a + b, 0);
  _assert(total > 0, 'allocation must have positive total');

  for (const cc of Object.keys(opts.allocation)) {
    const share = (opts.allocation[cc] / total) * opts.annual;
    _setAnnualAmount(budget, cc, opts.account, share,
      opts.phasing || budget.phasing, opts.curve);
  }
}

/**
 * bottomUpRollup(budgetId) → rollup summary { company, byDept, byCostCenter, byCategory }
 * Pure reader — does not mutate.
 */
function bottomUpRollup(budgetId, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);

  const byCostCenter = {};
  const byCategory = {};
  let company = 0;

  for (const cc of Object.keys(budget.lines)) {
    let ccTotal = 0;
    const ccCats = {};
    for (const acc of Object.keys(budget.lines[cc])) {
      const line = budget.lines[cc][acc];
      ccTotal += line.total;
      const cat = line.category;
      ccCats[cat] = _round((ccCats[cat] || 0) + line.total, 2);
      byCategory[cat] = _round((byCategory[cat] || 0) + line.total, 2);
    }
    byCostCenter[cc] = {
      total: _round(ccTotal, 2),
      byCategory: ccCats,
    };
    company += ccTotal;
  }

  return {
    company: _round(company, 2),
    byCostCenter,
    byCategory,
    scenario: budget.scenario,
    year: budget.year,
  };
}

/**
 * setPhasing(budgetId, method, customCurve?) — changes default for future setAmount calls.
 */
function setPhasing(budgetId, method, customCurve, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status !== STATUS.LOCKED, 'cannot change phasing on LOCKED budget');
  _assert(Object.values(PHASING_METHODS).includes(method), `bad phasing: ${method}`);
  budget.phasing = method;
  if (method === PHASING_METHODS.CUSTOM) {
    _assert(Array.isArray(customCurve) && customCurve.length === 12, 'customCurve must be length-12');
    budget.customCurve = customCurve.slice();
  }
  budget.updatedAt = new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════
// 7. Commitments (open POs) + Actuals
// ═══════════════════════════════════════════════════════════════════════

/**
 * commit(budgetId, { account, costCenter, period, amount, reference })
 * Reserves budget against an open PO. Returns { reserved, available }.
 */
function commit(budgetId, opts) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(opts.account, 'account required');
  _assert(_isFiniteNumber(opts.amount), 'amount required');

  const period = opts.period || 'annual';
  const entry = {
    id: _uid('COM'),
    budgetId,
    account: _normalizeAccount(opts.account),
    costCenter: opts.costCenter || '_unallocated_',
    period,
    amount: _round(opts.amount, 2),
    reference: opts.reference || null,
    createdAt: new Date().toISOString(),
  };
  store.commitments.push(entry);

  const available = _calculateAvailable(store, budgetId, entry.account, entry.costCenter);
  return {
    reserved: entry.amount,
    available,
    commitmentId: entry.id,
  };
}

/**
 * actual(budgetId, { account, costCenter, period, amount, reference })
 * Posts a recorded actual. Append-only.
 */
function actual(budgetId, opts) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(opts.account, 'account required');
  _assert(_isFiniteNumber(opts.amount), 'amount required');
  _assert(opts.period, 'period required (YYYY-MM)');

  const entry = {
    id: _uid('ACT'),
    budgetId,
    account: _normalizeAccount(opts.account),
    costCenter: opts.costCenter || '_unallocated_',
    period: opts.period,
    amount: _round(opts.amount, 2),
    reference: opts.reference || null,
    createdAt: new Date().toISOString(),
  };
  store.actuals.push(entry);
  return entry;
}

function _sumCommitments(store, budgetId, account, costCenter, period) {
  const acc = _normalizeAccount(account);
  let total = 0;
  for (const c of store.commitments) {
    if (c.budgetId !== budgetId) continue;
    if (c.account !== acc) continue;
    if (costCenter && c.costCenter !== costCenter) continue;
    if (period && c.period !== period && c.period !== 'annual') continue;
    total += c.amount;
  }
  return _round(total, 2);
}

function _sumActuals(store, budgetId, account, costCenter, period) {
  const acc = _normalizeAccount(account);
  let total = 0;
  for (const a of store.actuals) {
    if (a.budgetId !== budgetId) continue;
    if (a.account !== acc) continue;
    if (costCenter && a.costCenter !== costCenter) continue;
    if (period && a.period !== period) continue;
    total += a.amount;
  }
  return _round(total, 2);
}

function _calculateAvailable(store, budgetId, account, costCenter) {
  const budget = store.budgets.get(budgetId);
  const line = (budget.lines[costCenter] || {})[_normalizeAccount(account)];
  const budgeted = line ? line.total : 0;
  const committed = _sumCommitments(store, budgetId, account, costCenter);
  const actuals = _sumActuals(store, budgetId, account, costCenter);
  return _round(budgeted - committed - actuals, 2);
}

/** Public getter: returns actuals total for a period (or annual if omitted). */
function getActuals(budgetId, period, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);

  let total = 0;
  const byAccount = {};
  for (const a of store.actuals) {
    if (a.budgetId !== budgetId) continue;
    if (period && a.period !== period) continue;
    total += a.amount;
    byAccount[a.account] = _round((byAccount[a.account] || 0) + a.amount, 2);
  }
  return {
    period: period || 'annual',
    total: _round(total, 2),
    byAccount,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 8. Variance analysis
// ═══════════════════════════════════════════════════════════════════════

function _classifyVariance(category, budgeted, actual) {
  const diff = actual - budgeted;
  const catDef = ACCOUNT_CATEGORIES[category] || ACCOUNT_CATEGORIES.GA;
  const sign = catDef.sign;

  // Tolerance band of 0.5% (or NIS 1 absolute) → on_target
  const tol = Math.max(Math.abs(budgeted) * 0.005, 1);
  if (Math.abs(diff) <= tol) return VARIANCE_STATUS.ON_TARGET;

  // Revenue (sign=+1): higher actual than budget is FAVORABLE
  // Expenses (sign=-1): lower actual than budget is FAVORABLE
  // OTHER (sign=0): we default to expense semantics
  if (sign >= 0) {
    return diff > 0 ? VARIANCE_STATUS.FAVORABLE : VARIANCE_STATUS.UNFAVORABLE;
  }
  return diff < 0 ? VARIANCE_STATUS.FAVORABLE : VARIANCE_STATUS.UNFAVORABLE;
}

/**
 * variance(budgetId, period) → { budget, actual, variance, variance_pct, status, label_he, label_en }
 *
 * period:
 *   - "YYYY-MM" → single-month variance across all accounts
 *   - "Qn"      → quarter
 *   - "annual"  → full-year
 *   - {account, costCenter, period} object for drill-down
 */
function variance(budgetId, period, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);

  // Build the set of months we care about.
  let months;
  if (period === 'annual' || period === undefined || period === null) {
    months = [];
    for (let m = 0; m < 12; m++) months.push(_periodKey(budget.year, m));
  } else if (/^[Qq][1-4]$/.test(period)) {
    const q = parseInt(period.substring(1), 10);
    months = [];
    for (let i = 0; i < 3; i++) months.push(_periodKey(budget.year, (q - 1) * 3 + i));
  } else {
    _monthIndex(period); // validates format
    months = [period];
  }

  let budgetSum = 0;
  let actualSum = 0;
  const byCategory = {};

  // Budget side
  for (const cc of Object.keys(budget.lines)) {
    if (opts.costCenter && cc !== opts.costCenter) continue;
    for (const acc of Object.keys(budget.lines[cc])) {
      if (opts.account && acc !== _normalizeAccount(opts.account)) continue;
      const line = budget.lines[cc][acc];
      let lineBudget = 0;
      for (const mk of months) lineBudget += (line.periods[mk] || 0);
      budgetSum += lineBudget;
      byCategory[line.category] = byCategory[line.category] || { budget: 0, actual: 0 };
      byCategory[line.category].budget += lineBudget;
    }
  }

  // Actual side
  for (const a of store.actuals) {
    if (a.budgetId !== budgetId) continue;
    if (!months.includes(a.period)) continue;
    if (opts.costCenter && a.costCenter !== opts.costCenter) continue;
    if (opts.account && a.account !== _normalizeAccount(opts.account)) continue;
    actualSum += a.amount;
    const cat = _categorize(a.account).key;
    byCategory[cat] = byCategory[cat] || { budget: 0, actual: 0 };
    byCategory[cat].actual += a.amount;
  }

  budgetSum = _round(budgetSum, 2);
  actualSum = _round(actualSum, 2);
  const diff = _round(actualSum - budgetSum, 2);
  const pct = budgetSum === 0
    ? (actualSum === 0 ? 0 : 100)
    : _round((diff / budgetSum) * 100, 2);

  // Overall status: roll up categories with weighted severity.
  // Simpler rule: if every category is on-target → on_target, else pick the
  // category with the largest absolute variance.
  let status = VARIANCE_STATUS.ON_TARGET;
  let maxAbs = 0;
  for (const catKey of Object.keys(byCategory)) {
    const c = byCategory[catKey];
    const s = _classifyVariance(catKey, c.budget, c.actual);
    c.variance = _round(c.actual - c.budget, 2);
    c.variance_pct = c.budget === 0 ? 0 : _round((c.variance / c.budget) * 100, 2);
    c.status = s;
    c.label_he = (ACCOUNT_CATEGORIES[catKey] || {}).label_he || catKey;
    c.label_en = (ACCOUNT_CATEGORIES[catKey] || {}).label_en || catKey;
    const abs = Math.abs(c.variance);
    if (abs > maxAbs) {
      maxAbs = abs;
      status = s;
    }
  }

  return {
    budget: budgetSum,
    actual: actualSum,
    variance: diff,
    variance_pct: pct,
    status,
    label_he: VARIANCE_LABELS[status].he,
    label_en: VARIANCE_LABELS[status].en,
    byCategory,
    period: period || 'annual',
  };
}

/**
 * varianceReport(budgetId, level) → hierarchical with roll-ups
 * level: 'company' | 'costCenter' | 'account'
 */
function varianceReport(budgetId, level = 'company', opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);

  const period = opts.period || 'annual';
  const header = variance(budgetId, period, opts);
  const report = {
    budgetId,
    year: budget.year,
    scenario: budget.scenario,
    period,
    level,
    company: header,
    rows: [],
  };

  if (level === 'company') return report;

  if (level === 'costCenter') {
    for (const cc of Object.keys(budget.lines)) {
      const v = variance(budgetId, period, { ...opts, costCenter: cc });
      report.rows.push({ costCenter: cc, ...v });
    }
    return report;
  }

  if (level === 'account') {
    for (const cc of Object.keys(budget.lines)) {
      for (const acc of Object.keys(budget.lines[cc])) {
        const v = variance(budgetId, period, { ...opts, costCenter: cc, account: acc });
        report.rows.push({ costCenter: cc, account: acc, ...v });
      }
    }
    return report;
  }

  throw new Error(`unknown level: ${level}`);
}

// ═══════════════════════════════════════════════════════════════════════
// 9. Forecast (rest-of-year)
// ═══════════════════════════════════════════════════════════════════════

/**
 * forecast(budgetId, asOf) → projection object
 *
 * Method: YTD actuals / months-elapsed × remaining-months, plus YTD actuals.
 * Returns a per-category + overall projection, plus a gap-vs-budget.
 */
function forecast(budgetId, asOf, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);

  // Determine "as of" month (1..12) within the budget year.
  let monthsElapsed;
  if (typeof asOf === 'string' && /^\d{4}-\d{2}$/.test(asOf)) {
    const parts = asOf.split('-');
    const yr = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    _assert(yr === budget.year, `asOf year ${yr} != budget year ${budget.year}`);
    monthsElapsed = mm;
  } else if (typeof asOf === 'number') {
    monthsElapsed = asOf;
  } else {
    throw new Error('asOf must be YYYY-MM or month number 1..12');
  }
  _assert(monthsElapsed >= 1 && monthsElapsed <= 12, 'asOf out of range');
  const monthsRemaining = 12 - monthsElapsed;

  // Sum YTD actuals and annual budget per category.
  const ytdMonths = [];
  for (let m = 0; m < monthsElapsed; m++) ytdMonths.push(_periodKey(budget.year, m));

  const byCategory = {};
  let ytdActualTotal = 0;
  let annualBudgetTotal = 0;

  for (const cc of Object.keys(budget.lines)) {
    for (const acc of Object.keys(budget.lines[cc])) {
      const line = budget.lines[cc][acc];
      byCategory[line.category] = byCategory[line.category] || {
        ytdActual: 0, annualBudget: 0, ytdBudget: 0,
      };
      byCategory[line.category].annualBudget += line.total;
      annualBudgetTotal += line.total;
      for (const mk of ytdMonths) {
        byCategory[line.category].ytdBudget += (line.periods[mk] || 0);
      }
    }
  }

  for (const a of store.actuals) {
    if (a.budgetId !== budgetId) continue;
    if (!ytdMonths.includes(a.period)) continue;
    const cat = _categorize(a.account).key;
    byCategory[cat] = byCategory[cat] || { ytdActual: 0, annualBudget: 0, ytdBudget: 0 };
    byCategory[cat].ytdActual += a.amount;
    ytdActualTotal += a.amount;
  }

  // Project each category: runRate × remaining + ytdActual.
  let projectedAnnual = 0;
  for (const catKey of Object.keys(byCategory)) {
    const c = byCategory[catKey];
    const runRate = monthsElapsed === 0 ? 0 : c.ytdActual / monthsElapsed;
    c.runRate = _round(runRate, 2);
    c.projection = _round(c.ytdActual + (runRate * monthsRemaining), 2);
    c.gapToBudget = _round(c.projection - c.annualBudget, 2);
    c.ytdActual = _round(c.ytdActual, 2);
    c.annualBudget = _round(c.annualBudget, 2);
    c.ytdBudget = _round(c.ytdBudget, 2);
    c.label_he = (ACCOUNT_CATEGORIES[catKey] || {}).label_he || catKey;
    c.label_en = (ACCOUNT_CATEGORIES[catKey] || {}).label_en || catKey;
    projectedAnnual += c.projection;
  }

  return {
    budgetId,
    year: budget.year,
    asOf: typeof asOf === 'string' ? asOf : _periodKey(budget.year, monthsElapsed - 1),
    monthsElapsed,
    monthsRemaining,
    ytdActual: _round(ytdActualTotal, 2),
    annualBudget: _round(annualBudgetTotal, 2),
    projectedAnnual: _round(projectedAnnual, 2),
    projectedGap: _round(projectedAnnual - annualBudgetTotal, 2),
    byCategory,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 10. Approval workflow & locking
// ═══════════════════════════════════════════════════════════════════════

function submitForApproval(budgetId, user, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status === STATUS.DRAFT, `can only submit from DRAFT (current: ${budget.status})`);
  budget.status = STATUS.PENDING;
  const entry = {
    at: new Date().toISOString(),
    action: 'submit',
    user: user || 'system',
    budgetId,
  };
  budget.approvals.push(entry);
  store.approvals.push(entry);
  return budget.status;
}

function approve(budgetId, approver, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status === STATUS.PENDING,
    `can only approve from PENDING (current: ${budget.status})`);
  _assert(approver, 'approver required');
  budget.status = STATUS.APPROVED;
  budget.approvedAt = new Date().toISOString();
  const entry = { at: budget.approvedAt, action: 'approve', user: approver, budgetId };
  budget.approvals.push(entry);
  store.approvals.push(entry);
  return budget.status;
}

function reject(budgetId, approver, reason, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status === STATUS.PENDING,
    `can only reject from PENDING (current: ${budget.status})`);
  budget.status = STATUS.DRAFT;
  const entry = {
    at: new Date().toISOString(),
    action: 'reject',
    user: approver || 'system',
    budgetId,
    reason: reason || null,
  };
  budget.approvals.push(entry);
  store.approvals.push(entry);
  return budget.status;
}

function lock(budgetId, user, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status === STATUS.APPROVED,
    `can only lock from APPROVED (current: ${budget.status})`);
  budget.status = STATUS.LOCKED;
  budget.lockedAt = new Date().toISOString();
  const entry = { at: budget.lockedAt, action: 'lock', user: user || 'system', budgetId };
  budget.approvals.push(entry);
  store.approvals.push(entry);
  return budget.status;
}

/**
 * reforecast(budgetId, user, {reason}) — controlled re-opening of a LOCKED budget.
 * We never mutate the original locked numbers — instead we clone the budget,
 * mark the clone as DRAFT, and tag the original as "archived".
 * The original's history is preserved; the new budget is returned.
 */
function reforecast(budgetId, user, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  _assert(budget.status === STATUS.LOCKED,
    `reforecast only allowed on LOCKED (current: ${budget.status})`);
  _assert(user, 'user required for reforecast');

  const newId = _uid('BUD');
  const clone = JSON.parse(JSON.stringify(budget));
  clone.budgetId = newId;
  clone.status = STATUS.DRAFT;
  clone.approvedAt = null;
  clone.lockedAt = null;
  clone.approvals = [{
    at: new Date().toISOString(),
    action: 'reforecast_clone',
    user,
    fromBudgetId: budgetId,
    reason: opts.reason || null,
  }];
  clone.notes = (clone.notes || []).concat([{
    at: new Date().toISOString(),
    text: `Re-forecast from ${budgetId} by ${user}`,
  }]);
  clone.createdAt = new Date().toISOString();
  clone.updatedAt = clone.createdAt;

  // Mark original as archived but never delete it.
  budget.status = STATUS.ARCHIVED;
  budget.archivedAt = new Date().toISOString();
  budget.approvals.push({
    at: budget.archivedAt,
    action: 'archive_for_reforecast',
    user,
    toBudgetId: newId,
  });

  store.budgets.set(newId, clone);
  return newId;
}

// ═══════════════════════════════════════════════════════════════════════
// 11. Clone / copy prior year
// ═══════════════════════════════════════════════════════════════════════

/**
 * cloneBudget(fromBudgetId, toYear, uplift_pct, opts?)
 *
 * Creates a new budget for toYear by copying fromBudgetId's structure and
 * applying the uplift percentage to every monthly amount.
 */
function cloneBudget(fromBudgetId, toYear, uplift_pct = 0, opts = {}) {
  const store = opts.store || _defaultStore;
  const src = store.budgets.get(fromBudgetId);
  _assert(src, `source budget not found: ${fromBudgetId}`);
  _assert(Number.isInteger(toYear), 'toYear must be integer');
  _assert(toYear !== src.year, `target year must differ from source year ${src.year}`);
  _assert(_isFiniteNumber(uplift_pct), 'uplift_pct must be numeric');

  const newId = createBudget({
    year: toYear,
    template: 'empty',
    scenario: src.scenario,
    company: src.company,
    store,
  });
  const clone = store.budgets.get(newId);
  clone.phasing = src.phasing;
  if (src.customCurve) clone.customCurve = src.customCurve.slice();

  const factor = 1 + (uplift_pct / 100);

  for (const cc of Object.keys(src.lines)) {
    for (const acc of Object.keys(src.lines[cc])) {
      const srcLine = src.lines[cc][acc];
      const line = _ensureLine(clone, cc, acc);
      const targetTotal = _round(srcLine.total * factor, 2);
      let total = 0;
      for (let m = 0; m < 12; m++) {
        const srcKey = _periodKey(src.year, m);
        const dstKey = _periodKey(toYear, m);
        const amt = _round((srcLine.periods[srcKey] || 0) * factor, 2);
        line.periods[dstKey] = amt;
        total += amt;
      }
      // Absorb rounding drift on December so line.total == targetTotal exactly
      const drift = _round(targetTotal - total, 2);
      if (drift !== 0) {
        const lastKey = _periodKey(toYear, 11);
        line.periods[lastKey] = _round(line.periods[lastKey] + drift, 2);
      }
      line.total = targetTotal;
    }
  }

  clone.template = `clone-from:${fromBudgetId}`;
  clone.notes.push({
    at: new Date().toISOString(),
    text: `Cloned from ${fromBudgetId} with uplift ${uplift_pct}%`,
  });
  clone.updatedAt = clone.createdAt;
  return newId;
}

// ═══════════════════════════════════════════════════════════════════════
// 12. Read helpers for the UI
// ═══════════════════════════════════════════════════════════════════════

function getBudget(budgetId, opts = {}) {
  const store = opts.store || _defaultStore;
  const budget = store.budgets.get(budgetId);
  _assert(budget, `budget not found: ${budgetId}`);
  // return a shallow copy to discourage mutation
  return JSON.parse(JSON.stringify(budget));
}

function listBudgets(opts = {}) {
  const store = opts.store || _defaultStore;
  const out = [];
  for (const b of store.budgets.values()) {
    if (opts.year && b.year !== opts.year) continue;
    if (opts.scenario && b.scenario !== opts.scenario) continue;
    if (opts.status && b.status !== opts.status) continue;
    out.push({
      budgetId: b.budgetId,
      year: b.year,
      scenario: b.scenario,
      status: b.status,
      status_he: STATUS_LABELS[b.status].he,
      status_en: STATUS_LABELS[b.status].en,
      company: b.company,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      lineCount: Object.keys(b.lines).reduce(
        (s, cc) => s + Object.keys(b.lines[cc]).length, 0),
    });
  }
  return out;
}

function getAvailable(budgetId, opts) {
  const store = opts.store || _defaultStore;
  return _calculateAvailable(store, budgetId, opts.account, opts.costCenter || '_unallocated_');
}

// ═══════════════════════════════════════════════════════════════════════
// 13. Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Constants
  ACCOUNT_CATEGORIES,
  SCENARIOS,
  SCENARIO_LABELS,
  STATUS,
  STATUS_LABELS,
  VARIANCE_STATUS,
  VARIANCE_LABELS,
  PHASING_METHODS,
  DEFAULT_WEIGHTED_PHASING,

  // Store factory (useful for isolating test state)
  createStore,

  // Core API
  createBudget,
  setAmount,
  setPhasing,
  topDownAllocate,
  bottomUpRollup,
  commit,
  actual,
  getActuals,
  variance,
  varianceReport,
  forecast,
  cloneBudget,

  // Workflow
  submitForApproval,
  approve,
  reject,
  lock,
  reforecast,

  // Read helpers
  getBudget,
  listBudgets,
  getAvailable,

  // Internal helpers (exported for tests)
  _categorize,
  _applyPhasing,
  _normalizeAccount,
  _periodKey,
  _monthIndex,
  _quarterOf,
};
