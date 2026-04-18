/* ============================================================================
 * ONYX Procurement — Purchase Order Approval Matrix
 * מטריצת אישור הזמנות רכש — Techno-Kol Uzi mega-ERP
 * ----------------------------------------------------------------------------
 * Agent X-38  /  Swarm 3C  /  2026-04-11
 *
 * ZERO DEPENDENCIES. Node 20+ built-ins only. CommonJS. Hebrew bilingual.
 *
 * Purpose
 * ───────
 * Deterministic, explainable approval routing for Purchase Orders across the
 * full Techno-Kol ERP. Produces an auditable chain of approvers based on:
 *
 *     Amount  (₪)          →  5 brackets
 *     Category             →  routine | strategic | capex
 *     Department           →  any tenant department
 *     Vendor risk tier     →  A | B | C | D  (A=safest)
 *     Emergency flag       →  triggers parallel notify + 48h retroactive
 *
 * Default approval flow
 * ─────────────────────
 *     ≤ ₪1,000              auto (no approval required)
 *     ₪1,001   – 5,000      manager
 *     ₪5,001   – 25,000     manager → department head
 *     ₪25,001  – 100,000    manager → dept head → CFO
 *     ₪100,001 +            manager → dept head → CFO → CEO (owner: Kobi)
 *     Capex with amount > ₪50,000 adds a board review step
 *     Emergency PO: ALL default approvers are notified in parallel and
 *                   the PO may be executed before approval, but every
 *                   approver must ratify within 48h or the PO reverts.
 *
 * Module features
 * ───────────────
 *   1.  Dynamic routing from context (amount/category/dept/risk/emergency)
 *   2.  Parallel approver groups + sequential chains
 *   3.  Substitute approver resolution (vacation coverage)
 *   4.  Delegation with full audit trail
 *   5.  Escalation on timeout (manual or auto-tick)
 *   6.  Rejection with required reason (non-empty)
 *   7.  Amendment workflow — re-routing when an approved PO is changed
 *   8.  Budget check integration hook (Agent X-27)
 *   9.  Vendor compliance check (active/approved/no debt)
 *  10.  Duplicate PO detection (same vendor+items within N days)
 *
 * Integration hooks (all optional, dependency-injected)
 * ─────────────────────────────────────────────────────
 *     notifier(event)         → X-16 Notification Center
 *     audit(entry)            → X-98 Audit Trail UI
 *     rbac.userHasRole(u, r)  → Agent 97 RBAC
 *     budget.checkBudget(po)  → Agent X-27 Budget check
 *     vendor.getStatus(vid)   → Vendor Compliance
 *     dupDetector(po, days)   → X-02 Duplicate detection
 *     clock()                 → deterministic time source for tests
 *
 * Exports
 * ───────
 *     evaluatePO(po, context)            → { required_approvers, parallel_groups,
 *                                             rules_applied, flow_type }
 *     submitForApproval(poId, opts?)     → request_id
 *     approve(requestId, userId,
 *             decision, comment, opts?)  → next_step descriptor
 *     getPendingApprovals(userId, opts?) → POs awaiting the given user
 *     delegate(fromUserId, toUserId,
 *              fromDate, toDate, opts?)  → delegation_id
 *     escalate(requestId, reason, opts?) → void
 *     getHistory(poId, opts?)            → full approval trail
 *
 *     createApprovalSystem(deps?)        → isolated instance with own store
 *                                          and integration hooks (used by
 *                                          tests & multi-tenant)
 *
 * Purity
 * ──────
 * `evaluatePO()` is a pure function over its inputs. All stateful operations
 * go through the system instance returned by `createApprovalSystem()`.
 * The top-level `submitForApproval`/`approve`/etc. wrappers use a lazily
 * created default singleton (`_defaultSystem`) so they remain usable as a
 * drop-in module API.
 *
 * ──────────────────────────────────────────────────────────────────────────── */

'use strict';

const crypto = require('node:crypto');

// ─── Constants ─────────────────────────────────────────────────────────────

const BRACKET = Object.freeze({
  AUTO:      'auto',          // ≤ 1,000
  LOW:       'low',           // 1,001 – 5,000
  MEDIUM:    'medium',        // 5,001 – 25,000
  HIGH:      'high',          // 25,001 – 100,000
  VERY_HIGH: 'very_high',     // 100,001+
});

const CATEGORY = Object.freeze({
  ROUTINE:   'routine',
  STRATEGIC: 'strategic',
  CAPEX:     'capex',
});

const RISK_TIER = Object.freeze({
  A: 'A', // Preferred vendors — safest
  B: 'B', // Standard approved
  C: 'C', // Conditional / elevated risk
  D: 'D', // Blocked or high-risk
});

const REQUEST_STATUS = Object.freeze({
  DRAFT:     'draft',
  PENDING:   'pending',
  APPROVED:  'approved',
  REJECTED:  'rejected',
  CANCELLED: 'cancelled',
  ESCALATED: 'escalated',
  RETROACTIVE_PENDING: 'retroactive_pending',
  EXPIRED:   'expired',
});

const DECISION = Object.freeze({
  APPROVE:  'approve',
  REJECT:   'reject',
  DELEGATE: 'delegate',
});

const ROLE = Object.freeze({
  MANAGER:   'manager',
  DEPT_HEAD: 'department_head',
  CFO:       'cfo',
  CEO:       'ceo',
  BOARD:     'board',
});

// Default role-holders map (can be overridden via deps.roleHolders)
// In production this would be populated from the HR directory.
const DEFAULT_ROLE_HOLDERS = Object.freeze({
  [ROLE.CEO]:  ['kobi'],         // Owner
  [ROLE.CFO]:  ['cfo_user'],
  [ROLE.BOARD]: ['board_user_1', 'board_user_2', 'board_user_3'],
});

const HOUR_MS = 60 * 60 * 1000;

// Emergency retroactive ratification window = 48 hours
const EMERGENCY_RATIFY_MS = 48 * HOUR_MS;

// Default escalation timeout per step (24h)
const DEFAULT_STEP_TIMEOUT_MS = 24 * HOUR_MS;

// Default duplicate-detection window
const DEFAULT_DUP_WINDOW_DAYS = 7;

// Board review triggered for capex > this threshold
const CAPEX_BOARD_THRESHOLD = 50000;

// ─── Hebrew ↔ English labels ───────────────────────────────────────────────

const LABELS = Object.freeze({
  [BRACKET.AUTO]:      { en: 'Auto-approved',   he: 'אושר אוטומטית' },
  [BRACKET.LOW]:       { en: 'Low',             he: 'נמוך' },
  [BRACKET.MEDIUM]:    { en: 'Medium',          he: 'בינוני' },
  [BRACKET.HIGH]:      { en: 'High',            he: 'גבוה' },
  [BRACKET.VERY_HIGH]: { en: 'Very High',       he: 'גבוה מאוד' },
  [CATEGORY.ROUTINE]:   { en: 'Routine',        he: 'שוטף' },
  [CATEGORY.STRATEGIC]: { en: 'Strategic',      he: 'אסטרטגי' },
  [CATEGORY.CAPEX]:     { en: 'Capex',          he: 'השקעה הונית' },
  [ROLE.MANAGER]:   { en: 'Manager',            he: 'מנהל ישיר' },
  [ROLE.DEPT_HEAD]: { en: 'Department head',    he: 'ראש מחלקה' },
  [ROLE.CFO]:       { en: 'CFO',                he: 'סמנכ״ל כספים' },
  [ROLE.CEO]:       { en: 'CEO (Kobi)',         he: 'מנכ״ל (קובי)' },
  [ROLE.BOARD]:     { en: 'Board review',       he: 'ביקורת דירקטוריון' },
});

function labelOf(key, lang) {
  const entry = LABELS[key];
  if (!entry) return key;
  if (lang === 'he') return entry.he;
  if (lang === 'en') return entry.en;
  return entry.en + ' / ' + entry.he;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function genId(prefix) {
  return (
    (prefix || 'id') + '_' +
    Date.now().toString(36) + '_' +
    crypto.randomBytes(6).toString('hex')
  );
}

function deepClone(o) {
  if (o == null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k of Object.keys(o)) out[k] = deepClone(o[k]);
  return out;
}

function assertNonEmptyString(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    const err = new Error('Invalid ' + name + ': must be a non-empty string');
    err.code = 'E_INVALID_INPUT';
    throw err;
  }
}

function assertPositiveNumber(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    const err = new Error('Invalid ' + name + ': must be a non-negative finite number');
    err.code = 'E_INVALID_INPUT';
    throw err;
  }
}

// ─── Bracket resolution ────────────────────────────────────────────────────

/**
 * Resolve the numeric amount into one of the five business brackets.
 * @param {number} amount ILS amount
 * @returns {string} BRACKET.*
 */
function resolveBracket(amount) {
  assertPositiveNumber(amount, 'amount');
  if (amount <= 1000)    return BRACKET.AUTO;
  if (amount <= 5000)    return BRACKET.LOW;
  if (amount <= 25000)   return BRACKET.MEDIUM;
  if (amount <= 100000)  return BRACKET.HIGH;
  return BRACKET.VERY_HIGH;
}

// ─── Core evaluator (pure) ─────────────────────────────────────────────────

/**
 * Given a PO draft + context, produce the approver chain.
 *
 * @param {object} po       { id, amount, category, department, vendor_id,
 *                            vendor_risk_tier, emergency, items, currency }
 * @param {object} [context]{ now?:number, roleHolders?:object,
 *                            department_manager_of?:fn(dept)->userId,
 *                            substitutes?:{ [uid]: { active, sub, until } } }
 *
 * @returns {object} {
 *    flow_type,               // 'auto' | 'sequential' | 'parallel'
 *    required_approvers,      // flat list of userIds in order
 *    parallel_groups,         // [[uid, uid], [uid], ...]  sequential groups of
 *                             //  parallel members
 *    steps,                   // declarative [{role, group, userIds, required}]
 *    rules_applied,           // explainable list of rule IDs triggered
 *    labels,                  // { bracket_en, bracket_he }
 *    emergency,               // boolean
 *    retroactive_deadline     // number|null  — ms timestamp
 * }
 */
function evaluatePO(po, context) {
  if (!po || typeof po !== 'object') {
    const err = new Error('evaluatePO: po is required');
    err.code = 'E_INVALID_INPUT';
    throw err;
  }
  const amount   = Number(po.amount);
  const category = po.category || CATEGORY.ROUTINE;
  const dept     = po.department || 'general';
  const vendorTier = po.vendor_risk_tier || RISK_TIER.B;
  const emergency  = !!po.emergency;
  const now        = (context && context.now) || Date.now();
  const roleHolders = Object.assign({}, DEFAULT_ROLE_HOLDERS, (context && context.roleHolders) || {});
  const deptManagerOf = (context && context.department_manager_of) || null;

  assertPositiveNumber(amount, 'po.amount');

  const bracket = resolveBracket(amount);
  const rules = [];
  const steps = [];

  // ── Rule 1: Auto-approval for trivial PO
  if (bracket === BRACKET.AUTO && !emergency && category !== CATEGORY.CAPEX) {
    rules.push('R1_AUTO_UNDER_1000');
    return freezeResult({
      flow_type: 'auto',
      required_approvers: [],
      parallel_groups: [],
      steps: [],
      rules_applied: rules,
      labels: {
        bracket_en: LABELS[bracket].en,
        bracket_he: LABELS[bracket].he,
      },
      emergency: false,
      retroactive_deadline: null,
    });
  }

  // ── Resolve the direct manager for the department
  function managerForDept() {
    if (typeof deptManagerOf === 'function') {
      const m = deptManagerOf(dept);
      if (m) return m;
    }
    return 'manager_' + dept; // deterministic fallback
  }
  function deptHeadForDept() {
    if (roleHolders['dept_head_' + dept]) return roleHolders['dept_head_' + dept];
    return ['head_' + dept]; // deterministic fallback
  }
  function resolveRole(role) {
    if (role === ROLE.MANAGER) return [managerForDept()];
    if (role === ROLE.DEPT_HEAD) return deptHeadForDept();
    if (roleHolders[role]) return roleHolders[role].slice();
    return [];
  }

  // ── Rule 2: Bracket-based sequential chain
  function push(role, required) {
    steps.push({
      role,
      group: steps.length,
      userIds: resolveRole(role),
      required: required !== false,
    });
  }

  if (bracket === BRACKET.AUTO) {
    // auto bracket but reached here due to capex/emergency — still require
    // at least a manager sign-off.
    push(ROLE.MANAGER);
    rules.push('R2a_AUTO_OVERRIDE_MANAGER');
  } else if (bracket === BRACKET.LOW) {
    push(ROLE.MANAGER);
    rules.push('R2b_LOW_MANAGER');
  } else if (bracket === BRACKET.MEDIUM) {
    push(ROLE.MANAGER);
    push(ROLE.DEPT_HEAD);
    rules.push('R2c_MEDIUM_MGR_DEPTHEAD');
  } else if (bracket === BRACKET.HIGH) {
    push(ROLE.MANAGER);
    push(ROLE.DEPT_HEAD);
    push(ROLE.CFO);
    rules.push('R2d_HIGH_MGR_DEPTHEAD_CFO');
  } else if (bracket === BRACKET.VERY_HIGH) {
    push(ROLE.MANAGER);
    push(ROLE.DEPT_HEAD);
    push(ROLE.CFO);
    push(ROLE.CEO);
    rules.push('R2e_VERY_HIGH_FULL_CHAIN');
  }

  // ── Rule 3: Capex board review above threshold
  if (category === CATEGORY.CAPEX && amount > CAPEX_BOARD_THRESHOLD) {
    push(ROLE.BOARD);
    rules.push('R3_CAPEX_BOARD_REVIEW');
  } else if (category === CATEGORY.CAPEX) {
    rules.push('R3a_CAPEX_TRACKED');
  }

  // ── Rule 4: Strategic category adds CFO for medium bracket
  if (category === CATEGORY.STRATEGIC && bracket === BRACKET.MEDIUM) {
    // promote: add CFO after dept head
    if (!steps.some((s) => s.role === ROLE.CFO)) {
      push(ROLE.CFO);
      rules.push('R4_STRATEGIC_MEDIUM_ADD_CFO');
    }
  }

  // ── Rule 5: Vendor risk tier D blocks the flow
  if (vendorTier === RISK_TIER.D) {
    rules.push('R5_VENDOR_TIER_D_BLOCKED');
    steps.length = 0;
    return freezeResult({
      flow_type: 'blocked',
      required_approvers: [],
      parallel_groups: [],
      steps: [],
      rules_applied: rules,
      labels: {
        bracket_en: LABELS[bracket].en,
        bracket_he: LABELS[bracket].he,
      },
      emergency: false,
      retroactive_deadline: null,
      blocked: true,
      block_reason: 'vendor_risk_tier_D',
      block_reason_he: 'ספק חסום (דרגת סיכון D)',
    });
  }

  // ── Rule 6: Vendor risk tier C adds CFO review
  if (vendorTier === RISK_TIER.C && !steps.some((s) => s.role === ROLE.CFO)) {
    push(ROLE.CFO);
    rules.push('R6_VENDOR_TIER_C_ADD_CFO');
  }

  // ── Rule 7: Substitute approvers (vacation coverage)
  const substitutes = (context && context.substitutes) || {};
  for (const step of steps) {
    step.userIds = step.userIds.map((uid) => {
      const sub = substitutes[uid];
      if (sub && sub.active && (!sub.until || sub.until > now)) {
        rules.push('R7_SUBSTITUTE_' + uid + '_TO_' + sub.sub);
        return sub.sub;
      }
      return uid;
    });
  }

  // ── Rule 8: Emergency flag → parallel + retroactive
  let flowType = 'sequential';
  let parallelGroups = [];
  let retroactiveDeadline = null;

  if (emergency) {
    rules.push('R8_EMERGENCY_PARALLEL_RETROACTIVE');
    flowType = 'parallel';
    // All approvers are flattened into a single parallel group
    const flat = steps.flatMap((s) => s.userIds).filter(Boolean);
    parallelGroups = flat.length > 0 ? [dedupe(flat)] : [];
    // Re-label steps as a single group
    for (const s of steps) s.group = 0;
    retroactiveDeadline = now + EMERGENCY_RATIFY_MS;
  } else {
    parallelGroups = steps.map((s) => s.userIds.slice()).filter((g) => g.length > 0);
  }

  const flat = flowType === 'parallel'
    ? (parallelGroups[0] || [])
    : steps.flatMap((s) => s.userIds).filter(Boolean);

  return freezeResult({
    flow_type: flowType,
    required_approvers: dedupe(flat),
    parallel_groups: parallelGroups,
    steps,
    rules_applied: rules,
    labels: {
      bracket_en: LABELS[bracket].en,
      bracket_he: LABELS[bracket].he,
    },
    emergency,
    retroactive_deadline: retroactiveDeadline,
  });
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

function freezeResult(r) {
  // Deep-freeze for determinism without breaking mutability we already did
  Object.freeze(r);
  if (r.labels) Object.freeze(r.labels);
  if (r.parallel_groups) r.parallel_groups.forEach(Object.freeze);
  if (r.steps) r.steps.forEach((s) => {
    if (s.userIds) Object.freeze(s.userIds);
    Object.freeze(s);
  });
  return r;
}

// ─── Approval System (stateful instance) ───────────────────────────────────

/**
 * Create an isolated approval system with its own in-memory store
 * and dependency-injected hooks. Preferred for tests and multi-tenant.
 *
 * @param {object} [deps]
 *   - notifier      (event) => void
 *   - audit         (entry) => void
 *   - rbac          { userHasRole(uid, role) => boolean }
 *   - budget        { checkBudget(po) => { ok, reason?, reason_he? } }
 *   - vendor        { getStatus(vendor_id) => { active, approved, debt, tier } }
 *   - dupDetector   (po, days) => { duplicate, of? }
 *   - clock         () => number
 *   - roleHolders   { [role]: [userIds] }
 *   - department_manager_of (dept) => userId
 *   - stepTimeoutMs number  (default 24h)
 */
function createApprovalSystem(deps) {
  deps = deps || {};
  const clock = deps.clock || Date.now;
  const notifier = deps.notifier || (() => {});
  const audit    = deps.audit    || (() => {});
  const rbac     = deps.rbac     || { userHasRole: () => true };
  const budget   = deps.budget   || null;
  const vendor   = deps.vendor   || null;
  const dupDetector = deps.dupDetector || null;
  const stepTimeoutMs = deps.stepTimeoutMs || DEFAULT_STEP_TIMEOUT_MS;
  const sysRoleHolders = deps.roleHolders || null;
  const sysDeptManagerOf = deps.department_manager_of || null;
  const sysSubstitutes = deps.substitutes || null;

  // In-memory stores — swap for a real DB in production by replacing the
  // below Map.prototype calls with your persistence layer.
  const POs      = new Map();  // poId → po
  const Requests = new Map();  // requestId → request
  const ByPo     = new Map();  // poId → requestId[]
  const Delegations = [];      // list of active delegations
  const History  = new Map();  // poId → entry[]

  // ────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────

  function logHistory(poId, entry) {
    if (!History.has(poId)) History.set(poId, []);
    const full = Object.assign({ at: clock() }, entry);
    History.get(poId).push(full);
    try { audit(Object.assign({ subject: 'po', po_id: poId }, full)); } catch (_) { /* audit failure is non-fatal */ }
  }

  function notifyStep(request, kind, extra) {
    try {
      notifier(Object.assign({
        kind,
        request_id: request.id,
        po_id: request.po_id,
        at: clock(),
      }, extra || {}));
    } catch (_) { /* non-fatal */ }
  }

  // Resolve any delegation active at time t for the given user.
  function resolveDelegate(userId, t) {
    const now = typeof t === 'number' ? t : clock();
    for (const d of Delegations) {
      if (d.from === userId && d.from_date <= now && now <= d.to_date && d.active) {
        return d.to;
      }
    }
    return null;
  }

  // Returns whether any userId in a list satisfies the approver condition
  // (either is the user, or user received delegation from them).
  function userIsApprover(userId, userIds, t) {
    if (!Array.isArray(userIds)) return false;
    for (const u of userIds) {
      if (u === userId) return true;
      const deleg = resolveDelegate(u, t);
      if (deleg === userId) return true;
    }
    return false;
  }

  // ────────────────────────────────────────────────────────────────
  // submitForApproval
  // ────────────────────────────────────────────────────────────────

  function submitForApproval(poOrId, opts) {
    opts = opts || {};
    let po;
    let poId;
    if (typeof poOrId === 'string') {
      poId = poOrId;
      po = POs.get(poId);
      if (!po) {
        const err = new Error('PO not found: ' + poId);
        err.code = 'E_PO_NOT_FOUND';
        throw err;
      }
    } else if (poOrId && typeof poOrId === 'object') {
      po = deepClone(poOrId);
      poId = po.id || genId('po');
      po.id = poId;
      POs.set(poId, po);
    } else {
      const err = new Error('submitForApproval: po or poId required');
      err.code = 'E_INVALID_INPUT';
      throw err;
    }

    // ── Integration check 1: duplicate detection
    if (dupDetector && !opts.skipDuplicateCheck) {
      const res = dupDetector(po, opts.duplicateWindowDays || DEFAULT_DUP_WINDOW_DAYS);
      if (res && res.duplicate) {
        logHistory(poId, { event: 'duplicate_detected', details: res });
        const err = new Error('Duplicate PO detected: ' + (res.of || ''));
        err.code = 'E_DUPLICATE_PO';
        err.duplicate_of = res.of;
        throw err;
      }
    }

    // ── Integration check 2: vendor compliance
    if (vendor && po.vendor_id && !opts.skipVendorCheck) {
      const v = vendor.getStatus(po.vendor_id);
      if (!v || !v.active || !v.approved || v.debt) {
        logHistory(poId, { event: 'vendor_compliance_failed', vendor: v });
        const err = new Error('Vendor compliance failed');
        err.code = 'E_VENDOR_COMPLIANCE';
        err.vendor_status = v;
        throw err;
      }
      if (v.tier && !po.vendor_risk_tier) {
        po.vendor_risk_tier = v.tier; // propagate tier
      }
    }

    // ── Integration check 3: budget
    if (budget && !opts.skipBudgetCheck) {
      const b = budget.checkBudget(po);
      if (!b || !b.ok) {
        logHistory(poId, { event: 'budget_check_failed', details: b });
        if (!po.emergency) {
          const err = new Error('Budget check failed: ' + ((b && b.reason) || 'exceeded'));
          err.code = 'E_BUDGET_EXCEEDED';
          err.budget_status = b;
          throw err;
        } else {
          // emergency: allow but flag
          logHistory(poId, { event: 'budget_exceeded_emergency_override' });
        }
      }
    }

    // ── Evaluate routing. Merge system-level resolvers with any per-call ctx.
    const baseCtx = {
      now: clock(),
      roleHolders: sysRoleHolders || undefined,
      department_manager_of: sysDeptManagerOf || undefined,
      substitutes: sysSubstitutes || undefined,
    };
    const context = Object.assign({}, baseCtx, opts.context || {});
    const plan = evaluatePO(po, context);

    if (plan.blocked) {
      logHistory(poId, { event: 'submission_blocked', reason: plan.block_reason });
      const err = new Error('PO submission blocked: ' + plan.block_reason);
      err.code = 'E_BLOCKED';
      throw err;
    }

    const requestId = genId('poreq');
    const now = clock();
    const request = {
      id: requestId,
      po_id: poId,
      plan,
      status: plan.required_approvers.length === 0
        ? REQUEST_STATUS.APPROVED
        : (plan.emergency ? REQUEST_STATUS.RETROACTIVE_PENDING : REQUEST_STATUS.PENDING),
      submitted_at: now,
      submitter: opts.submitter || po.submitter || 'unknown',
      current_step: 0,
      decisions: [],           // { userId, decision, comment, at, step, on_behalf_of? }
      step_deadlines: plan.steps.map((_, i) => now + stepTimeoutMs * (i + 1)),
      retroactive_deadline: plan.retroactive_deadline,
    };

    Requests.set(requestId, request);
    if (!ByPo.has(poId)) ByPo.set(poId, []);
    ByPo.get(poId).push(requestId);

    logHistory(poId, {
      event: 'submitted',
      request_id: requestId,
      status: request.status,
      flow_type: plan.flow_type,
      rules: plan.rules_applied,
    });

    if (request.status === REQUEST_STATUS.APPROVED) {
      logHistory(poId, { event: 'auto_approved', bracket: plan.labels.bracket_en });
    } else {
      // Notify the first step (or all, in parallel/emergency mode)
      if (plan.flow_type === 'parallel') {
        for (const uid of plan.parallel_groups[0] || []) {
          notifyStep(request, 'approval_request_parallel', { user_id: uid });
        }
      } else {
        const first = plan.steps[0];
        if (first) {
          for (const uid of first.userIds) {
            notifyStep(request, 'approval_request', { user_id: uid, step: 0, role: first.role });
          }
        }
      }
    }

    return requestId;
  }

  // ────────────────────────────────────────────────────────────────
  // approve / reject
  // ────────────────────────────────────────────────────────────────

  function approve(requestId, userId, decision, comment, opts) {
    opts = opts || {};
    const request = Requests.get(requestId);
    if (!request) {
      const err = new Error('Request not found: ' + requestId);
      err.code = 'E_REQUEST_NOT_FOUND';
      throw err;
    }

    assertNonEmptyString(userId, 'userId');
    if (decision !== DECISION.APPROVE && decision !== DECISION.REJECT) {
      const err = new Error('Invalid decision: ' + decision);
      err.code = 'E_INVALID_DECISION';
      throw err;
    }
    if (decision === DECISION.REJECT) {
      assertNonEmptyString(comment, 'comment (required on reject)');
    }

    if (request.status !== REQUEST_STATUS.PENDING &&
        request.status !== REQUEST_STATUS.RETROACTIVE_PENDING &&
        request.status !== REQUEST_STATUS.ESCALATED) {
      const err = new Error('Request is not awaiting approval: ' + request.status);
      err.code = 'E_NOT_PENDING';
      throw err;
    }

    const plan = request.plan;
    const now = clock();

    // ── Determine eligibility
    let eligibleUserIds = [];
    let currentStepIndex = request.current_step;
    let currentStep = null;

    if (plan.flow_type === 'parallel') {
      eligibleUserIds = plan.parallel_groups[0] || [];
      currentStep = { role: 'parallel', group: 0, userIds: eligibleUserIds };
    } else {
      currentStep = plan.steps[currentStepIndex];
      eligibleUserIds = currentStep ? currentStep.userIds : [];
    }

    if (!userIsApprover(userId, eligibleUserIds, now)) {
      const err = new Error('User not eligible to approve this step: ' + userId);
      err.code = 'E_NOT_ELIGIBLE';
      throw err;
    }

    // ── Record the decision
    const behalf = eligibleUserIds.includes(userId)
      ? null
      : (eligibleUserIds.find((u) => resolveDelegate(u, now) === userId) || null);

    request.decisions.push({
      userId,
      decision,
      comment: comment || '',
      at: now,
      step: plan.flow_type === 'parallel' ? 'parallel' : currentStepIndex,
      role: currentStep.role,
      on_behalf_of: behalf,
    });
    logHistory(request.po_id, {
      event: 'decision',
      request_id: request.id,
      userId, decision, comment: comment || '', role: currentStep.role,
      on_behalf_of: behalf,
    });

    // ── Reject → terminal
    if (decision === DECISION.REJECT) {
      request.status = REQUEST_STATUS.REJECTED;
      request.rejected_at = now;
      request.rejected_by = userId;
      request.reject_reason = comment;
      logHistory(request.po_id, {
        event: 'rejected',
        request_id: request.id,
        reason: comment,
        by: userId,
      });
      notifyStep(request, 'rejected', { by: userId, reason: comment });
      return { status: request.status, terminal: true, reason: comment };
    }

    // ── Approve path
    if (plan.flow_type === 'parallel') {
      // all members must approve (emergency retroactive ratification)
      const approvedUids = new Set(
        request.decisions
          .filter((d) => d.decision === DECISION.APPROVE)
          .flatMap((d) => [d.userId, d.on_behalf_of].filter(Boolean))
      );
      const outstanding = eligibleUserIds.filter((u) => !approvedUids.has(u));
      if (outstanding.length === 0) {
        request.status = REQUEST_STATUS.APPROVED;
        request.approved_at = now;
        logHistory(request.po_id, { event: 'fully_ratified', request_id: request.id });
        notifyStep(request, 'approved');
        return { status: request.status, terminal: true, outstanding: [] };
      }
      notifyStep(request, 'partial_parallel', { remaining: outstanding });
      return { status: request.status, terminal: false, outstanding };
    }

    // ── Sequential flow
    request.current_step = currentStepIndex + 1;
    if (request.current_step >= plan.steps.length) {
      request.status = REQUEST_STATUS.APPROVED;
      request.approved_at = now;
      logHistory(request.po_id, { event: 'approved', request_id: request.id });
      notifyStep(request, 'approved');
      return { status: request.status, terminal: true, next_step: null };
    }

    // advance to next step
    const next = plan.steps[request.current_step];
    for (const uid of next.userIds) {
      notifyStep(request, 'approval_request', {
        user_id: uid,
        step: request.current_step,
        role: next.role,
      });
    }
    return {
      status: request.status,
      terminal: false,
      next_step: { index: request.current_step, role: next.role, userIds: next.userIds.slice() },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // getPendingApprovals
  // ────────────────────────────────────────────────────────────────

  function getPendingApprovals(userId) {
    assertNonEmptyString(userId, 'userId');
    const now = clock();
    const out = [];
    for (const r of Requests.values()) {
      if (r.status !== REQUEST_STATUS.PENDING &&
          r.status !== REQUEST_STATUS.RETROACTIVE_PENDING &&
          r.status !== REQUEST_STATUS.ESCALATED) continue;
      const plan = r.plan;
      let eligible;
      if (plan.flow_type === 'parallel') {
        const decided = new Set(
          r.decisions.flatMap((d) => [d.userId, d.on_behalf_of].filter(Boolean))
        );
        eligible = (plan.parallel_groups[0] || []).filter((u) => !decided.has(u));
      } else {
        const step = plan.steps[r.current_step];
        eligible = step ? step.userIds : [];
      }
      if (userIsApprover(userId, eligible, now)) {
        out.push({
          request_id: r.id,
          po_id: r.po_id,
          status: r.status,
          current_step: r.current_step,
          flow_type: plan.flow_type,
          submitted_at: r.submitted_at,
          amount: (POs.get(r.po_id) || {}).amount,
          category: (POs.get(r.po_id) || {}).category,
          retroactive_deadline: r.retroactive_deadline,
        });
      }
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  // delegate
  // ────────────────────────────────────────────────────────────────

  function delegate(fromUserId, toUserId, fromDate, toDate) {
    assertNonEmptyString(fromUserId, 'fromUserId');
    assertNonEmptyString(toUserId, 'toUserId');
    if (fromUserId === toUserId) {
      const err = new Error('Cannot delegate to self');
      err.code = 'E_INVALID_INPUT';
      throw err;
    }
    const from = typeof fromDate === 'number' ? fromDate : Date.parse(fromDate);
    const to   = typeof toDate   === 'number' ? toDate   : Date.parse(toDate);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      const err = new Error('Invalid delegation window');
      err.code = 'E_INVALID_INPUT';
      throw err;
    }
    const delegationId = genId('deleg');
    const record = {
      id: delegationId,
      from: fromUserId,
      to: toUserId,
      from_date: from,
      to_date: to,
      active: true,
      created_at: clock(),
    };
    Delegations.push(record);
    try {
      audit({
        subject: 'delegation',
        event: 'created',
        from: fromUserId, to: toUserId,
        window: { from, to },
        at: clock(),
      });
    } catch (_) { /* non-fatal */ }
    return delegationId;
  }

  // ────────────────────────────────────────────────────────────────
  // escalate
  // ────────────────────────────────────────────────────────────────

  function escalate(requestId, reason) {
    const request = Requests.get(requestId);
    if (!request) {
      const err = new Error('Request not found: ' + requestId);
      err.code = 'E_REQUEST_NOT_FOUND';
      throw err;
    }
    if (request.status !== REQUEST_STATUS.PENDING &&
        request.status !== REQUEST_STATUS.RETROACTIVE_PENDING &&
        request.status !== REQUEST_STATUS.ESCALATED) {
      const err = new Error('Cannot escalate non-pending request: ' + request.status);
      err.code = 'E_NOT_PENDING';
      throw err;
    }
    request.status = REQUEST_STATUS.ESCALATED;
    request.escalated_at = clock();
    request.escalation_reason = reason || 'manual_escalation';
    logHistory(request.po_id, {
      event: 'escalated',
      request_id: request.id,
      reason: request.escalation_reason,
    });
    notifyStep(request, 'escalated', { reason: request.escalation_reason });
  }

  // Tick clock — auto-escalate expired steps and expire retroactive deadlines
  function tick() {
    const now = clock();
    const expired = [];
    for (const r of Requests.values()) {
      if (r.status === REQUEST_STATUS.PENDING || r.status === REQUEST_STATUS.ESCALATED) {
        const dl = r.step_deadlines[r.current_step];
        if (typeof dl === 'number' && now > dl && r.status !== REQUEST_STATUS.ESCALATED) {
          escalate(r.id, 'timeout');
          expired.push(r.id);
        }
      } else if (r.status === REQUEST_STATUS.RETROACTIVE_PENDING) {
        if (typeof r.retroactive_deadline === 'number' && now > r.retroactive_deadline) {
          // Not fully ratified — revert
          const approvedUids = new Set(
            r.decisions
              .filter((d) => d.decision === DECISION.APPROVE)
              .flatMap((d) => [d.userId, d.on_behalf_of].filter(Boolean))
          );
          const outstanding = (r.plan.parallel_groups[0] || [])
            .filter((u) => !approvedUids.has(u));
          if (outstanding.length > 0) {
            r.status = REQUEST_STATUS.EXPIRED;
            r.expired_at = now;
            logHistory(r.po_id, {
              event: 'retroactive_expired',
              request_id: r.id,
              outstanding,
            });
            notifyStep(r, 'retroactive_expired', { outstanding });
            expired.push(r.id);
          }
        }
      }
    }
    return expired;
  }

  // ────────────────────────────────────────────────────────────────
  // Amendment workflow — re-route an already-approved PO
  // ────────────────────────────────────────────────────────────────

  function amend(poId, changes, opts) {
    opts = opts || {};
    const po = POs.get(poId);
    if (!po) {
      const err = new Error('PO not found: ' + poId);
      err.code = 'E_PO_NOT_FOUND';
      throw err;
    }
    const before = deepClone(po);
    const after = Object.assign({}, po, changes, { id: poId });
    POs.set(poId, after);

    logHistory(poId, {
      event: 'amended',
      before: {
        amount: before.amount, category: before.category,
        vendor_id: before.vendor_id,
      },
      after: {
        amount: after.amount, category: after.category,
        vendor_id: after.vendor_id,
      },
      changed_by: opts.changed_by || 'unknown',
    });

    // Significant changes require re-approval — define "significant":
    //  · amount changed upwards (>10%)
    //  · vendor changed
    //  · category changed
    const amtUp = Number(after.amount) > Number(before.amount) * 1.10;
    const vendorChanged = after.vendor_id !== before.vendor_id;
    const catChanged = after.category !== before.category;
    const significant = amtUp || vendorChanged || catChanged;
    if (!significant) {
      logHistory(poId, { event: 'amendment_minor_no_reroute' });
      return { rerouted: false, request_id: null };
    }
    // Re-submit for approval
    const newRequestId = submitForApproval(poId, Object.assign({}, opts, {
      // Skip duplicate check on re-submissions
      skipDuplicateCheck: true,
    }));
    logHistory(poId, {
      event: 'amendment_reroute',
      request_id: newRequestId,
      reasons: {
        amount_increased_gt_10pct: amtUp,
        vendor_changed: vendorChanged,
        category_changed: catChanged,
      },
    });
    return { rerouted: true, request_id: newRequestId };
  }

  // ────────────────────────────────────────────────────────────────
  // Read-only accessors
  // ────────────────────────────────────────────────────────────────

  function getHistory(poId) {
    return deepClone(History.get(poId) || []);
  }
  function getRequest(requestId) {
    return deepClone(Requests.get(requestId));
  }
  function getPO(poId) {
    return deepClone(POs.get(poId));
  }

  function listActiveDelegations() {
    return Delegations.slice();
  }

  // Direct store access for tests / DI scenarios
  function _inject(poId, po) {
    POs.set(poId, deepClone(po));
  }

  return {
    // Core API
    evaluatePO,
    submitForApproval,
    approve,
    getPendingApprovals,
    delegate,
    escalate,
    tick,
    amend,
    getHistory,
    getRequest,
    getPO,
    listActiveDelegations,

    // Test / admin helpers
    _inject,

    // Constants
    BRACKET, CATEGORY, RISK_TIER, REQUEST_STATUS, DECISION, ROLE,
    LABELS, labelOf,
  };
}

// ─── Default singleton (drop-in module API) ────────────────────────────────

let _defaultSystem = null;
function _defaults() {
  if (!_defaultSystem) _defaultSystem = createApprovalSystem();
  return _defaultSystem;
}

// Module-level exports: the pure evaluator + thin wrappers to the singleton.
module.exports = {
  // Pure
  evaluatePO,
  resolveBracket,
  labelOf,

  // Constants
  BRACKET,
  CATEGORY,
  RISK_TIER,
  REQUEST_STATUS,
  DECISION,
  ROLE,
  LABELS,
  EMERGENCY_RATIFY_MS,
  DEFAULT_STEP_TIMEOUT_MS,
  CAPEX_BOARD_THRESHOLD,

  // System factory
  createApprovalSystem,

  // Default singleton wrappers (spec-mandated names)
  submitForApproval: (poOrId, opts) => _defaults().submitForApproval(poOrId, opts),
  approve: (requestId, userId, decision, comment, opts) =>
    _defaults().approve(requestId, userId, decision, comment, opts),
  getPendingApprovals: (userId) => _defaults().getPendingApprovals(userId),
  delegate: (fromUserId, toUserId, fromDate, toDate) =>
    _defaults().delegate(fromUserId, toUserId, fromDate, toDate),
  escalate: (requestId, reason) => _defaults().escalate(requestId, reason),
  getHistory: (poId) => _defaults().getHistory(poId),

  // Reset default system (tests)
  _resetDefaultSystem: () => { _defaultSystem = null; },
};
