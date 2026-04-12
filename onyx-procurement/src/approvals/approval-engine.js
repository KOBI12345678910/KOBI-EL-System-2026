/**
 * ONYX Generic Approval Workflow Engine — Agent Y-109 (Techno-Kol Uzi mega-ERP)
 * מנוע אישורים גנרי — משלים את X-15 (מנוע זרימה) ו-X-38 (אישורי PO ייעודי)
 * 2026-04-11
 *
 * RULE: לא מוחקים רק משדרגים ומגדלים.
 *   This engine COMPLEMENTS (not replaces) the existing workflow engine
 *   (src/workflow/engine.js) and PO-specific approvals (X-38). It focuses
 *   on generic, tier/amount based approvals across ALL business entities:
 *     invoice | po | expense | contract | timecard | leave |
 *     change-order | new-vendor | new-customer | custom
 *
 * ZERO DEPENDENCIES. Node 20+ built-ins only.
 * BILINGUAL: Every public artifact carries he+en strings.
 *
 * Public API (class ApprovalEngine)
 * ─────────────────────────────────
 *   defineFlow({id, name_he, name_en, entity, steps, parallel})
 *   startRequest({flowId, entity, initiator, payload})
 *   routeToApprovers(requestId)
 *   submitDecision({requestId, approver, decision, comments, conditions})
 *   aggregate(requestId)
 *   escalate(requestId, reason)
 *   delegateAuthority({fromUser, toUser, dateRange, scope})
 *   amountBasedRouting({entity, amount})
 *   conditionalApproval({requestId, conditions})
 *   historyView(requestId)
 *   metrics({flowId, period})
 *   bulkApproval(requestIds, approver)
 *   mobileApprovalToken({requestId})
 *
 * Step.type
 * ─────────
 *   one-of    — single approver from list suffices
 *   all-of    — every approver must approve
 *   majority  — > 50% approve
 *
 * Decision values
 * ───────────────
 *   approve | reject | request-info
 *
 * Amount tier defaults (ILS) per entity
 * ─────────────────────────────────────
 *   invoice      : 1k, 10k, 50k, 250k
 *   po           : 5k, 25k, 100k, 500k
 *   expense      : 500, 2.5k, 10k
 *   contract     : 10k, 100k, 1M
 *   change-order : 2.5k, 25k, 250k
 *
 * History entry shape
 * ───────────────────
 *   { at, type, actor, data, note_he, note_en }
 */

'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

// ─── constants ──────────────────────────────────────────────────────────────

const ENTITIES = Object.freeze([
  'invoice',
  'po',
  'expense',
  'contract',
  'timecard',
  'leave',
  'change-order',
  'new-vendor',
  'new-customer',
  'custom',
]);

const STEP_TYPES = Object.freeze(['one-of', 'all-of', 'majority']);

const DECISIONS = Object.freeze(['approve', 'reject', 'request-info']);

const STATUS = Object.freeze({
  PENDING: 'pending',
  IN_REVIEW: 'in-review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  INFO_REQUESTED: 'info-requested',
  ESCALATED: 'escalated',
  CANCELLED: 'cancelled',
});

// Default amount tiers in ILS, each tier is [upper_bound, role_or_group]
const DEFAULT_TIERS = Object.freeze({
  invoice: [
    [1000,   'role:team-lead'],
    [10000,  'role:manager'],
    [50000,  'role:director'],
    [250000, 'role:vp-finance'],
    [Infinity, 'role:ceo'],
  ],
  po: [
    [5000,    'role:team-lead'],
    [25000,   'role:manager'],
    [100000,  'role:director'],
    [500000,  'role:vp-procurement'],
    [Infinity, 'role:ceo'],
  ],
  expense: [
    [500,    'role:team-lead'],
    [2500,   'role:manager'],
    [10000,  'role:director'],
    [Infinity, 'role:cfo'],
  ],
  contract: [
    [10000,   'role:manager'],
    [100000,  'role:director'],
    [1000000, 'role:vp-legal'],
    [Infinity, 'role:ceo'],
  ],
  'change-order': [
    [2500,   'role:project-manager'],
    [25000,  'role:director'],
    [250000, 'role:vp-operations'],
    [Infinity, 'role:ceo'],
  ],
  // No amount tiers for these (presence-triggered)
  timecard: [[Infinity, 'role:manager']],
  leave: [[Infinity, 'role:manager']],
  'new-vendor': [[Infinity, 'role:procurement-manager']],
  'new-customer': [[Infinity, 'role:sales-manager']],
  custom: [[Infinity, 'role:manager']],
});

// Hebrew/English glossary for common terms
const GLOSSARY = Object.freeze({
  approve:        { he: 'אישור',            en: 'approve' },
  reject:         { he: 'דחייה',            en: 'reject' },
  'request-info': { he: 'בקשת מידע נוסף',   en: 'request-info' },
  escalate:       { he: 'הסלמה',            en: 'escalate' },
  delegate:       { he: 'האצלת סמכות',      en: 'delegate' },
  route:          { he: 'ניתוב',            en: 'route' },
  bulk:           { he: 'אישור מרוכז',      en: 'bulk-approval' },
  mobile:         { he: 'אישור נייד',       en: 'mobile-approval' },
  pending:        { he: 'ממתין',            en: 'pending' },
  'in-review':    { he: 'בבדיקה',          en: 'in-review' },
  approved:       { he: 'מאושר',            en: 'approved' },
  rejected:       { he: 'נדחה',             en: 'rejected' },
  'info-requested':{ he: 'ממתין למידע',     en: 'info-requested' },
  escalated:      { he: 'הוסלם',            en: 'escalated' },
  cancelled:      { he: 'בוטל',             en: 'cancelled' },
  'one-of':       { he: 'מאשר יחיד',        en: 'one-of' },
  'all-of':       { he: 'כל המאשרים',       en: 'all-of' },
  majority:       { he: 'רוב',              en: 'majority' },
  invoice:        { he: 'חשבונית',          en: 'invoice' },
  po:             { he: 'הזמנת רכש',        en: 'purchase-order' },
  expense:        { he: 'הוצאה',            en: 'expense' },
  contract:       { he: 'חוזה',             en: 'contract' },
  timecard:       { he: 'דוח שעות',         en: 'timecard' },
  leave:          { he: 'חופשה',            en: 'leave' },
  'change-order': { he: 'הוראת שינוי',      en: 'change-order' },
  'new-vendor':   { he: 'ספק חדש',          en: 'new-vendor' },
  'new-customer': { he: 'לקוח חדש',         en: 'new-customer' },
  custom:         { he: 'מותאם אישית',      en: 'custom' },
});

// ─── helpers ────────────────────────────────────────────────────────────────

function now() { return Date.now(); }

function uid(prefix = 'req') {
  return prefix + '_' + crypto.randomBytes(9).toString('hex');
}

function assert(cond, msg) {
  if (!cond) throw new Error('ApprovalEngine: ' + msg);
}

function bilingual(key, extraHe, extraEn) {
  const g = GLOSSARY[key] || { he: key, en: key };
  return {
    he: extraHe ? g.he + ' — ' + extraHe : g.he,
    en: extraEn ? g.en + ' — ' + extraEn : g.en,
  };
}

// Safe condition evaluator — NO eval, NO Function().
// Supports:  ctx.path  ,  literals,  && || ! == != < <= > >=  + - * / %
// Returns false on any parse error.
function evalCondition(expr, ctx) {
  if (!expr || expr === true) return true;
  if (typeof expr === 'function') {
    try { return !!expr(ctx); } catch { return false; }
  }
  if (typeof expr !== 'string') return false;
  try {
    const tokens = tokenize(expr);
    const p = { tokens, pos: 0 };
    const result = parseOr(p, ctx);
    return !!result;
  } catch {
    return false;
  }
}

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
      i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j++;
      out.push({ t: 'str', v: s.slice(i + 1, j) });
      i = j + 1; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_.]/.test(s[j])) j++;
      const word = s.slice(i, j);
      if (word === 'true')  out.push({ t: 'num', v: 1 });
      else if (word === 'false') out.push({ t: 'num', v: 0 });
      else if (word === 'null' || word === 'undefined') out.push({ t: 'num', v: 0 });
      else out.push({ t: 'id', v: word });
      i = j; continue;
    }
    // 2-char operators
    const two = s.slice(i, i + 2);
    if (['==','!=','<=','>=','&&','||'].includes(two)) {
      out.push({ t: two }); i += 2; continue;
    }
    if ('<>+-*/%!'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error('bad char ' + c);
  }
  return out;
}

function peek(p) { return p.tokens[p.pos]; }
function eat(p) { return p.tokens[p.pos++]; }

function parseOr(p, ctx) {
  let left = parseAnd(p, ctx);
  while (peek(p) && peek(p).t === '||') { eat(p); const r = parseAnd(p, ctx); left = left || r; }
  return left;
}
function parseAnd(p, ctx) {
  let left = parseEq(p, ctx);
  while (peek(p) && peek(p).t === '&&') { eat(p); const r = parseEq(p, ctx); left = left && r; }
  return left;
}
function parseEq(p, ctx) {
  let left = parseCmp(p, ctx);
  while (peek(p) && (peek(p).t === '==' || peek(p).t === '!=')) {
    const op = eat(p).t;
    const r = parseCmp(p, ctx);
    left = op === '==' ? (left == r) : (left != r); // eslint-disable-line eqeqeq
  }
  return left;
}
function parseCmp(p, ctx) {
  let left = parseAdd(p, ctx);
  while (peek(p) && ['<','>','<=','>='].includes(peek(p).t)) {
    const op = eat(p).t;
    const r = parseAdd(p, ctx);
    if (op === '<')  left = left <  r;
    if (op === '>')  left = left >  r;
    if (op === '<=') left = left <= r;
    if (op === '>=') left = left >= r;
  }
  return left;
}
function parseAdd(p, ctx) {
  let left = parseMul(p, ctx);
  while (peek(p) && (peek(p).t === '+' || peek(p).t === '-')) {
    const op = eat(p).t;
    const r = parseMul(p, ctx);
    left = op === '+' ? left + r : left - r;
  }
  return left;
}
function parseMul(p, ctx) {
  let left = parseUnary(p, ctx);
  while (peek(p) && ['*','/','%'].includes(peek(p).t)) {
    const op = eat(p).t;
    const r = parseUnary(p, ctx);
    if (op === '*') left = left * r;
    if (op === '/') left = left / r;
    if (op === '%') left = left % r;
  }
  return left;
}
function parseUnary(p, ctx) {
  if (peek(p) && peek(p).t === '!') { eat(p); return !parseUnary(p, ctx); }
  if (peek(p) && peek(p).t === '-') { eat(p); return -parseUnary(p, ctx); }
  return parsePrim(p, ctx);
}
function parsePrim(p, ctx) {
  const tk = eat(p);
  if (!tk) throw new Error('unexpected end');
  if (tk.t === 'num') return tk.v;
  if (tk.t === 'str') return tk.v;
  if (tk.t === '(')   { const v = parseOr(p, ctx); if (!peek(p) || peek(p).t !== ')') throw new Error('missing )'); eat(p); return v; }
  if (tk.t === 'id') {
    const parts = tk.v.split('.');
    if (parts[0] !== 'ctx') return 0;
    let cur = ctx;
    for (let i = 1; i < parts.length; i++) {
      if (cur == null) return 0;
      cur = cur[parts[i]];
    }
    if (cur == null) return 0;
    return cur;
  }
  throw new Error('bad token ' + tk.t);
}

// ─── main class ─────────────────────────────────────────────────────────────

class ApprovalEngine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = {
      now: opts.now || now,
      secret: opts.secret || crypto.randomBytes(32).toString('hex'),
      defaultTimeoutMs: opts.defaultTimeoutMs || 3 * 24 * 60 * 60 * 1000, // 72h
      tiers: opts.tiers || DEFAULT_TIERS,
    };
    this._flows = new Map();     // flowId -> flow def
    this._requests = new Map();  // requestId -> request
    this._delegations = [];      // list of delegation records
    this._seq = 0;
  }

  // ── flow definition ──────────────────────────────────────────────────────
  defineFlow(def) {
    assert(def && typeof def === 'object', 'defineFlow requires object');
    assert(def.id, 'flow.id required');
    assert(def.entity && ENTITIES.includes(def.entity), 'flow.entity invalid: ' + def.entity);
    assert(Array.isArray(def.steps) && def.steps.length > 0, 'flow.steps must be non-empty array');

    const steps = def.steps.map((s, idx) => {
      assert(s.id, 'step[' + idx + '].id required');
      assert(STEP_TYPES.includes(s.type), 'step[' + idx + '].type invalid: ' + s.type);
      assert(Array.isArray(s.approvers) && s.approvers.length > 0,
        'step[' + idx + '].approvers required');
      return {
        id: s.id,
        condition: s.condition || true,
        approvers: s.approvers.slice(),
        type: s.type,
        timeout: typeof s.timeout === 'number' ? s.timeout : this.opts.defaultTimeoutMs,
        escalation: s.escalation || null,
        name_he: s.name_he || s.id,
        name_en: s.name_en || s.id,
      };
    });

    const flow = {
      id: def.id,
      name_he: def.name_he || def.id,
      name_en: def.name_en || def.id,
      entity: def.entity,
      steps,
      parallel: !!def.parallel,
      createdAt: this.opts.now(),
    };
    this._flows.set(flow.id, flow);
    this.emit('flow.defined', { flowId: flow.id });
    return flow;
  }

  getFlow(id) { return this._flows.get(id) || null; }
  listFlows() { return Array.from(this._flows.values()); }

  // ── start a new approval request ─────────────────────────────────────────
  startRequest({ flowId, entity, initiator, payload }) {
    const flow = this._flows.get(flowId);
    assert(flow, 'unknown flow: ' + flowId);
    assert(entity === flow.entity, 'entity mismatch: ' + entity + ' vs ' + flow.entity);
    assert(initiator, 'initiator required');

    const id = uid('req');
    const createdAt = this.opts.now();
    const req = {
      id,
      flowId,
      entity,
      initiator,
      payload: payload || {},
      status: STATUS.PENDING,
      currentStep: 0,
      currentStepId: null,
      stepState: {},   // stepId -> { decisions:[{approver,decision,at,comments,conditions}], startedAt, dueAt, escalated }
      conditions: [],  // list of conditional-approval conditions
      history: [],
      createdAt,
      updatedAt: createdAt,
      closedAt: null,
    };
    this._requests.set(id, req);
    this._appendHistory(req, {
      type: 'request.started',
      actor: initiator,
      data: { flowId, entity },
      note_he: 'בקשה נפתחה',
      note_en: 'Request started',
    });
    this._activateCurrentStep(req);
    this.emit('request.started', { requestId: id });
    return req;
  }

  getRequest(id) { return this._requests.get(id) || null; }

  // ── determine next approver(s) for a request ─────────────────────────────
  routeToApprovers(requestId) {
    const req = this._getReq(requestId);
    const flow = this._flows.get(req.flowId);
    if (req.status !== STATUS.PENDING && req.status !== STATUS.IN_REVIEW && req.status !== STATUS.INFO_REQUESTED) {
      return [];
    }

    // parallel mode: return all approvers of all unfinished steps at once
    if (flow.parallel) {
      const out = [];
      for (const step of flow.steps) {
        const state = req.stepState[step.id];
        if (state && state.done) continue;
        if (!evalCondition(step.condition, { payload: req.payload, amount: req.payload.amount })) continue;
        for (const ap of step.approvers) {
          out.push(this._resolveDelegate(ap, req));
        }
      }
      return this._uniq(out);
    }

    // sequential mode
    const step = flow.steps[req.currentStep];
    if (!step) return [];
    if (!evalCondition(step.condition, { payload: req.payload, amount: req.payload.amount })) {
      // step is skipped — advance + re-route
      this._skipStep(req, step);
      return this.routeToApprovers(requestId);
    }
    return this._uniq(step.approvers.map((ap) => this._resolveDelegate(ap, req)));
  }

  // ── submit a decision for a step ─────────────────────────────────────────
  submitDecision({ requestId, approver, decision, comments, conditions }) {
    const req = this._getReq(requestId);
    const flow = this._flows.get(req.flowId);
    assert(DECISIONS.includes(decision), 'bad decision: ' + decision);
    assert(approver, 'approver required');

    // Which step is this approver authorized for?
    const step = this._findAuthorizedStep(flow, req, approver);
    assert(step, 'approver not authorized for any active step: ' + approver);

    const state = req.stepState[step.id] || (req.stepState[step.id] = { decisions: [], startedAt: this.opts.now(), dueAt: null, escalated: false, done: false });
    // idempotent — same approver cannot vote twice on same step
    if (state.decisions.some((d) => d.approver === approver)) {
      return { status: req.status, message: 'already voted' };
    }

    state.decisions.push({
      approver,
      decision,
      at: this.opts.now(),
      comments: comments || null,
      conditions: conditions || null,
    });

    if (conditions && Array.isArray(conditions) && conditions.length > 0) {
      for (const c of conditions) req.conditions.push({ stepId: step.id, approver, condition: c });
    }

    this._appendHistory(req, {
      type: 'decision.submitted',
      actor: approver,
      data: { stepId: step.id, decision, comments: comments || null },
      note_he: GLOSSARY[decision].he + ' לשלב ' + (step.name_he || step.id),
      note_en: GLOSSARY[decision].en + ' on step ' + (step.name_en || step.id),
    });

    // Aggregate the step
    this.aggregate(requestId);
    req.updatedAt = this.opts.now();
    this.emit('decision.submitted', { requestId, stepId: step.id, approver, decision });
    return { status: req.status, stepId: step.id };
  }

  // ── aggregate parallel / multi-approver decisions ───────────────────────
  aggregate(requestId) {
    const req = this._getReq(requestId);
    const flow = this._flows.get(req.flowId);
    if ([STATUS.APPROVED, STATUS.REJECTED, STATUS.CANCELLED].includes(req.status)) return req.status;

    // Evaluate every active step
    for (const step of flow.steps) {
      const state = req.stepState[step.id];
      if (!state || state.done) continue;
      const outcome = this._evalStep(step, state);
      if (outcome === 'approved') {
        state.done = true;
        state.outcome = 'approved';
        this._appendHistory(req, {
          type: 'step.approved',
          actor: 'system',
          data: { stepId: step.id, type: step.type },
          note_he: 'שלב ' + (step.name_he || step.id) + ' אושר',
          note_en: 'Step ' + (step.name_en || step.id) + ' approved',
        });
      } else if (outcome === 'rejected') {
        state.done = true;
        state.outcome = 'rejected';
        req.status = STATUS.REJECTED;
        req.closedAt = this.opts.now();
        this._appendHistory(req, {
          type: 'request.rejected',
          actor: 'system',
          data: { stepId: step.id },
          note_he: 'הבקשה נדחתה בשלב ' + (step.name_he || step.id),
          note_en: 'Request rejected at step ' + (step.name_en || step.id),
        });
        this.emit('request.rejected', { requestId });
        return req.status;
      }
    }

    // Sequential: advance if current step is done; skip conditional-false steps
    if (!flow.parallel) {
      while (req.currentStep < flow.steps.length) {
        const step = flow.steps[req.currentStep];
        // If step's condition is false, skip it
        if (!evalCondition(step.condition, { payload: req.payload, amount: req.payload.amount })) {
          this._skipStep(req, step);
          continue;
        }
        const state = req.stepState[step.id];
        if (state && state.done && state.outcome === 'approved') {
          req.currentStep++;
          if (req.currentStep < flow.steps.length) {
            this._activateCurrentStep(req);
          }
          continue;
        }
        break;
      }
    }

    // Parallel: if ALL steps done-approved -> approved
    const allDone = flow.steps.every((s) => {
      // unused steps (condition=false) count as done
      if (!evalCondition(s.condition, { payload: req.payload, amount: req.payload.amount })) return true;
      const st = req.stepState[s.id];
      return st && st.done && st.outcome === 'approved';
    });

    if (flow.parallel && allDone) {
      req.status = STATUS.APPROVED;
      req.closedAt = this.opts.now();
      this._appendHistory(req, {
        type: 'request.approved',
        actor: 'system',
        data: {},
        note_he: 'הבקשה אושרה (מקבילי)',
        note_en: 'Request approved (parallel)',
      });
      this.emit('request.approved', { requestId });
      return req.status;
    }

    if (!flow.parallel && req.currentStep >= flow.steps.length) {
      req.status = STATUS.APPROVED;
      req.closedAt = this.opts.now();
      this._appendHistory(req, {
        type: 'request.approved',
        actor: 'system',
        data: {},
        note_he: 'הבקשה אושרה (סדרתי)',
        note_en: 'Request approved (sequential)',
      });
      this.emit('request.approved', { requestId });
      return req.status;
    }

    if (req.status === STATUS.PENDING) req.status = STATUS.IN_REVIEW;
    return req.status;
  }

  // ── escalation ───────────────────────────────────────────────────────────
  escalate(requestId, reason) {
    const req = this._getReq(requestId);
    const flow = this._flows.get(req.flowId);
    assert(req.status !== STATUS.APPROVED && req.status !== STATUS.REJECTED,
      'cannot escalate closed request');

    const targets = [];
    const steps = flow.parallel
      ? flow.steps.filter((s) => {
          const st = req.stepState[s.id];
          return !(st && st.done);
        })
      : [flow.steps[req.currentStep]];

    for (const step of steps) {
      if (!step) continue;
      const state = req.stepState[step.id];
      if (state) state.escalated = true;
      const target = step.escalation || this._nextTierUp(flow.entity, req.payload.amount || 0);
      targets.push({ stepId: step.id, target });
    }
    req.status = STATUS.ESCALATED;
    this._appendHistory(req, {
      type: 'escalated',
      actor: 'system',
      data: { reason: reason || 'manual', targets },
      note_he: 'הבקשה הוסלמה: ' + (reason || 'ידני'),
      note_en: 'Request escalated: ' + (reason || 'manual'),
    });
    this.emit('request.escalated', { requestId, targets });
    return targets;
  }

  // Check for timeouts and auto-escalate
  checkTimeouts(atTime) {
    const t = typeof atTime === 'number' ? atTime : this.opts.now();
    const out = [];
    for (const req of this._requests.values()) {
      if ([STATUS.APPROVED, STATUS.REJECTED, STATUS.CANCELLED].includes(req.status)) continue;
      const flow = this._flows.get(req.flowId);
      const steps = flow.parallel
        ? flow.steps
        : [flow.steps[req.currentStep]].filter(Boolean);
      for (const step of steps) {
        const state = req.stepState[step.id];
        if (!state || state.done || state.escalated) continue;
        if (state.dueAt != null && t >= state.dueAt) {
          this.escalate(req.id, 'timeout');
          out.push(req.id);
          break;
        }
      }
    }
    return out;
  }

  // ── delegation (manager out-of-office) ───────────────────────────────────
  delegateAuthority({ fromUser, toUser, dateRange, scope }) {
    assert(fromUser && toUser, 'fromUser and toUser required');
    assert(dateRange && dateRange.from != null && dateRange.to != null, 'dateRange required');
    const rec = {
      id: uid('deleg'),
      fromUser,
      toUser,
      from: dateRange.from,
      to: dateRange.to,
      scope: scope || { entities: ['*'], maxAmount: Infinity },
      createdAt: this.opts.now(),
    };
    this._delegations.push(rec);
    this.emit('delegation.created', { id: rec.id });
    return rec;
  }

  // ── amount-based routing ─────────────────────────────────────────────────
  amountBasedRouting({ entity, amount }) {
    assert(ENTITIES.includes(entity), 'bad entity: ' + entity);
    const tiers = this.opts.tiers[entity] || DEFAULT_TIERS[entity] || DEFAULT_TIERS.custom;
    const n = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0;
    const chain = [];
    for (const [upper, approver] of tiers) {
      chain.push({ upper, approver });
      if (n <= upper) break;
    }
    return {
      entity,
      amount: n,
      currency: 'ILS',
      chain,
      finalApprover: chain[chain.length - 1].approver,
    };
  }

  _nextTierUp(entity, amount) {
    const { chain } = this.amountBasedRouting({ entity, amount });
    // bump one tier
    const tiers = this.opts.tiers[entity] || DEFAULT_TIERS[entity] || DEFAULT_TIERS.custom;
    const idx = Math.min(chain.length, tiers.length - 1);
    return tiers[idx][1];
  }

  // ── conditional approval (approve WITH conditions) ──────────────────────
  conditionalApproval({ requestId, conditions }) {
    const req = this._getReq(requestId);
    assert(Array.isArray(conditions) && conditions.length > 0, 'conditions required');
    for (const c of conditions) req.conditions.push({ condition: c, at: this.opts.now() });
    this._appendHistory(req, {
      type: 'conditions.attached',
      actor: 'system',
      data: { conditions },
      note_he: 'תנאים צורפו לאישור',
      note_en: 'Conditions attached to approval',
    });
    return req.conditions.slice();
  }

  // ── history (bilingual audit trail) ─────────────────────────────────────
  historyView(requestId) {
    const req = this._getReq(requestId);
    return req.history.map((h) => ({
      at: h.at,
      at_iso: new Date(h.at).toISOString(),
      type: h.type,
      actor: h.actor,
      data: h.data,
      note: { he: h.note_he, en: h.note_en },
    }));
  }

  // ── metrics ─────────────────────────────────────────────────────────────
  metrics({ flowId, period } = {}) {
    const from = period && period.from != null ? period.from : 0;
    const to = period && period.to != null ? period.to : Infinity;

    const matching = Array.from(this._requests.values()).filter((r) => {
      if (flowId && r.flowId !== flowId) return false;
      if (r.createdAt < from || r.createdAt > to) return false;
      return true;
    });

    if (matching.length === 0) {
      return {
        flowId: flowId || null,
        total: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        avgDecisionTimeMs: 0,
        rejectionRate: 0,
        bottleneckStep: null,
        stepAverages: {},
      };
    }

    let approvedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    let totalDecisionTime = 0;
    let closedCount = 0;
    const stepTimes = {}; // stepId -> [ms...]

    for (const req of matching) {
      if (req.status === STATUS.APPROVED) approvedCount++;
      else if (req.status === STATUS.REJECTED) rejectedCount++;
      else pendingCount++;

      if (req.closedAt != null) {
        totalDecisionTime += (req.closedAt - req.createdAt);
        closedCount++;
      }

      for (const [stepId, state] of Object.entries(req.stepState)) {
        if (state.decisions.length === 0) continue;
        const first = state.startedAt;
        const last = state.decisions[state.decisions.length - 1].at;
        const ms = last - first;
        if (!stepTimes[stepId]) stepTimes[stepId] = [];
        stepTimes[stepId].push(ms);
      }
    }

    const stepAverages = {};
    let bottleneckStep = null;
    let bottleneckMs = -1;
    for (const [sid, arr] of Object.entries(stepTimes)) {
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      stepAverages[sid] = Math.round(avg);
      if (avg > bottleneckMs) { bottleneckMs = avg; bottleneckStep = sid; }
    }

    return {
      flowId: flowId || null,
      total: matching.length,
      approved: approvedCount,
      rejected: rejectedCount,
      pending: pendingCount,
      avgDecisionTimeMs: closedCount === 0 ? 0 : Math.round(totalDecisionTime / closedCount),
      rejectionRate: matching.length === 0 ? 0 : +(rejectedCount / matching.length).toFixed(4),
      bottleneckStep,
      stepAverages,
    };
  }

  // ── bulk approval (batch routine items) ──────────────────────────────────
  bulkApproval(requestIds, approver) {
    assert(Array.isArray(requestIds), 'requestIds array required');
    assert(approver, 'approver required');
    const out = { approved: [], skipped: [], failed: [] };
    for (const id of requestIds) {
      try {
        const req = this._requests.get(id);
        if (!req) { out.failed.push({ id, error: 'not found' }); continue; }
        if ([STATUS.APPROVED, STATUS.REJECTED, STATUS.CANCELLED].includes(req.status)) {
          out.skipped.push({ id, status: req.status });
          continue;
        }
        const res = this.submitDecision({
          requestId: id,
          approver,
          decision: 'approve',
          comments: 'bulk-approval',
        });
        out.approved.push({ id, status: res.status });
      } catch (e) {
        out.failed.push({ id, error: e.message });
      }
    }
    this.emit('bulk.completed', { approver, counts: {
      approved: out.approved.length,
      skipped: out.skipped.length,
      failed: out.failed.length,
    } });
    return out;
  }

  // ── secure mobile approval token ─────────────────────────────────────────
  mobileApprovalToken({ requestId, ttlMs, approver }) {
    const req = this._getReq(requestId);
    const exp = this.opts.now() + (ttlMs || 24 * 60 * 60 * 1000);
    const payload = {
      rid: req.id,
      ap: approver || null,
      exp,
      nonce: crypto.randomBytes(8).toString('hex'),
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.opts.secret).update(body).digest('base64url');
    const token = body + '.' + sig;
    return {
      token,
      expiresAt: exp,
      url: '/mobile/approve?t=' + token,
      requestId: req.id,
    };
  }

  verifyMobileToken(token) {
    if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', this.opts.secret).update(body).digest('base64url');
    if (sig !== expected) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (payload.exp < this.opts.now()) return null;
      return payload;
    } catch { return null; }
  }

  // ── internal helpers ─────────────────────────────────────────────────────
  _getReq(id) {
    const r = this._requests.get(id);
    assert(r, 'unknown request: ' + id);
    return r;
  }

  _appendHistory(req, entry) {
    req.history.push({
      at: this.opts.now(),
      type: entry.type,
      actor: entry.actor,
      data: entry.data || {},
      note_he: entry.note_he || '',
      note_en: entry.note_en || '',
    });
  }

  _activateCurrentStep(req) {
    const flow = this._flows.get(req.flowId);
    if (!flow) return;
    if (flow.parallel) {
      for (const step of flow.steps) {
        if (!req.stepState[step.id]) {
          req.stepState[step.id] = {
            decisions: [],
            startedAt: this.opts.now(),
            dueAt: this.opts.now() + step.timeout,
            escalated: false,
            done: false,
          };
        }
      }
    } else {
      const step = flow.steps[req.currentStep];
      if (!step) return;
      req.currentStepId = step.id;
      if (!req.stepState[step.id]) {
        req.stepState[step.id] = {
          decisions: [],
          startedAt: this.opts.now(),
          dueAt: this.opts.now() + step.timeout,
          escalated: false,
          done: false,
        };
      }
    }
    req.status = STATUS.IN_REVIEW;
  }

  _skipStep(req, step) {
    req.stepState[step.id] = {
      decisions: [],
      startedAt: this.opts.now(),
      dueAt: null,
      escalated: false,
      done: true,
      outcome: 'skipped',
    };
    this._appendHistory(req, {
      type: 'step.skipped',
      actor: 'system',
      data: { stepId: step.id },
      note_he: 'שלב ' + (step.name_he || step.id) + ' דולג (תנאי לא התקיים)',
      note_en: 'Step ' + (step.name_en || step.id) + ' skipped (condition false)',
    });
    const flow = this._flows.get(req.flowId);
    if (!flow.parallel) req.currentStep++;
  }

  _evalStep(step, state) {
    const decisions = state.decisions;
    if (decisions.some((d) => d.decision === 'reject')) return 'rejected';
    const approves = decisions.filter((d) => d.decision === 'approve').length;
    const total = step.approvers.length;
    if (step.type === 'one-of') {
      if (approves >= 1) return 'approved';
    } else if (step.type === 'all-of') {
      if (approves >= total) return 'approved';
    } else if (step.type === 'majority') {
      if (approves > Math.floor(total / 2)) return 'approved';
    }
    return 'pending';
  }

  _findAuthorizedStep(flow, req, approver) {
    if (flow.parallel) {
      for (const step of flow.steps) {
        const state = req.stepState[step.id];
        if (state && state.done) continue;
        if (this._isAuthorized(step, approver, req)) return step;
      }
      return null;
    }
    const step = flow.steps[req.currentStep];
    if (!step) return null;
    if (this._isAuthorized(step, approver, req)) return step;
    return null;
  }

  _isAuthorized(step, approver, req) {
    const resolved = step.approvers.map((a) => this._resolveDelegate(a, req));
    if (resolved.includes(approver)) return true;
    if (step.approvers.includes(approver)) return true;
    // Check if the approver is a delegate of any of the original approvers
    const delegatedFromMe = this._delegations.filter((d) => d.toUser === approver
      && d.from <= this.opts.now() && d.to >= this.opts.now());
    for (const d of delegatedFromMe) {
      if (step.approvers.includes(d.fromUser)) {
        // scope check
        if (d.scope.entities && !(d.scope.entities.includes('*') || d.scope.entities.includes(req.entity))) continue;
        if (typeof d.scope.maxAmount === 'number' && (req.payload.amount || 0) > d.scope.maxAmount) continue;
        return true;
      }
    }
    return false;
  }

  _resolveDelegate(originalApprover, req) {
    const t = this.opts.now();
    for (const d of this._delegations) {
      if (d.fromUser !== originalApprover) continue;
      if (d.from > t || d.to < t) continue;
      if (d.scope && d.scope.entities
        && !(d.scope.entities.includes('*') || d.scope.entities.includes(req.entity))) continue;
      if (d.scope && typeof d.scope.maxAmount === 'number'
        && (req.payload.amount || 0) > d.scope.maxAmount) continue;
      return d.toUser;
    }
    return originalApprover;
  }

  _uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const v of arr) {
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }
}

// ─── exports ────────────────────────────────────────────────────────────────

module.exports = {
  ApprovalEngine,
  ENTITIES,
  STEP_TYPES,
  DECISIONS,
  STATUS,
  DEFAULT_TIERS,
  GLOSSARY,
  evalCondition,
  // helper for tests
  _internal: { tokenize, parseOr },
};
