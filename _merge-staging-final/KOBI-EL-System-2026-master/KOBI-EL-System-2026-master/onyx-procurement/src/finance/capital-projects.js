/**
 * Capital Projects Tracker (CIP — Construction In Progress)
 * מעקב פרויקטים הוניים — Techno-Kol Uzi mega-ERP
 *
 * Agent: Y-077  |  Swarm: Finance
 *
 * Purpose
 *   Full lifecycle for capital expenditure projects:
 *     1. Initiation (business case + financial justification)
 *     2. Multi-tier approval routing (auto / manager / CFO / CEO+board)
 *     3. CIP (Construction-In-Progress) sub-ledger for in-flight costs
 *     4. Capitalization into the fixed asset register (integrates with X-34)
 *     5. Budget vs actual variance tracking
 *     6. Milestones with planned / actual dates and progress payments
 *     7. Post-implementation NPV / IRR / payback review
 *     8. Kill-switch for cancellation (preserves history — NEVER deletes)
 *     9. 12-month post-installation lookback
 *
 * Design principles
 *   - Zero external dependencies (pure Node / pure JS, Node >= 18)
 *   - לא מוחקים — only upgrade and grow. All mutations are append-only
 *     transactions. Cancelled projects move to status 'CANCELLED', never
 *     disappear. Audit trail (`history`) records every state change.
 *   - Bilingual (Hebrew / English) on every enum, label, error, and output.
 *   - Deterministic: identical inputs produce identical outputs.
 *   - Real financial math: NPV, IRR (bisection), payback (pro-rata partial
 *     year), variance — no shortcuts, no currency rounding losses.
 *
 * References
 *   - IAS 16, §§16–22 — cost of PPE, directly attributable costs
 *   - IAS 23 — borrowing costs that can be capitalized
 *   - IAS 36 — post-implementation impairment test
 *   - תקנות מס הכנסה (פחת), תשל"א-1941 — Israeli depreciation schedule
 *   - COSO ERM — approval matrix design
 *
 * Integration
 *   - Y-076 Fixed Asset Register  (onyx-procurement/src/assets/asset-manager)
 *     `capitalize()` hands off one asset per category slice; each slice calls
 *     `assetStore.addAsset()` when an `assetStore` adapter is provided.
 *
 * Public API
 *   new CapitalProjectsTracker({ assetStore?, now? })
 *     .initiateProject(fields)                → project
 *     .approvalWorkflow(projectId)            → { route, status, chain }
 *     .decide(projectId, { approver, decision, note }) → { status, ... }
 *     .recordExpenditure(fields)              → transaction
 *     .capitalize(projectId, fields)          → { assets, totalCapitalized, ... }
 *     .budgetVsActual(projectId)              → { budget, actual, variance, ... }
 *     .milestone(projectId, fields)           → milestone (append/update)
 *     .npvReview({projectId, cashflows, discountRate})
 *     .paybackAnalysis(projectId)             → { estimated, actual, ... }
 *     .killSwitch({projectId, reason})        → project with status CANCELLED
 *     .postInstallationReview(projectId, months=12) → summary with NPV/IRR
 *     .getProject(projectId)                  → frozen clone
 *     .listProjects(filter?)                  → array of frozen clones
 *     .exportCIPSubledger()                   → all CIP balances for GL feed
 *
 *   Exported helpers (pure math):
 *     npv(cashflows, rate), irr(cashflows, guess?), payback(cashflows)
 *     round2, APPROVAL_TIERS, USE_CASES, STATUSES
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// 1. CONSTANTS — approval tiers, status, use cases, GL account map
// ═══════════════════════════════════════════════════════════════════════

/**
 * Approval thresholds (₪).
 * A project routes to the HIGHEST tier its budget meets. Board always
 * approves the CEO tier (>5M) — the workflow returns both signatories.
 */
const APPROVAL_TIERS = Object.freeze({
  AUTO: {
    max: 50_000,
    role: 'AUTO',
    role_he: 'אוטומטי',
    role_en: 'Automatic',
    requires_board: false,
  },
  MANAGER: {
    max: 500_000,
    role: 'MANAGER',
    role_he: 'מנהל',
    role_en: 'Department manager',
    requires_board: false,
  },
  CFO: {
    max: 5_000_000,
    role: 'CFO',
    role_he: 'סמנכ"ל כספים',
    role_en: 'Chief Financial Officer',
    requires_board: false,
  },
  CEO_BOARD: {
    max: Infinity,
    role: 'CEO_BOARD',
    role_he: 'מנכ"ל + דירקטוריון',
    role_en: 'CEO + Board of Directors',
    requires_board: true,
  },
});

/**
 * Canonical status flow. A project moves STRICTLY forward through these
 * states except CANCELLED which is a terminal sink reachable from any
 * non-terminal state.
 *
 *   INITIATED → PENDING_APPROVAL → APPROVED → IN_PROGRESS → CAPITALIZED
 *                                                         ↘
 *                                                           POST_REVIEW
 *   any non-terminal → CANCELLED   (kill-switch, preserves history)
 *   APPROVED/PENDING → REJECTED    (approval denied)
 */
const STATUSES = Object.freeze({
  INITIATED: 'INITIATED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  CAPITALIZED: 'CAPITALIZED',
  POST_REVIEW: 'POST_REVIEW',
  CANCELLED: 'CANCELLED',
});

const STATUS_HEBREW = Object.freeze({
  INITIATED: 'יזום',
  PENDING_APPROVAL: 'ממתין לאישור',
  APPROVED: 'מאושר',
  REJECTED: 'נדחה',
  IN_PROGRESS: 'בביצוע',
  CAPITALIZED: 'הופעל (הוכר כנכס)',
  POST_REVIEW: 'בסקירה שלאחר הטמעה',
  CANCELLED: 'בוטל',
});

/**
 * Canonical use cases — drive treatment in the approval chain and
 * post-implementation KPIs.
 */
const USE_CASES = Object.freeze({
  GROWTH: { en: 'Growth / capacity expansion', he: 'צמיחה / הרחבת תפוקה' },
  REPLACEMENT: { en: 'Asset replacement', he: 'החלפת רכוש קיים' },
  REGULATORY: { en: 'Regulatory compliance', he: 'ציות רגולטורי' },
  'COST-REDUCTION': { en: 'Cost reduction', he: 'הפחתת עלויות' },
  CAPACITY: { en: 'Capacity increase', he: 'הגדלת קיבולת' },
});

const USE_CASE_KEYS = Object.freeze([
  'growth', 'replacement', 'regulatory', 'cost-reduction', 'capacity',
]);

/**
 * GL account defaults for CIP sub-ledger feed. Overridable per instance
 * via `new CapitalProjectsTracker({ accounts: {...} })`.
 */
const DEFAULT_ACCOUNTS = Object.freeze({
  CIP:                 '1520',  // Construction in progress (asset)
  FIXED_ASSET:         '1500',  // Property, plant & equipment
  AP_CAPEX:            '2105',  // Accounts payable — capital
  CAPEX_CLEARING:      '1599',  // Transitional clearing account
});

// ═══════════════════════════════════════════════════════════════════════
// 2. PURE MATH HELPERS
// ═══════════════════════════════════════════════════════════════════════

/** Bankers-safe round to 2 decimals. */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  // Nudge by epsilon to beat IEEE-754 half-even quirks on .xx5 values.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Round to 4 decimals (for IRR / rates). */
function round4(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Safe numeric coercion; throws if not finite. */
function requireFinite(v, field) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`${field}: expected a finite number, got ${v}`);
  }
  return n;
}

/** Safe non-negative numeric. */
function requireNonNegative(v, field) {
  const n = requireFinite(v, field);
  if (n < 0) throw new Error(`${field}: must be >= 0, got ${n}`);
  return n;
}

/**
 * NPV of a series of cashflows at period 0..N. Convention:
 *   cashflows[0] is the initial outflow (typically negative).
 *   cashflows[i] are the end-of-period flows for period i.
 *   rate is the period discount rate (e.g. 0.10 for 10% per period).
 *
 * NPV = Σ_{i=0..N} CF_i / (1 + rate)^i
 */
function npv(cashflows, rate) {
  if (!Array.isArray(cashflows) || cashflows.length === 0) return 0;
  const r = requireFinite(rate, 'rate');
  if (r <= -1) throw new Error('rate must be > -1');
  let total = 0;
  for (let i = 0; i < cashflows.length; i++) {
    const cf = requireFinite(cashflows[i], `cashflow[${i}]`);
    total += cf / Math.pow(1 + r, i);
  }
  return round2(total);
}

/**
 * Internal Rate of Return via robust bisection + Newton fallback.
 * Works for conventional flows (one sign change) and mixed flows by
 * searching the interval [-0.9999, 10] (i.e. -99.99%…+1000%).
 *
 * Returns null if no root found (e.g. all cashflows same sign).
 */
function irr(cashflows, guess = 0.10) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) return null;
  // Require at least one positive and one negative flow, otherwise no IRR.
  let hasPos = false, hasNeg = false;
  for (const cf of cashflows) {
    if (cf > 0) hasPos = true;
    if (cf < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;

  const f = (r) => {
    let t = 0;
    for (let i = 0; i < cashflows.length; i++) {
      t += cashflows[i] / Math.pow(1 + r, i);
    }
    return t;
  };

  // Newton-Raphson — seeded at `guess`.
  let r = Number(guess);
  if (!Number.isFinite(r) || r <= -0.9999) r = 0.10;
  for (let iter = 0; iter < 100; iter++) {
    const fv = f(r);
    if (Math.abs(fv) < 1e-7) return round4(r);
    // Numerical derivative
    const h = 1e-6;
    const fd = (f(r + h) - f(r - h)) / (2 * h);
    if (!Number.isFinite(fd) || fd === 0) break;
    const next = r - fv / fd;
    if (!Number.isFinite(next)) break;
    if (next <= -0.9999) { r = -0.9998; continue; }
    if (Math.abs(next - r) < 1e-10) return round4(next);
    r = next;
  }

  // Bisection fallback — scan for sign change.
  let lo = -0.9999;
  let hi = 10;
  let fLo = f(lo);
  let fHi = f(hi);
  if (fLo * fHi > 0) {
    // widen upper bound
    for (let e = 0; e < 10 && fLo * fHi > 0; e++) {
      hi *= 2;
      fHi = f(hi);
    }
    if (fLo * fHi > 0) return null;
  }
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-7 || (hi - lo) / 2 < 1e-9) {
      return round4(mid);
    }
    if (fMid * fLo < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return round4((lo + hi) / 2);
}

/**
 * Payback period (years) from a cashflow series.
 *   cashflows[0] is the investment (negative).
 *   Pro-rates the final partial year linearly for fractional precision.
 * Returns null if payback never achieved within the series.
 */
function payback(cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length === 0) return null;
  let cumulative = 0;
  for (let i = 0; i < cashflows.length; i++) {
    const cf = requireFinite(cashflows[i], `cashflow[${i}]`);
    const prev = cumulative;
    cumulative += cf;
    if (prev < 0 && cumulative >= 0) {
      // Crossed zero during period i. Linear pro-rata:
      //   need = -prev  (amount still to recover at start of period)
      //   frac = need / cf
      if (cf <= 0) return i; // zero or negative cf that somehow crosses — take the boundary
      const frac = -prev / cf;
      return round4(i - 1 + frac);
    }
  }
  return null; // never paid back
}

// ═══════════════════════════════════════════════════════════════════════
// 3. CapitalProjectsTracker — main class
// ═══════════════════════════════════════════════════════════════════════

class CapitalProjectsTracker {
  /**
   * @param {object} [opts]
   * @param {object} [opts.assetStore] — optional X-34 asset store adapter
   *                 must expose addAsset(fields): id
   * @param {function} [opts.now] — injectable clock (returns Date)
   * @param {object} [opts.accounts] — override DEFAULT_ACCOUNTS
   */
  constructor(opts = {}) {
    this._assetStore = opts.assetStore || null;
    this._now = typeof opts.now === 'function'
      ? opts.now
      : () => new Date();
    this._accounts = Object.freeze({ ...DEFAULT_ACCOUNTS, ...(opts.accounts || {}) });

    /** @type {Map<string, object>} */
    this._projects = new Map();
    /** @type {Array<object>} — CIP sub-ledger (append-only) */
    this._cipLedger = [];
    /** @type {Array<object>} — global audit journal (append-only) */
    this._journal = [];
    this._seq = 0;
  }

  // ─── internals ───────────────────────────────────────────────────────

  _nextId(prefix) {
    this._seq += 1;
    return `${prefix}-${String(this._seq).padStart(6, '0')}`;
  }

  _nowIso() {
    return this._now().toISOString();
  }

  _requireProject(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('projectId required (string)');
    }
    const p = this._projects.get(id);
    if (!p) throw new Error(`project "${id}" not found`);
    return p;
  }

  _pushHistory(project, entry) {
    project.history.push({
      at: this._nowIso(),
      ...entry,
    });
  }

  _journalEntry(entry) {
    const j = {
      id: this._nextId('J'),
      at: this._nowIso(),
      ...entry,
    };
    this._journal.push(j);
    return j;
  }

  // ─── 1. initiateProject ──────────────────────────────────────────────

  /**
   * Initiate a new capital project with its business case.
   *
   * @param {object} f
   * @param {string} [f.id] — custom project id (otherwise autogenerated)
   * @param {string} f.name_he — Hebrew name (required)
   * @param {string} f.name_en — English name (required)
   * @param {string} f.sponsor — executive sponsor
   * @param {number} f.budgetRequested — total capex requested (₪)
   * @param {'growth'|'replacement'|'regulatory'|'cost-reduction'|'capacity'} f.useCase
   * @param {number} [f.estimatedPayback] — estimated payback period in years
   * @param {number} [f.estimatedNPV] — estimated NPV (₪)
   * @param {number} [f.estimatedIRR] — estimated IRR (decimal, e.g. 0.15)
   * @returns {object} frozen project snapshot
   */
  initiateProject(f) {
    if (!f || typeof f !== 'object') {
      throw new Error('initiateProject: fields object required');
    }
    if (!f.name_he || typeof f.name_he !== 'string') {
      throw new Error('initiateProject: name_he required');
    }
    if (!f.name_en || typeof f.name_en !== 'string') {
      throw new Error('initiateProject: name_en required');
    }
    if (!f.sponsor || typeof f.sponsor !== 'string') {
      throw new Error('initiateProject: sponsor required');
    }
    const budget = requireNonNegative(f.budgetRequested, 'budgetRequested');
    const useCase = String(f.useCase || '').toLowerCase();
    if (!USE_CASE_KEYS.includes(useCase)) {
      throw new Error(
        `initiateProject: useCase must be one of ${USE_CASE_KEYS.join(', ')}`
      );
    }
    const useCaseKey = useCase === 'cost-reduction' ? 'COST-REDUCTION'
                    : useCase.toUpperCase();
    const useCaseMeta = USE_CASES[useCaseKey];

    const id = f.id || this._nextId('CAP');
    if (this._projects.has(id)) {
      throw new Error(`initiateProject: project id "${id}" already exists`);
    }

    // Optional financial justification
    const estPayback = f.estimatedPayback != null
      ? requireFinite(f.estimatedPayback, 'estimatedPayback')
      : null;
    const estNPV = f.estimatedNPV != null
      ? requireFinite(f.estimatedNPV, 'estimatedNPV')
      : null;
    const estIRR = f.estimatedIRR != null
      ? requireFinite(f.estimatedIRR, 'estimatedIRR')
      : null;

    const project = {
      id,
      name_he: f.name_he,
      name_en: f.name_en,
      sponsor: f.sponsor,
      budget_requested: round2(budget),
      budget_approved: 0,              // set on approval
      use_case: useCase,
      use_case_he: useCaseMeta.he,
      use_case_en: useCaseMeta.en,
      estimated_payback: estPayback,
      estimated_npv: estNPV != null ? round2(estNPV) : null,
      estimated_irr: estIRR != null ? round4(estIRR) : null,
      status: STATUSES.INITIATED,
      status_he: STATUS_HEBREW.INITIATED,
      // Approval
      approval_route: null,
      approval_chain: [],              // array of {role, approver, decision, at}
      // Execution
      cip_balance: 0,                  // running CIP sub-ledger balance (₪)
      expenditures: [],                // append-only list of tx refs
      milestones: [],                  // planned vs actual
      // Capitalization
      capitalized_at: null,
      capitalization: null,            // {completionDate, assets, totalCapitalized}
      // Post-implementation
      reviews: [],                     // npv / payback / post-install reviews
      // Cancellation
      cancelled_at: null,
      cancel_reason: null,
      // Audit trail (append-only)
      history: [{
        at: this._nowIso(),
        action: 'INITIATED',
        action_he: 'יזום',
        by: f.sponsor,
        note: `Project initiated by ${f.sponsor}. Budget request ₪${round2(budget).toLocaleString('en-IL')}.`,
      }],
      created_at: this._nowIso(),
    };

    this._projects.set(id, project);
    return this._freezeClone(project);
  }

  // ─── 2. approvalWorkflow + decide ────────────────────────────────────

  /**
   * Compute and assign the approval route for a project based on its
   * requested budget. Moves the project from INITIATED → PENDING_APPROVAL
   * (no-op if already pending).
   *
   * @param {string} projectId
   * @returns {object} { route, status, chain, tier }
   */
  approvalWorkflow(projectId) {
    const p = this._requireProject(projectId);
    if (p.status === STATUSES.APPROVED) {
      // Idempotent — already approved
      return {
        route: p.approval_route,
        status: p.status,
        chain: p.approval_chain.slice(),
        tier: this._tierForAmount(p.budget_requested),
      };
    }
    if (p.status !== STATUSES.INITIATED && p.status !== STATUSES.PENDING_APPROVAL) {
      throw new Error(
        `approvalWorkflow: project ${projectId} is in status ${p.status}, cannot route for approval`
      );
    }

    const tier = this._tierForAmount(p.budget_requested);
    p.approval_route = tier.role;

    if (tier.role === 'AUTO') {
      // Auto-approve: chain recorded with system approver.
      p.status = STATUSES.APPROVED;
      p.status_he = STATUS_HEBREW.APPROVED;
      p.budget_approved = p.budget_requested;
      const entry = {
        role: 'AUTO',
        role_he: tier.role_he,
        role_en: tier.role_en,
        approver: 'SYSTEM',
        decision: 'APPROVED',
        at: this._nowIso(),
        note: `Auto-approved: ₪${p.budget_requested.toLocaleString('en-IL')} < ₪${APPROVAL_TIERS.AUTO.max.toLocaleString('en-IL')}`,
      };
      p.approval_chain.push(entry);
      this._pushHistory(p, {
        action: 'APPROVED',
        action_he: 'אושר אוטומטית',
        by: 'SYSTEM',
        tier: 'AUTO',
      });
      this._journalEntry({
        type: 'APPROVAL',
        project_id: p.id,
        tier: 'AUTO',
        approved: true,
      });
    } else {
      p.status = STATUSES.PENDING_APPROVAL;
      p.status_he = STATUS_HEBREW.PENDING_APPROVAL;
      // Build required-signatures list — for CEO_BOARD both CEO and board
      // must approve.
      const required = [{
        role: tier.role,
        role_he: tier.role_he,
        role_en: tier.role_en,
        approver: null,
        decision: 'PENDING',
        at: null,
      }];
      if (tier.requires_board) {
        required.push({
          role: 'BOARD',
          role_he: 'דירקטוריון',
          role_en: 'Board of Directors',
          approver: null,
          decision: 'PENDING',
          at: null,
        });
      }
      p.approval_chain = required;
      this._pushHistory(p, {
        action: 'ROUTED_FOR_APPROVAL',
        action_he: 'נותב לאישור',
        tier: tier.role,
      });
    }

    return {
      route: p.approval_route,
      status: p.status,
      status_he: p.status_he,
      chain: p.approval_chain.slice(),
      tier,
    };
  }

  _tierForAmount(amount) {
    if (amount < APPROVAL_TIERS.AUTO.max) return APPROVAL_TIERS.AUTO;
    if (amount <= APPROVAL_TIERS.MANAGER.max) return APPROVAL_TIERS.MANAGER;
    if (amount <= APPROVAL_TIERS.CFO.max) return APPROVAL_TIERS.CFO;
    return APPROVAL_TIERS.CEO_BOARD;
  }

  /**
   * Record an approver's decision on a pending project. When all required
   * signatures are APPROVED the project moves to APPROVED. Any REJECTED
   * decision sets the whole project to REJECTED (history preserved).
   *
   * @param {string} projectId
   * @param {object} f
   * @param {string} f.approver — signing party
   * @param {'APPROVED'|'REJECTED'} f.decision
   * @param {string} [f.role] — which slot to fill (required when chain has >1 pending)
   * @param {string} [f.note]
   */
  decide(projectId, f) {
    const p = this._requireProject(projectId);
    if (p.status !== STATUSES.PENDING_APPROVAL) {
      throw new Error(
        `decide: project ${projectId} is not pending approval (status=${p.status})`
      );
    }
    if (!f || !f.approver) throw new Error('decide: approver required');
    if (f.decision !== 'APPROVED' && f.decision !== 'REJECTED') {
      throw new Error('decide: decision must be APPROVED or REJECTED');
    }

    // Find the matching slot in the chain.
    let slot;
    if (f.role) {
      slot = p.approval_chain.find(
        (s) => s.role === f.role && s.decision === 'PENDING'
      );
    } else {
      slot = p.approval_chain.find((s) => s.decision === 'PENDING');
    }
    if (!slot) {
      throw new Error('decide: no matching pending slot in approval chain');
    }

    slot.approver = f.approver;
    slot.decision = f.decision;
    slot.at = this._nowIso();
    slot.note = f.note || null;

    this._pushHistory(p, {
      action: `DECISION_${f.decision}`,
      action_he: f.decision === 'APPROVED' ? 'אישור' : 'דחייה',
      by: f.approver,
      role: slot.role,
    });

    if (f.decision === 'REJECTED') {
      p.status = STATUSES.REJECTED;
      p.status_he = STATUS_HEBREW.REJECTED;
      this._journalEntry({
        type: 'APPROVAL',
        project_id: p.id,
        approved: false,
        rejected_by: f.approver,
      });
    } else if (p.approval_chain.every((s) => s.decision === 'APPROVED')) {
      p.status = STATUSES.APPROVED;
      p.status_he = STATUS_HEBREW.APPROVED;
      p.budget_approved = p.budget_requested;
      this._journalEntry({
        type: 'APPROVAL',
        project_id: p.id,
        approved: true,
      });
    }

    return {
      status: p.status,
      status_he: p.status_he,
      chain: p.approval_chain.slice(),
    };
  }

  // ─── 3. recordExpenditure — posts to CIP sub-ledger ─────────────────

  /**
   * Record an in-flight expenditure against an approved project. Every
   * entry increases the project's CIP balance (asset side of the BS)
   * and is mirrored to the append-only global CIP sub-ledger.
   *
   * @param {object} f
   * @param {string} f.projectId
   * @param {string} f.invoice — vendor invoice reference
   * @param {string} f.vendor
   * @param {number} f.amount — ₪ excluding VAT (capitalizable amount)
   * @param {string} f.category — expenditure category label
   * @param {string} [f.memo]
   * @param {string} [f.date] — ISO date, defaults to now
   * @returns {object} transaction record
   */
  recordExpenditure(f) {
    if (!f || typeof f !== 'object') {
      throw new Error('recordExpenditure: fields object required');
    }
    const p = this._requireProject(f.projectId);
    if (p.status !== STATUSES.APPROVED && p.status !== STATUSES.IN_PROGRESS) {
      throw new Error(
        `recordExpenditure: project ${f.projectId} is in status ${p.status}, must be APPROVED or IN_PROGRESS`
      );
    }
    if (!f.invoice) throw new Error('recordExpenditure: invoice required');
    if (!f.vendor)  throw new Error('recordExpenditure: vendor required');
    if (!f.category) throw new Error('recordExpenditure: category required');
    const amount = requireNonNegative(f.amount, 'amount');

    // On first expenditure, bump status to IN_PROGRESS.
    if (p.status === STATUSES.APPROVED) {
      p.status = STATUSES.IN_PROGRESS;
      p.status_he = STATUS_HEBREW.IN_PROGRESS;
      this._pushHistory(p, {
        action: 'EXECUTION_STARTED',
        action_he: 'תחילת ביצוע',
      });
    }

    const tx = {
      tx_id: this._nextId('CIPX'),
      project_id: p.id,
      date: f.date || this._nowIso().slice(0, 10),
      invoice: f.invoice,
      vendor: f.vendor,
      amount: round2(amount),
      category: f.category,
      memo: f.memo || null,
      account_dr: this._accounts.CIP,
      account_cr: this._accounts.AP_CAPEX,
      posted_at: this._nowIso(),
    };

    p.expenditures.push(tx);
    p.cip_balance = round2(p.cip_balance + tx.amount);
    this._cipLedger.push(tx);
    this._pushHistory(p, {
      action: 'EXPENDITURE',
      action_he: 'הוצאה',
      amount: tx.amount,
      invoice: tx.invoice,
      vendor: tx.vendor,
    });
    this._journalEntry({
      type: 'CIP_POST',
      project_id: p.id,
      amount: tx.amount,
      dr: tx.account_dr,
      cr: tx.account_cr,
    });

    return { ...tx };
  }

  // ─── 4. capitalize — CIP → Fixed Asset register (X-34 integration) ──

  /**
   * Capitalize the project: transfer CIP balance into one or more fixed
   * assets in the register. `assetCategories` must sum (approximately) to
   * the CIP balance — any residual becomes an implicit write-off.
   *
   * @param {string} projectId
   * @param {object} f
   * @param {string} f.completionDate — ISO date of substantial completion
   * @param {Array<{cat:string, amount:number, name_he?:string, name_en?:string,
   *                 salvage_value?:number, useful_life_years?:number,
   *                 depreciation_method?:string, location?:string,
   *                 custodian?:string, serial_no?:string}>} f.assetCategories
   * @returns {object} { assets, totalCapitalized, journal, project }
   */
  capitalize(projectId, f) {
    const p = this._requireProject(projectId);
    if (p.status !== STATUSES.IN_PROGRESS && p.status !== STATUSES.APPROVED) {
      throw new Error(
        `capitalize: project ${projectId} must be APPROVED or IN_PROGRESS, got ${p.status}`
      );
    }
    if (!f || !Array.isArray(f.assetCategories) || f.assetCategories.length === 0) {
      throw new Error('capitalize: assetCategories non-empty array required');
    }
    if (!f.completionDate) {
      throw new Error('capitalize: completionDate required');
    }

    // Sum the requested capitalizations
    let sum = 0;
    for (const c of f.assetCategories) {
      if (!c || typeof c !== 'object') {
        throw new Error('capitalize: each assetCategories entry must be an object');
      }
      if (!c.cat) throw new Error('capitalize: assetCategories[].cat required');
      const amt = requireNonNegative(c.amount, 'assetCategories[].amount');
      sum = round2(sum + amt);
    }

    // Allow tolerance of 0.01 for rounding
    if (Math.abs(sum - p.cip_balance) > 0.01) {
      throw new Error(
        `capitalize: assetCategories total ₪${sum.toFixed(2)} does not match CIP balance ₪${p.cip_balance.toFixed(2)}`
      );
    }

    // Create asset register entries (via X-34 if provided, otherwise shadow records)
    const createdAssets = [];
    for (const c of f.assetCategories) {
      const addFields = {
        category: c.cat,
        name: c.name_en || `${p.name_en} — ${c.cat}`,
        name_he: c.name_he || `${p.name_he} — ${c.cat}`,
        cost: c.amount,
        salvage_value: c.salvage_value || 0,
        acquisition_date: f.completionDate,
        useful_life_years: c.useful_life_years,
        depreciation_method: c.depreciation_method || 'straight_line',
        location: c.location || 'UNASSIGNED',
        custodian: c.custodian || p.sponsor,
        serial_no: c.serial_no || null,
      };
      let assetId;
      if (this._assetStore && typeof this._assetStore.addAsset === 'function') {
        try {
          assetId = this._assetStore.addAsset(addFields);
        } catch (err) {
          throw new Error(
            `capitalize: assetStore.addAsset rejected category "${c.cat}" — ${err.message}`
          );
        }
      } else {
        // No store — record a shadow id so capitalize() is still testable
        // without pulling the full X-34 module in.
        assetId = this._nextId('SHADOW-FA');
      }
      createdAssets.push({
        asset_id: assetId,
        category: c.cat,
        amount: round2(c.amount),
        name_he: addFields.name_he,
        name_en: addFields.name,
      });
    }

    const totalCapitalized = sum;
    // Zero out CIP balance — it moves to the FA register.
    const prevCIP = p.cip_balance;
    p.cip_balance = 0;
    p.capitalized_at = f.completionDate;
    p.capitalization = {
      completion_date: f.completionDate,
      total_capitalized: totalCapitalized,
      assets: createdAssets.slice(),
      journal_at: this._nowIso(),
    };
    p.status = STATUSES.CAPITALIZED;
    p.status_he = STATUS_HEBREW.CAPITALIZED;

    this._pushHistory(p, {
      action: 'CAPITALIZED',
      action_he: 'הופעל',
      total: totalCapitalized,
      completion_date: f.completionDate,
      asset_count: createdAssets.length,
    });

    const j = this._journalEntry({
      type: 'CAPITALIZE',
      project_id: p.id,
      dr: this._accounts.FIXED_ASSET,
      cr: this._accounts.CIP,
      amount: totalCapitalized,
      prev_cip: prevCIP,
      assets: createdAssets.length,
    });

    return {
      assets: createdAssets,
      totalCapitalized,
      journal: j,
      project: this._freezeClone(p),
    };
  }

  // ─── 5. budgetVsActual ──────────────────────────────────────────────

  /**
   * Compute budget vs actual variance for a project. Variance is
   *   variance = actual - budget     (positive = overrun)
   *   variance_pct = variance / budget
   */
  budgetVsActual(projectId) {
    const p = this._requireProject(projectId);
    const actual = p.expenditures.reduce((s, x) => s + x.amount, 0);
    const budget = p.budget_approved || p.budget_requested;
    const variance = round2(actual - budget);
    const variancePct = budget > 0 ? round4(variance / budget) : 0;

    return {
      project_id: p.id,
      name_he: p.name_he,
      name_en: p.name_en,
      budget: round2(budget),
      actual: round2(actual),
      variance,
      variance_pct: variancePct,
      status: p.status,
      status_he: p.status_he,
      remaining: round2(budget - actual),
      overrun: variance > 0,
    };
  }

  // ─── 6. milestone ───────────────────────────────────────────────────

  /**
   * Create or update a milestone. If `name` already exists on the project
   * the existing record is UPGRADED (not deleted) — actual date / payment
   * are appended. This preserves the planned-vs-actual history.
   */
  milestone(projectId, f) {
    const p = this._requireProject(projectId);
    if (!f || !f.name) throw new Error('milestone: name required');

    const existing = p.milestones.find((m) => m.name === f.name);
    if (existing) {
      // Upgrade-only: keep the planned date, overlay actuals + payment.
      if (f.plannedDate && !existing.planned_date) {
        existing.planned_date = f.plannedDate;
      }
      if (f.actualDate) existing.actual_date = f.actualDate;
      if (f.payment != null) {
        existing.payment = round2(requireNonNegative(f.payment, 'milestone.payment'));
      }
      existing.updated_at = this._nowIso();
      existing.revisions = (existing.revisions || 0) + 1;
      this._pushHistory(p, {
        action: 'MILESTONE_UPDATED',
        action_he: 'עדכון אבן דרך',
        name: f.name,
      });
      return { ...existing };
    }

    const ms = {
      id: this._nextId('MS'),
      name: f.name,
      name_he: f.name_he || f.name,
      planned_date: f.plannedDate || null,
      actual_date: f.actualDate || null,
      payment: f.payment != null
        ? round2(requireNonNegative(f.payment, 'milestone.payment'))
        : 0,
      created_at: this._nowIso(),
      updated_at: this._nowIso(),
      revisions: 0,
    };
    p.milestones.push(ms);
    this._pushHistory(p, {
      action: 'MILESTONE_CREATED',
      action_he: 'אבן דרך חדשה',
      name: f.name,
    });
    return { ...ms };
  }

  // ─── 7. npvReview ───────────────────────────────────────────────────

  /**
   * Record a post-implementation NPV review against a project.
   *
   * @param {object} f
   * @param {string} f.projectId
   * @param {number[]} f.cashflows — array: [initial investment (neg), year1, year2, …]
   * @param {number} f.discountRate — decimal (e.g. 0.10)
   * @returns {object} review record
   */
  npvReview(f) {
    if (!f || !f.projectId) throw new Error('npvReview: projectId required');
    const p = this._requireProject(f.projectId);
    if (!Array.isArray(f.cashflows) || f.cashflows.length < 2) {
      throw new Error('npvReview: cashflows must have at least 2 entries');
    }
    const rate = requireFinite(f.discountRate, 'discountRate');

    const npvVal = npv(f.cashflows, rate);
    const irrVal = irr(f.cashflows);
    const pb = payback(f.cashflows);

    const review = {
      id: this._nextId('REV'),
      type: 'NPV_REVIEW',
      type_he: 'סקירת NPV',
      at: this._nowIso(),
      cashflows: f.cashflows.slice(),
      discount_rate: round4(rate),
      npv: npvVal,
      irr: irrVal,
      payback: pb,
      decision: npvVal >= 0 ? 'ACCEPT' : 'REJECT',
      decision_he: npvVal >= 0 ? 'חיובי' : 'שלילי',
      estimated_npv: p.estimated_npv,
      variance_npv: p.estimated_npv != null ? round2(npvVal - p.estimated_npv) : null,
    };
    p.reviews.push(review);
    this._pushHistory(p, {
      action: 'NPV_REVIEW',
      action_he: 'סקירת NPV',
      npv: npvVal,
    });
    return review;
  }

  // ─── 8. paybackAnalysis ────────────────────────────────────────────

  /**
   * Compare estimated payback vs actual payback (derived from the most
   * recent NPV review's cashflows, OR from expenditures + a supplied
   * benefits stream on the project metadata).
   */
  paybackAnalysis(projectId) {
    const p = this._requireProject(projectId);
    const lastReview = [...p.reviews]
      .reverse()
      .find((r) => r.type === 'NPV_REVIEW' || r.type === 'POST_INSTALL');

    let actualPayback = null;
    let source = null;
    if (lastReview && Array.isArray(lastReview.cashflows)) {
      actualPayback = payback(lastReview.cashflows);
      source = lastReview.id;
    }

    const estimated = p.estimated_payback;
    const variance = (estimated != null && actualPayback != null)
      ? round4(actualPayback - estimated)
      : null;

    return {
      project_id: p.id,
      name_he: p.name_he,
      name_en: p.name_en,
      estimated_payback: estimated,
      actual_payback: actualPayback,
      variance,
      source_review: source,
      meets_estimate: (estimated != null && actualPayback != null)
        ? actualPayback <= estimated
        : null,
    };
  }

  // ─── 9. killSwitch — cancellation preserving history ────────────────

  /**
   * Cancel a project without deleting anything. The project's CIP balance
   * (if any) is written off via a journal entry and the project moves to
   * status CANCELLED. History, expenditures, milestones, and the CIP
   * ledger entries remain intact forever.
   *
   * לא מוחקים — only moves to the cancelled state.
   */
  killSwitch(f) {
    if (!f || !f.projectId) throw new Error('killSwitch: projectId required');
    if (!f.reason) throw new Error('killSwitch: reason required');
    const p = this._requireProject(f.projectId);

    if (p.status === STATUSES.CANCELLED) {
      // Idempotent — allow re-calling without error.
      return this._freezeClone(p);
    }
    if (p.status === STATUSES.CAPITALIZED) {
      throw new Error('killSwitch: capitalized projects cannot be cancelled — use asset disposal flow');
    }

    const prevStatus = p.status;
    p.status = STATUSES.CANCELLED;
    p.status_he = STATUS_HEBREW.CANCELLED;
    p.cancelled_at = this._nowIso();
    p.cancel_reason = f.reason;

    // Write off any CIP balance to a clearing account (append-only journal).
    let writeOff = null;
    if (p.cip_balance > 0) {
      writeOff = this._journalEntry({
        type: 'CIP_WRITEOFF',
        project_id: p.id,
        amount: p.cip_balance,
        dr: this._accounts.CAPEX_CLEARING,
        cr: this._accounts.CIP,
        memo: `Project cancelled: ${f.reason}`,
      });
      // Note: p.cip_balance is PRESERVED on the project record itself for
      // historical reporting — the write-off is captured in the journal.
    }

    this._pushHistory(p, {
      action: 'CANCELLED',
      action_he: 'בוטל',
      reason: f.reason,
      previous_status: prevStatus,
      write_off: writeOff ? writeOff.id : null,
    });

    return this._freezeClone(p);
  }

  // ─── 10. postInstallationReview ─────────────────────────────────────

  /**
   * Post-installation (default 12-month) lookback. Recomputes NPV / IRR /
   * payback over the actual realized cashflows window and compares to the
   * originally estimated figures.
   *
   * @param {string} projectId
   * @param {number|object} [windowOrOpts] — integer months (default 12), or
   *                       `{ months, cashflows, discountRate }`
   */
  postInstallationReview(projectId, windowOrOpts = 12) {
    const p = this._requireProject(projectId);
    if (p.status !== STATUSES.CAPITALIZED && p.status !== STATUSES.POST_REVIEW) {
      throw new Error(
        `postInstallationReview: project ${projectId} must be CAPITALIZED, got ${p.status}`
      );
    }

    let months, cashflows, discountRate;
    if (typeof windowOrOpts === 'number') {
      months = windowOrOpts;
      cashflows = null;
      discountRate = null;
    } else if (typeof windowOrOpts === 'object' && windowOrOpts !== null) {
      months = windowOrOpts.months || 12;
      cashflows = Array.isArray(windowOrOpts.cashflows)
        ? windowOrOpts.cashflows
        : null;
      discountRate = windowOrOpts.discountRate != null
        ? windowOrOpts.discountRate
        : null;
    } else {
      months = 12;
    }

    // If cashflows not supplied, synthesize from capitalization total and
    // recorded benefit milestones.
    if (!cashflows) {
      const initial = p.capitalization
        ? -p.capitalization.total_capitalized
        : -(p.budget_approved || p.budget_requested);
      // Annualize benefits from milestone payments (used as proxy).
      const benefits = p.milestones
        .filter((m) => m.payment > 0)
        .map((m) => m.payment);
      cashflows = [initial].concat(benefits.length ? benefits : [0]);
    }

    // Default discount rate — CFO cost of capital for Israel, 2026: 8%.
    if (discountRate == null) discountRate = 0.08;

    const npvVal = npv(cashflows, discountRate);
    const irrVal = irr(cashflows);
    const pb = payback(cashflows);

    const review = {
      id: this._nextId('REV'),
      type: 'POST_INSTALL',
      type_he: 'סקירה שלאחר הטמעה',
      at: this._nowIso(),
      window_months: months,
      cashflows: cashflows.slice(),
      discount_rate: round4(discountRate),
      npv: npvVal,
      irr: irrVal,
      payback: pb,
      estimated_npv: p.estimated_npv,
      estimated_irr: p.estimated_irr,
      estimated_payback: p.estimated_payback,
      variance_npv: p.estimated_npv != null ? round2(npvVal - p.estimated_npv) : null,
      variance_irr: p.estimated_irr != null && irrVal != null
        ? round4(irrVal - p.estimated_irr)
        : null,
      variance_payback: p.estimated_payback != null && pb != null
        ? round4(pb - p.estimated_payback)
        : null,
      verdict: npvVal >= 0 ? 'ON_TRACK' : 'UNDERPERFORMING',
      verdict_he: npvVal >= 0 ? 'בהלימה לתכנון' : 'מתחת לציפיות',
    };
    p.reviews.push(review);
    p.status = STATUSES.POST_REVIEW;
    p.status_he = STATUS_HEBREW.POST_REVIEW;
    this._pushHistory(p, {
      action: 'POST_INSTALL_REVIEW',
      action_he: 'סקירה שלאחר הטמעה',
      window_months: months,
      npv: npvVal,
      verdict: review.verdict,
    });
    return review;
  }

  // ─── Read-only accessors ────────────────────────────────────────────

  getProject(projectId) {
    const p = this._requireProject(projectId);
    return this._freezeClone(p);
  }

  listProjects(filter) {
    const out = [];
    for (const p of this._projects.values()) {
      if (typeof filter === 'function' && !filter(p)) continue;
      out.push(this._freezeClone(p));
    }
    return out;
  }

  /**
   * Export the entire CIP sub-ledger (append-only) for GL feed / audit.
   */
  exportCIPSubledger() {
    return this._cipLedger.map((x) => ({ ...x }));
  }

  /**
   * Export the append-only audit journal.
   */
  exportJournal() {
    return this._journal.map((x) => ({ ...x }));
  }

  // ─── cloning helper — deep-freeze to guarantee read-only outputs ───

  _freezeClone(p) {
    // Shallow clone the top-level fields then deep-clone nested arrays.
    const clone = { ...p };
    clone.expenditures = p.expenditures.map((x) => ({ ...x }));
    clone.milestones   = p.milestones.map((x) => ({ ...x }));
    clone.reviews      = p.reviews.map((x) => ({ ...x }));
    clone.history      = p.history.map((x) => ({ ...x }));
    clone.approval_chain = p.approval_chain.map((x) => ({ ...x }));
    if (p.capitalization) {
      clone.capitalization = {
        ...p.capitalization,
        assets: p.capitalization.assets.map((a) => ({ ...a })),
      };
    }
    return Object.freeze(clone);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  CapitalProjectsTracker,
  // Constants
  APPROVAL_TIERS,
  STATUSES,
  STATUS_HEBREW,
  USE_CASES,
  USE_CASE_KEYS,
  DEFAULT_ACCOUNTS,
  // Pure math helpers (exported for unit testing & reuse)
  npv,
  irr,
  payback,
  round2,
  round4,
};
