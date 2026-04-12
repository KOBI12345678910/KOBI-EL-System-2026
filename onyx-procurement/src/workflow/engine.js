/**
 * ONYX Workflow Engine — declarative workflow engine for approvals & automations.
 * Agent X-15 (Swarm 3) — Techno-Kol Uzi mega-ERP — 2026-04-11
 * מנוע זרימת עבודה הצהרתי למערכת Techno-Kol (אישורים ואוטומציות)
 *
 * ZERO DEPENDENCIES. Node 20+ built-ins only.
 *
 * Concepts
 * ────────
 *   Workflow  ── a reusable JSON definition:   { id, trigger, steps }
 *   Instance  ── a running execution of a workflow with its own context & history
 *   Step      ── one unit of work:
 *                   - condition  (branch on ctx expression)
 *                   - approval   (wait for human decision)
 *                   - action     (invoke a registered action fn)
 *                   - parallel   (fan out + join)
 *                   - sequential (children executed in order)
 *                   - delay      (wait N ms)
 *                   - notify     (emit notification via action)
 *
 * Features
 * ────────
 *   1. Event-driven triggers (engine.emit('invoice.created', ctx))
 *   2. Parallel + sequential steps
 *   3. Conditional branching  ({ if: 'ctx.amount > 5000', then, else })
 *   4. Timeouts + escalation  (approval.timeout_hours -> escalate_to)
 *   5. Retry on failure        (action.retry {max, backoff_ms})
 *   6. Audit trail per step    (appended to instance.history)
 *   7. Pause / resume          (instance.status === 'paused')
 *   8. Cancel                  (terminal status 'cancelled')
 *   9. Role-based assignment   ('role:manager' | 'user:123' | 'group:finance')
 *  10. SLA tracking            (due_at per approval step)
 *
 * Safety expression language (condition.if / when)
 * ────────────────────────────────────────────────
 *   Only reads from `ctx.*`, literals, and the operators
 *       && || !  == != === !== < <= > >=  + - * / %  ( )  [ ]
 *   `ctx.*` access is limited to dotted and bracket paths — no function calls.
 *   Implemented via a small tokenizer + recursive-descent parser; no `eval`,
 *   no `new Function`. Returns false on any parse/runtime error.
 *
 * Persistence
 * ───────────
 *   Engine is created with an optional `db` object exposing:
 *       db.saveInstance(instance)
 *       db.loadInstance(id)
 *       db.listInstances(filter)
 *       db.appendHistory(instanceId, entry)
 *   If no `db` is passed, an in-memory store is used.
 *
 * Exports
 * ───────
 *   createEngine(db?) → Engine
 *   BUILT_IN_WORKFLOWS (array of built-in definitions)
 */

'use strict';

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

// ─── constants ──────────────────────────────────────────────────────────────

const STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  WAITING: 'waiting',      // waiting on human/approval/timer
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING: 'waiting',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ESCALATED: 'escalated',
  TIMED_OUT: 'timed_out',
});

const DECISION = Object.freeze({
  APPROVE: 'approve',
  REJECT: 'reject',
  DELEGATE: 'delegate',
});

const HOUR_MS = 60 * 60 * 1000;

// ─── helpers ────────────────────────────────────────────────────────────────

function genId(prefix = 'wfi') {
  return (
    prefix + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(6).toString('hex')
  );
}

function nowMs() {
  return Date.now();
}

function deepClone(o) {
  if (o == null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k of Object.keys(o)) out[k] = deepClone(o[k]);
  return out;
}

function freezeDeep(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) freezeDeep(v);
  }
  return o;
}

// ─── safe expression evaluator ──────────────────────────────────────────────
// Supports: ctx.path, ctx['path'], number/string/bool/null, unary !, -
//           binary && || == != === !== < <= > >= + - * / %, parens.
//
// Pure recursive-descent parser → AST → evaluator. No host access.

const TOK = {
  NUM: 'num', STR: 'str', IDENT: 'ident', BOOL: 'bool', NULL: 'null',
  OP: 'op', LP: '(', RP: ')', LB: '[', RB: ']', DOT: '.', EOF: 'eof',
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '(') { tokens.push({ t: TOK.LP }); i++; continue; }
    if (c === ')') { tokens.push({ t: TOK.RP }); i++; continue; }
    if (c === '[') { tokens.push({ t: TOK.LB }); i++; continue; }
    if (c === ']') { tokens.push({ t: TOK.RB }); i++; continue; }
    if (c === '.') { tokens.push({ t: TOK.DOT }); i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < n && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      tokens.push({ t: TOK.NUM, v: Number(src.slice(i, j)) });
      i = j; continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = '';
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) { out += src[j + 1]; j += 2; continue; }
        out += src[j]; j++;
      }
      if (j >= n) throw new Error('unterminated string');
      tokens.push({ t: TOK.STR, v: out });
      i = j + 1; continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$') {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === 'true' || word === 'false') tokens.push({ t: TOK.BOOL, v: word === 'true' });
      else if (word === 'null') tokens.push({ t: TOK.NULL });
      else tokens.push({ t: TOK.IDENT, v: word });
      i = j; continue;
    }
    // operators
    const two = src.slice(i, i + 2);
    const three = src.slice(i, i + 3);
    if (three === '===' || three === '!==') {
      tokens.push({ t: TOK.OP, v: three });
      i += 3; continue;
    }
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      tokens.push({ t: TOK.OP, v: two });
      i += 2; continue;
    }
    if ('+-*/%<>!'.indexOf(c) !== -1) {
      tokens.push({ t: TOK.OP, v: c });
      i++; continue;
    }
    throw new Error('unexpected char: ' + c);
  }
  tokens.push({ t: TOK.EOF });
  return tokens;
}

function parseExpr(src) {
  const toks = tokenize(src);
  let pos = 0;
  function peek() { return toks[pos]; }
  function eat() { return toks[pos++]; }
  function expect(t, v) {
    const k = eat();
    if (k.t !== t || (v != null && k.v !== v)) {
      throw new Error('expected ' + t + (v ? ' ' + v : ''));
    }
    return k;
  }

  // Grammar:
  //   or  → and ('||' and)*
  //   and → eq ('&&' eq)*
  //   eq  → cmp (('==' | '!=' | '===' | '!==') cmp)*
  //   cmp → add (('<' | '<=' | '>' | '>=') add)*
  //   add → mul (('+' | '-') mul)*
  //   mul → unary (('*' | '/' | '%') unary)*
  //   unary → ('!' | '-') unary | primary
  //   primary → NUM | STR | BOOL | NULL | '(' or ')' | member
  //   member  → IDENT ('.' IDENT | '[' or ']')*

  function parseOr() {
    let a = parseAnd();
    while (peek().t === TOK.OP && peek().v === '||') { eat(); a = { kind: 'bin', op: '||', a, b: parseAnd() }; }
    return a;
  }
  function parseAnd() {
    let a = parseEq();
    while (peek().t === TOK.OP && peek().v === '&&') { eat(); a = { kind: 'bin', op: '&&', a, b: parseEq() }; }
    return a;
  }
  function parseEq() {
    let a = parseCmp();
    while (peek().t === TOK.OP && (peek().v === '==' || peek().v === '!=' || peek().v === '===' || peek().v === '!==')) {
      const op = eat().v;
      a = { kind: 'bin', op, a, b: parseCmp() };
    }
    return a;
  }
  function parseCmp() {
    let a = parseAdd();
    while (peek().t === TOK.OP && (peek().v === '<' || peek().v === '<=' || peek().v === '>' || peek().v === '>=')) {
      const op = eat().v;
      a = { kind: 'bin', op, a, b: parseAdd() };
    }
    return a;
  }
  function parseAdd() {
    let a = parseMul();
    while (peek().t === TOK.OP && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v;
      a = { kind: 'bin', op, a, b: parseMul() };
    }
    return a;
  }
  function parseMul() {
    let a = parseUnary();
    while (peek().t === TOK.OP && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
      const op = eat().v;
      a = { kind: 'bin', op, a, b: parseUnary() };
    }
    return a;
  }
  function parseUnary() {
    if (peek().t === TOK.OP && (peek().v === '!' || peek().v === '-')) {
      const op = eat().v;
      return { kind: 'unary', op, a: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const k = peek();
    if (k.t === TOK.NUM) { eat(); return { kind: 'lit', v: k.v }; }
    if (k.t === TOK.STR) { eat(); return { kind: 'lit', v: k.v }; }
    if (k.t === TOK.BOOL) { eat(); return { kind: 'lit', v: k.v }; }
    if (k.t === TOK.NULL) { eat(); return { kind: 'lit', v: null }; }
    if (k.t === TOK.LP) { eat(); const e = parseOr(); expect(TOK.RP); return e; }
    if (k.t === TOK.IDENT) return parseMember();
    throw new Error('unexpected token');
  }
  function parseMember() {
    const root = eat();
    const path = [root.v];
    while (peek().t === TOK.DOT || peek().t === TOK.LB) {
      if (peek().t === TOK.DOT) {
        eat();
        const id = expect(TOK.IDENT);
        path.push(id.v);
      } else {
        eat();
        const inner = parseOr();
        expect(TOK.RB);
        path.push({ dyn: inner });
      }
    }
    return { kind: 'member', path };
  }

  const ast = parseOr();
  if (peek().t !== TOK.EOF) throw new Error('unexpected trailing tokens');
  return ast;
}

function evalAst(ast, scope) {
  switch (ast.kind) {
    case 'lit': return ast.v;
    case 'unary': {
      const v = evalAst(ast.a, scope);
      if (ast.op === '!') return !v;
      if (ast.op === '-') return -v;
      return undefined;
    }
    case 'bin': {
      // short-circuit for && and ||
      if (ast.op === '&&') return evalAst(ast.a, scope) && evalAst(ast.b, scope);
      if (ast.op === '||') return evalAst(ast.a, scope) || evalAst(ast.b, scope);
      const a = evalAst(ast.a, scope);
      const b = evalAst(ast.b, scope);
      switch (ast.op) {
        case '==': return a == b; // eslint-disable-line eqeqeq
        case '!=': return a != b; // eslint-disable-line eqeqeq
        case '===': return a === b;
        case '!==': return a !== b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
      }
      return undefined;
    }
    case 'member': {
      let cur = scope[ast.path[0]];
      for (let i = 1; i < ast.path.length; i++) {
        if (cur == null) return undefined;
        const seg = ast.path[i];
        if (typeof seg === 'string') cur = cur[seg];
        else cur = cur[evalAst(seg.dyn, scope)];
      }
      return cur;
    }
  }
  return undefined;
}

function evaluateCondition(expr, ctx) {
  if (expr == null) return true;
  if (typeof expr === 'boolean') return expr;
  if (typeof expr !== 'string') return false;
  try {
    const ast = parseExpr(expr);
    const val = evalAst(ast, { ctx });
    return !!val;
  } catch (_e) {
    return false;
  }
}

// ─── in-memory DB fallback ──────────────────────────────────────────────────

function createMemoryDb() {
  const instances = new Map();
  return {
    saveInstance(inst) { instances.set(inst.id, deepClone(inst)); },
    loadInstance(id) {
      const i = instances.get(id);
      return i ? deepClone(i) : null;
    },
    deleteInstance(id) { instances.delete(id); },
    listInstances(filter) {
      const out = [];
      for (const i of instances.values()) {
        if (!filter) { out.push(deepClone(i)); continue; }
        let ok = true;
        for (const k of Object.keys(filter)) {
          if (i[k] !== filter[k]) { ok = false; break; }
        }
        if (ok) out.push(deepClone(i));
      }
      return out;
    },
    appendHistory(instanceId, entry) {
      const i = instances.get(instanceId);
      if (!i) return;
      i.history = i.history || [];
      i.history.push(deepClone(entry));
    },
    _raw: instances,
  };
}

// ─── built-in workflow definitions ──────────────────────────────────────────

const BUILT_IN_WORKFLOWS = [
  // 1. Invoice approval — small / medium / large thresholds
  {
    id: 'invoice-approval',
    name: 'אישור חשבונית ספק / Invoice Approval',
    description: 'Small < 5k auto; 5k-50k manager; >50k manager + finance',
    trigger: { type: 'event', name: 'invoice.created' },
    steps: [
      { id: 'amount-check', type: 'condition', if: 'ctx.amount > 5000', then: 'manager-approve', else: 'auto-approve' },
      { id: 'auto-approve', type: 'action', do: 'invoice.approve', next: 'notify' },
      {
        id: 'manager-approve', type: 'approval',
        assignee: 'role:manager',
        timeout_hours: 48,
        escalate_to: 'role:director',
        next: 'finance-gate',
      },
      { id: 'finance-gate', type: 'condition', if: 'ctx.amount > 50000', then: 'finance-approve', else: 'invoice-approve-action' },
      {
        id: 'finance-approve', type: 'approval',
        assignee: 'role:accountant',
        timeout_hours: 72,
        next: 'invoice-approve-action',
      },
      { id: 'invoice-approve-action', type: 'action', do: 'invoice.approve', next: 'notify' },
      { id: 'notify', type: 'action', do: 'notification.send' },
    ],
  },

  // 2. Employee onboarding
  {
    id: 'employee-onboarding',
    name: 'קליטת עובד חדש / Employee Onboarding',
    trigger: { type: 'event', name: 'employee.hired' },
    steps: [
      {
        id: 'parallel-setup', type: 'parallel',
        branches: ['create-user', 'create-payroll', 'create-101'],
        next: 'hr-review',
      },
      { id: 'create-user', type: 'action', do: 'auth.createUser' },
      { id: 'create-payroll', type: 'action', do: 'payroll.createEmployee' },
      { id: 'create-101', type: 'action', do: 'tax.form101.create' },
      { id: 'hr-review', type: 'approval', assignee: 'role:hr', timeout_hours: 72, next: 'welcome' },
      { id: 'welcome', type: 'action', do: 'notification.send' },
    ],
  },

  // 3. Expense reimbursement
  {
    id: 'expense-reimbursement',
    name: 'החזר הוצאות / Expense Reimbursement',
    trigger: { type: 'event', name: 'expense.submitted' },
    steps: [
      { id: 'check-amount', type: 'condition', if: 'ctx.amount > 1000', then: 'manager-approve', else: 'auto-pay' },
      { id: 'manager-approve', type: 'approval', assignee: 'role:manager', timeout_hours: 48, next: 'finance-pay' },
      { id: 'auto-pay', type: 'action', do: 'payment.create', next: 'notify' },
      { id: 'finance-pay', type: 'action', do: 'payment.create', next: 'notify' },
      { id: 'notify', type: 'action', do: 'notification.send' },
    ],
  },

  // 4. Vendor onboarding
  {
    id: 'vendor-onboarding',
    name: 'קליטת ספק / Vendor Onboarding',
    trigger: { type: 'event', name: 'vendor.registered' },
    steps: [
      { id: 'kyc', type: 'action', do: 'vendor.kyc', retry: { max: 3, backoff_ms: 1000 }, next: 'legal-review' },
      { id: 'legal-review', type: 'approval', assignee: 'role:legal', timeout_hours: 168, next: 'finance-review' },
      { id: 'finance-review', type: 'approval', assignee: 'role:accountant', timeout_hours: 72, next: 'activate' },
      { id: 'activate', type: 'action', do: 'vendor.activate', next: 'notify' },
      { id: 'notify', type: 'action', do: 'notification.send' },
    ],
  },

  // 5. Payment release
  {
    id: 'payment-release',
    name: 'שחרור תשלום / Payment Release',
    trigger: { type: 'event', name: 'payment.requested' },
    steps: [
      { id: 'threshold', type: 'condition', if: 'ctx.amount >= 100000', then: 'dual-approve', else: 'single-approve' },
      {
        id: 'dual-approve', type: 'parallel',
        branches: ['cfo-approve', 'ceo-approve'],
        next: 'release',
      },
      { id: 'cfo-approve', type: 'approval', assignee: 'role:cfo', timeout_hours: 48 },
      { id: 'ceo-approve', type: 'approval', assignee: 'role:ceo', timeout_hours: 72 },
      { id: 'single-approve', type: 'approval', assignee: 'role:accountant', timeout_hours: 24, next: 'release' },
      { id: 'release', type: 'action', do: 'payment.release', next: 'notify' },
      { id: 'notify', type: 'action', do: 'notification.send' },
    ],
  },
];

// ─── Engine class ───────────────────────────────────────────────────────────

class WorkflowEngine extends EventEmitter {
  constructor(db) {
    super();
    this.setMaxListeners(100);
    this.db = db || createMemoryDb();
    this.workflows = new Map();     // id -> definition
    this.actions = new Map();       // name -> fn(ctx, step) -> result
    this.triggers = new Map();      // eventName -> Set<workflowId>
    this.timers = new Map();        // instanceId:stepId -> timeoutHandle
    this.now = nowMs;               // injectable clock for tests
    this._registerDefaults();
    for (const wf of BUILT_IN_WORKFLOWS) this.defineWorkflow(wf);
  }

  // ── defaults ──────────────────────────────────────────────────────────────
  _registerDefaults() {
    // Default no-op actions — can be overridden by registerAction()
    const noop = (name) => (ctx) => ({ ok: true, action: name, ctx: { ...ctx } });
    this.registerAction('invoice.approve', noop('invoice.approve'));
    this.registerAction('notification.send', noop('notification.send'));
    this.registerAction('payment.create', noop('payment.create'));
    this.registerAction('payment.release', noop('payment.release'));
    this.registerAction('auth.createUser', noop('auth.createUser'));
    this.registerAction('payroll.createEmployee', noop('payroll.createEmployee'));
    this.registerAction('tax.form101.create', noop('tax.form101.create'));
    this.registerAction('vendor.kyc', noop('vendor.kyc'));
    this.registerAction('vendor.activate', noop('vendor.activate'));
  }

  // ── definition management ────────────────────────────────────────────────
  defineWorkflow(definition) {
    if (!definition || typeof definition !== 'object') {
      throw new Error('workflow: definition must be an object');
    }
    if (!definition.id || typeof definition.id !== 'string') {
      throw new Error('workflow: id is required');
    }
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      throw new Error('workflow: steps[] is required');
    }
    const ids = new Set();
    for (const s of definition.steps) {
      if (!s.id) throw new Error('workflow: every step needs an id');
      if (ids.has(s.id)) throw new Error('workflow: duplicate step id ' + s.id);
      ids.add(s.id);
      if (!s.type) throw new Error('workflow: step ' + s.id + ' missing type');
      const types = ['condition', 'approval', 'action', 'parallel', 'sequential', 'delay', 'notify'];
      if (!types.includes(s.type)) throw new Error('workflow: bad step type ' + s.type);
    }
    // Validate references (best-effort)
    for (const s of definition.steps) {
      const refs = [];
      if (s.next) refs.push(s.next);
      if (s.then) refs.push(s.then);
      if (s.else) refs.push(s.else);
      if (Array.isArray(s.branches)) for (const b of s.branches) refs.push(b);
      for (const r of refs) {
        if (!ids.has(r)) throw new Error('workflow: step "' + s.id + '" references unknown step "' + r + '"');
      }
    }
    const frozen = freezeDeep(deepClone(definition));
    this.workflows.set(definition.id, frozen);
    // Register trigger
    if (definition.trigger && definition.trigger.type === 'event' && definition.trigger.name) {
      let set = this.triggers.get(definition.trigger.name);
      if (!set) { set = new Set(); this.triggers.set(definition.trigger.name, set); }
      set.add(definition.id);
    }
    return frozen;
  }

  getWorkflow(id) {
    return this.workflows.get(id) || null;
  }

  listWorkflows() {
    return Array.from(this.workflows.values());
  }

  registerAction(name, fn) {
    if (typeof name !== 'string' || typeof fn !== 'function') {
      throw new Error('registerAction: bad args');
    }
    this.actions.set(name, fn);
  }

  // ── triggering ───────────────────────────────────────────────────────────
  trigger(workflowId, context) {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error('trigger: unknown workflow ' + workflowId);
    const id = genId('wfi');
    const startedAt = this.now();
    const instance = {
      id,
      workflowId,
      status: STATUS.PENDING,
      context: deepClone(context || {}),
      startedAt,
      updatedAt: startedAt,
      completedAt: null,
      currentStepId: null,
      pendingSteps: [], // stack for sequential-like progression
      stepStates: {},   // id -> { status, startedAt, finishedAt, ... }
      history: [],
      approvals: [],    // pending approvals: [{ stepId, assignee, dueAt }]
      sla: null,
      error: null,
    };
    this._audit(instance, 'workflow.started', { workflowId, context: instance.context });
    const firstStep = wf.steps[0];
    instance.currentStepId = firstStep.id;
    instance.status = STATUS.RUNNING;
    this.db.saveInstance(instance);
    this._runStep(instance, firstStep.id);
    this.db.saveInstance(instance);
    return id;
  }

  // Event-driven entry point. Emits the event and also fires any
  // workflow whose trigger matches.
  emitEvent(eventName, context) {
    const ids = [];
    const set = this.triggers.get(eventName);
    if (set) {
      for (const wfId of set) ids.push(this.trigger(wfId, context));
    }
    this.emit(eventName, context);
    return ids;
  }

  // ── running steps ─────────────────────────────────────────────────────────
  _runStep(instance, stepId) {
    if (!stepId) return this._complete(instance);
    if (instance.status !== STATUS.RUNNING) return;

    const wf = this.workflows.get(instance.workflowId);
    const step = wf.steps.find((s) => s.id === stepId);
    if (!step) {
      instance.status = STATUS.FAILED;
      instance.error = 'unknown step: ' + stepId;
      this._audit(instance, 'workflow.failed', { error: instance.error });
      return;
    }

    // Skip if `when` is false
    if (step.when != null && !evaluateCondition(step.when, instance.context)) {
      instance.stepStates[step.id] = {
        status: STEP_STATUS.SKIPPED,
        startedAt: this.now(),
        finishedAt: this.now(),
      };
      this._audit(instance, 'step.skipped', { stepId: step.id, reason: 'when=false' });
      return this._advance(instance, step, step.next || null);
    }

    instance.currentStepId = step.id;
    instance.stepStates[step.id] = {
      status: STEP_STATUS.RUNNING,
      startedAt: this.now(),
    };
    this._audit(instance, 'step.started', { stepId: step.id, type: step.type });

    switch (step.type) {
      case 'condition': return this._runCondition(instance, step);
      case 'approval':  return this._runApproval(instance, step);
      case 'action':    return this._runAction(instance, step);
      case 'parallel':  return this._runParallel(instance, step);
      case 'sequential': return this._runSequential(instance, step);
      case 'delay':     return this._runDelay(instance, step);
      case 'notify':    return this._runAction(instance, { ...step, do: step.do || 'notification.send' });
    }
  }

  _runCondition(instance, step) {
    const cond = evaluateCondition(step.if, instance.context);
    const next = cond ? step.then : step.else;
    instance.stepStates[step.id].status = STEP_STATUS.COMPLETED;
    instance.stepStates[step.id].finishedAt = this.now();
    instance.stepStates[step.id].branchTaken = cond ? 'then' : 'else';
    this._audit(instance, 'step.completed', { stepId: step.id, branch: cond ? 'then' : 'else' });
    this._advance(instance, step, next || step.next || null);
  }

  _runApproval(instance, step) {
    instance.stepStates[step.id].status = STEP_STATUS.WAITING;
    instance.status = STATUS.WAITING;
    const dueAt = step.timeout_hours
      ? this.now() + step.timeout_hours * HOUR_MS
      : null;
    const approval = {
      stepId: step.id,
      assignee: step.assignee,
      dueAt,
      createdAt: this.now(),
      escalateTo: step.escalate_to || null,
    };
    instance.approvals.push(approval);
    instance.stepStates[step.id].dueAt = dueAt;
    instance.stepStates[step.id].assignee = step.assignee;
    // SLA
    if (dueAt != null) {
      instance.sla = instance.sla || { dueAt };
      if (dueAt < instance.sla.dueAt) instance.sla.dueAt = dueAt;
    }
    this._audit(instance, 'step.waiting', { stepId: step.id, assignee: step.assignee, dueAt });
    this.db.saveInstance(instance);

    // Install timeout if not zero.  Skip in test mode where now() was overridden
    // but real timers are still desired — caller decides by passing timeout_hours.
    if (dueAt != null && !this._suppressTimers) {
      const msRemaining = dueAt - this.now();
      if (msRemaining > 0 && msRemaining < 2_147_483_000) {
        const key = instance.id + ':' + step.id;
        const handle = setTimeout(() => this._handleTimeout(instance.id, step.id), msRemaining);
        if (handle && typeof handle.unref === 'function') handle.unref();
        this.timers.set(key, handle);
      }
    }
  }

  _runAction(instance, step) {
    const actionName = step.do || step.action;
    if (!actionName) {
      instance.stepStates[step.id].status = STEP_STATUS.FAILED;
      this._audit(instance, 'step.failed', { stepId: step.id, error: 'no action name' });
      instance.status = STATUS.FAILED;
      instance.error = 'action step ' + step.id + ' has no do/action';
      return;
    }
    const fn = this.actions.get(actionName);
    if (!fn) {
      instance.stepStates[step.id].status = STEP_STATUS.FAILED;
      instance.status = STATUS.FAILED;
      instance.error = 'unknown action: ' + actionName;
      this._audit(instance, 'step.failed', { stepId: step.id, error: instance.error });
      return;
    }

    const retry = step.retry || { max: 0, backoff_ms: 0 };
    let attempt = 0;
    let lastErr = null;
    while (attempt <= (retry.max || 0)) {
      try {
        const result = fn(instance.context, step);
        instance.stepStates[step.id].status = STEP_STATUS.COMPLETED;
        instance.stepStates[step.id].finishedAt = this.now();
        instance.stepStates[step.id].attempts = attempt + 1;
        instance.stepStates[step.id].result = result == null ? null : (typeof result === 'object' ? deepClone(result) : result);
        this._audit(instance, 'step.completed', { stepId: step.id, action: actionName, attempt: attempt + 1 });
        return this._advance(instance, step, step.next || null);
      } catch (e) {
        lastErr = (e && e.message) || String(e);
        attempt++;
        this._audit(instance, 'step.retry', { stepId: step.id, attempt, error: lastErr });
      }
    }
    // Exhausted
    instance.stepStates[step.id].status = STEP_STATUS.FAILED;
    instance.stepStates[step.id].finishedAt = this.now();
    instance.stepStates[step.id].error = lastErr;
    instance.status = STATUS.FAILED;
    instance.error = 'action failed after retries: ' + lastErr;
    this._audit(instance, 'step.failed', { stepId: step.id, error: lastErr });
  }

  _runParallel(instance, step) {
    const branches = step.branches || [];
    const state = instance.stepStates[step.id];
    state.branches = {};
    state.remaining = branches.length;
    state.parallelNext = step.next || null;
    state.status = STEP_STATUS.WAITING;
    instance.parallelMap = instance.parallelMap || {};
    // For every branch we note its parent parallel step id so that the branch's
    // terminal step can call back into the join.
    for (const b of branches) {
      instance.parallelMap[b] = { parentId: step.id };
      state.branches[b] = { status: STEP_STATUS.PENDING };
    }
    this._audit(instance, 'step.parallel.started', { stepId: step.id, branches });
    // Fire off each branch independently
    for (const b of branches) this._runStep(instance, b);
  }

  _runSequential(instance, step) {
    const branches = step.branches || [];
    const state = instance.stepStates[step.id];
    state.sequence = branches.slice();
    state.index = 0;
    state.status = STEP_STATUS.RUNNING;
    if (branches.length === 0) {
      state.status = STEP_STATUS.COMPLETED;
      state.finishedAt = this.now();
      return this._advance(instance, step, step.next || null);
    }
    instance.sequentialMap = instance.sequentialMap || {};
    for (let i = 0; i < branches.length; i++) {
      instance.sequentialMap[branches[i]] = {
        parentId: step.id,
        index: i,
        next: i + 1 < branches.length ? branches[i + 1] : null,
        parentNext: step.next || null,
      };
    }
    this._runStep(instance, branches[0]);
  }

  _runDelay(instance, step) {
    const ms = Number(step.ms || 0);
    instance.stepStates[step.id].status = STEP_STATUS.WAITING;
    instance.stepStates[step.id].resumeAt = this.now() + ms;
    if (ms <= 0) {
      instance.stepStates[step.id].status = STEP_STATUS.COMPLETED;
      return this._advance(instance, step, step.next || null);
    }
    const key = instance.id + ':' + step.id;
    const handle = setTimeout(() => {
      const cur = this.db.loadInstance(instance.id) || instance;
      cur.stepStates[step.id].status = STEP_STATUS.COMPLETED;
      this._audit(cur, 'step.completed', { stepId: step.id, type: 'delay' });
      this._advance(cur, step, step.next || null);
      this.db.saveInstance(cur);
    }, ms);
    if (handle && typeof handle.unref === 'function') handle.unref();
    this.timers.set(key, handle);
  }

  // ── advance / join logic ──────────────────────────────────────────────────
  _advance(instance, step, nextId) {
    if (instance.status === STATUS.FAILED || instance.status === STATUS.CANCELLED) return;

    // Is this step a leaf inside a parallel branch?
    if (instance.parallelMap && instance.parallelMap[step.id] && !nextId) {
      const parentId = instance.parallelMap[step.id].parentId;
      const parent = instance.stepStates[parentId];
      if (parent && parent.branches && parent.branches[step.id]) {
        parent.branches[step.id].status = STEP_STATUS.COMPLETED;
        parent.remaining = Math.max(0, parent.remaining - 1);
        if (parent.remaining === 0) {
          parent.status = STEP_STATUS.COMPLETED;
          parent.finishedAt = this.now();
          this._audit(instance, 'step.parallel.completed', { stepId: parentId });
          // Resume parent's next
          return this._advance(instance, { id: parentId }, parent.parallelNext);
        }
      }
      return; // still waiting for peers
    }

    // Is this step a leaf inside a sequential parent?
    if (instance.sequentialMap && instance.sequentialMap[step.id] && !nextId) {
      const info = instance.sequentialMap[step.id];
      if (info.next) {
        return this._runStep(instance, info.next);
      }
      // Parent done → advance parent
      const parent = instance.stepStates[info.parentId];
      if (parent) {
        parent.status = STEP_STATUS.COMPLETED;
        parent.finishedAt = this.now();
        this._audit(instance, 'step.sequential.completed', { stepId: info.parentId });
      }
      return this._advance(instance, { id: info.parentId }, info.parentNext);
    }

    // Normal flow
    if (!nextId) return this._complete(instance);
    this._runStep(instance, nextId);
  }

  _complete(instance) {
    if (instance.status === STATUS.COMPLETED) return;
    instance.status = STATUS.COMPLETED;
    instance.completedAt = this.now();
    instance.updatedAt = this.now();
    this._clearTimers(instance.id);
    this._audit(instance, 'workflow.completed', {});
    this.db.saveInstance(instance);
    this.emit('workflow.completed', { instanceId: instance.id });
  }

  // ── approvals ─────────────────────────────────────────────────────────────
  approve(instanceId, stepId, userId, decision, comment) {
    const instance = this.db.loadInstance(instanceId);
    if (!instance) throw new Error('approve: unknown instance ' + instanceId);
    if (instance.status === STATUS.CANCELLED) throw new Error('approve: instance cancelled');
    if (instance.status === STATUS.COMPLETED) throw new Error('approve: instance completed');
    if (instance.status === STATUS.PAUSED) throw new Error('approve: instance is paused');

    const state = instance.stepStates[stepId];
    if (!state) throw new Error('approve: unknown step ' + stepId);
    if (state.status !== STEP_STATUS.WAITING) throw new Error('approve: step not waiting (' + state.status + ')');

    const wf = this.workflows.get(instance.workflowId);
    const step = wf.steps.find((s) => s.id === stepId);
    if (!step) throw new Error('approve: step missing from workflow');

    // Role gating — assignee of form "role:manager" | "user:<id>"
    if (step.assignee && userId && !this._canApprove(step.assignee, userId, instance.context)) {
      throw new Error('approve: user ' + userId + ' not authorized for ' + step.assignee);
    }

    const approvedAt = this.now();
    state.decision = decision;
    state.decidedBy = userId || null;
    state.decidedAt = approvedAt;
    state.comment = comment || null;
    state.finishedAt = approvedAt;
    // Remove from pending approvals
    instance.approvals = instance.approvals.filter((a) => a.stepId !== stepId);
    this._clearTimer(instance.id, stepId);
    instance.status = STATUS.RUNNING;

    if (decision === DECISION.APPROVE) {
      state.status = STEP_STATUS.APPROVED;
      this._audit(instance, 'approval.approved', { stepId, userId, comment });
      this._advance(instance, step, step.next || null);
    } else if (decision === DECISION.REJECT) {
      state.status = STEP_STATUS.REJECTED;
      this._audit(instance, 'approval.rejected', { stepId, userId, comment });
      instance.status = STATUS.COMPLETED; // rejection ends the flow terminally
      instance.completedAt = approvedAt;
      instance.result = { rejected: true, by: userId, at: approvedAt };
      this._audit(instance, 'workflow.completed', { result: 'rejected' });
      this.emit('workflow.rejected', { instanceId });
    } else {
      throw new Error('approve: invalid decision ' + decision);
    }
    this.db.saveInstance(instance);
  }

  _canApprove(assignee, userId, ctx) {
    if (!assignee) return true;
    // "user:123" — exact match
    if (assignee.startsWith('user:')) return assignee.slice(5) === String(userId);
    // "role:manager" / "group:finance" — engine is role-agnostic; callers that
    // supply ctx.users[userId].roles will be checked here automatically.
    const parts = assignee.split(':');
    const kind = parts[0];
    const value = parts.slice(1).join(':');
    const users = ctx && ctx.users;
    if (users && users[userId]) {
      const u = users[userId];
      if (kind === 'role' && Array.isArray(u.roles) && u.roles.includes(value)) return true;
      if (kind === 'group' && Array.isArray(u.groups) && u.groups.includes(value)) return true;
    }
    // No user record at all → permissive (tests / dev)
    if (!users) return true;
    return false;
  }

  // ── timeout + escalation ──────────────────────────────────────────────────
  _handleTimeout(instanceId, stepId) {
    const instance = this.db.loadInstance(instanceId);
    if (!instance) return;
    const state = instance.stepStates[stepId];
    if (!state || state.status !== STEP_STATUS.WAITING) return;
    const wf = this.workflows.get(instance.workflowId);
    const step = wf.steps.find((s) => s.id === stepId);
    if (!step) return;
    if (step.escalate_to) {
      state.escalated = true;
      state.escalatedAt = this.now();
      state.escalatedTo = step.escalate_to;
      state.originalAssignee = step.assignee;
      state.assignee = step.escalate_to;
      state.status = STEP_STATUS.WAITING; // still waiting, new assignee
      // refresh approval queue
      instance.approvals = instance.approvals.map((a) =>
        a.stepId === stepId ? { ...a, assignee: step.escalate_to, dueAt: this.now() + HOUR_MS * 24 } : a
      );
      this._audit(instance, 'approval.escalated', { stepId, from: step.assignee, to: step.escalate_to });
      this.emit('approval.escalated', { instanceId, stepId, to: step.escalate_to });
    } else {
      state.status = STEP_STATUS.TIMED_OUT;
      state.finishedAt = this.now();
      instance.approvals = instance.approvals.filter((a) => a.stepId !== stepId);
      instance.status = STATUS.FAILED;
      instance.error = 'timeout on step ' + stepId;
      this._audit(instance, 'step.timed_out', { stepId });
      this.emit('workflow.failed', { instanceId, stepId, reason: 'timeout' });
    }
    this.db.saveInstance(instance);
  }

  // Force timeout (for tests / manual). Returns true if handled.
  forceTimeout(instanceId, stepId) {
    this._handleTimeout(instanceId, stepId);
    return true;
  }

  // ── queries ───────────────────────────────────────────────────────────────
  getInstance(instanceId) {
    const inst = this.db.loadInstance(instanceId);
    if (!inst) return null;
    return {
      ...inst,
      state: inst.status,
      history: inst.history || [],
      stepStates: inst.stepStates || {},
    };
  }

  listInstances(filter) {
    return (this.db.listInstances(filter || null) || []).map((i) => ({ ...i }));
  }

  listPending(userId) {
    const result = [];
    const all = this.db.listInstances(null) || [];
    for (const inst of all) {
      if (inst.status !== STATUS.WAITING && inst.status !== STATUS.RUNNING) continue;
      for (const ap of (inst.approvals || [])) {
        const wf = this.workflows.get(inst.workflowId);
        const step = wf ? wf.steps.find((s) => s.id === ap.stepId) : null;
        if (!step) continue;
        if (!step.assignee) continue;
        if (userId == null || this._canApprove(step.assignee, userId, inst.context)) {
          result.push({
            instanceId: inst.id,
            workflowId: inst.workflowId,
            stepId: ap.stepId,
            assignee: ap.assignee,
            dueAt: ap.dueAt,
            createdAt: ap.createdAt,
          });
        }
      }
    }
    return result;
  }

  // ── control-flow ──────────────────────────────────────────────────────────
  pause(instanceId, reason) {
    const instance = this.db.loadInstance(instanceId);
    if (!instance) throw new Error('pause: unknown instance');
    if (instance.status === STATUS.COMPLETED || instance.status === STATUS.CANCELLED) {
      throw new Error('pause: instance already terminal');
    }
    instance._prevStatus = instance.status;
    instance.status = STATUS.PAUSED;
    this._audit(instance, 'workflow.paused', { reason: reason || null });
    this.db.saveInstance(instance);
  }

  resume(instanceId) {
    const instance = this.db.loadInstance(instanceId);
    if (!instance) throw new Error('resume: unknown instance');
    if (instance.status !== STATUS.PAUSED) throw new Error('resume: not paused');
    instance.status = instance._prevStatus || STATUS.RUNNING;
    delete instance._prevStatus;
    this._audit(instance, 'workflow.resumed', {});
    this.db.saveInstance(instance);
  }

  cancel(instanceId, reason) {
    const instance = this.db.loadInstance(instanceId);
    if (!instance) throw new Error('cancel: unknown instance');
    if (instance.status === STATUS.COMPLETED || instance.status === STATUS.CANCELLED) return;
    instance.status = STATUS.CANCELLED;
    instance.completedAt = this.now();
    instance.error = reason || 'cancelled by user';
    // Mark any waiting steps
    for (const id of Object.keys(instance.stepStates)) {
      const st = instance.stepStates[id];
      if (st.status === STEP_STATUS.WAITING || st.status === STEP_STATUS.RUNNING) {
        st.status = STEP_STATUS.SKIPPED;
        st.finishedAt = this.now();
      }
    }
    instance.approvals = [];
    this._clearTimers(instance.id);
    this._audit(instance, 'workflow.cancelled', { reason: reason || null });
    this.db.saveInstance(instance);
    this.emit('workflow.cancelled', { instanceId, reason });
  }

  // ── audit + timers ────────────────────────────────────────────────────────
  _audit(instance, type, payload) {
    const entry = {
      at: this.now(),
      type,
      payload: payload || {},
    };
    instance.history = instance.history || [];
    instance.history.push(entry);
    instance.updatedAt = entry.at;
    try { this.db.appendHistory(instance.id, entry); } catch (_e) { /* soft */ }
    this.emit('audit', { instanceId: instance.id, entry });
  }

  _clearTimer(instanceId, stepId) {
    const key = instanceId + ':' + stepId;
    const h = this.timers.get(key);
    if (h) { clearTimeout(h); this.timers.delete(key); }
  }

  _clearTimers(instanceId) {
    for (const key of Array.from(this.timers.keys())) {
      if (key.startsWith(instanceId + ':')) {
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
      }
    }
  }

  // Shut down — used in tests to avoid leaking timers.
  shutdown() {
    for (const h of this.timers.values()) clearTimeout(h);
    this.timers.clear();
    this.removeAllListeners();
  }
}

// ─── factory ────────────────────────────────────────────────────────────────

function createEngine(db) {
  return new WorkflowEngine(db);
}

// ─── exports ────────────────────────────────────────────────────────────────

module.exports = {
  createEngine,
  WorkflowEngine,
  BUILT_IN_WORKFLOWS,
  STATUS,
  STEP_STATUS,
  DECISION,
  // exposed for tests
  evaluateCondition,
  parseExpr,
  createMemoryDb,
};
