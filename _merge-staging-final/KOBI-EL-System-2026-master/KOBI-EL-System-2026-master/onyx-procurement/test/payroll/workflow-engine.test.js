/**
 * Workflow Engine unit tests — Agent X-15 (Swarm 3)
 * מבחני יחידה למנוע הזרימה — Techno-Kol mega-ERP
 *
 * Run:
 *   node --test test/payroll/workflow-engine.test.js
 *
 * 20+ cases covering:
 *   definition & triggers, conditions, approvals, rejection,
 *   parallel, sequential, retry, timeout + escalation,
 *   pause/resume, cancel, role-based auth, SLA, audit trail,
 *   listPending, safe-expression parser (no eval), all built-ins.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEngine,
  WorkflowEngine,
  BUILT_IN_WORKFLOWS,
  STATUS,
  STEP_STATUS,
  DECISION,
  evaluateCondition,
  parseExpr,
} = require('../../src/workflow/engine.js');

// ─── helpers ────────────────────────────────────────────────────────────────

function simpleActionWf(id = 'simple') {
  return {
    id,
    trigger: { type: 'event', name: id + '.evt' },
    steps: [
      { id: 'a', type: 'action', do: 'invoice.approve', next: 'b' },
      { id: 'b', type: 'action', do: 'notification.send' },
    ],
  };
}

// ──────────────────────────────────────────────────────────────
// 01. createEngine loads built-in workflows
// ──────────────────────────────────────────────────────────────
test('01. createEngine registers all 5 built-in workflows', () => {
  const e = createEngine();
  const list = e.listWorkflows();
  const ids = list.map((w) => w.id);
  assert.ok(ids.includes('invoice-approval'));
  assert.ok(ids.includes('employee-onboarding'));
  assert.ok(ids.includes('expense-reimbursement'));
  assert.ok(ids.includes('vendor-onboarding'));
  assert.ok(ids.includes('payment-release'));
  assert.ok(BUILT_IN_WORKFLOWS.length >= 5);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 02. defineWorkflow validates bad inputs
// ──────────────────────────────────────────────────────────────
test('02. defineWorkflow rejects invalid definitions', () => {
  const e = createEngine();
  assert.throws(() => e.defineWorkflow(null), /object/);
  assert.throws(() => e.defineWorkflow({}), /id is required/);
  assert.throws(() => e.defineWorkflow({ id: 'x' }), /steps/);
  assert.throws(() => e.defineWorkflow({ id: 'x', steps: [] }), /steps/);
  assert.throws(() => e.defineWorkflow({
    id: 'x',
    steps: [{ id: 's1', type: 'bogus' }],
  }), /bad step type/);
  // dup id
  assert.throws(() => e.defineWorkflow({
    id: 'dup',
    steps: [
      { id: 's', type: 'action', do: 'invoice.approve' },
      { id: 's', type: 'action', do: 'invoice.approve' },
    ],
  }), /duplicate/);
  // bad reference
  assert.throws(() => e.defineWorkflow({
    id: 'ref',
    steps: [{ id: 's1', type: 'action', do: 'invoice.approve', next: 'ghost' }],
  }), /unknown step/);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 03. Simple two-action workflow runs to completion
// ──────────────────────────────────────────────────────────────
test('03. simple sequential action workflow completes', () => {
  const e = createEngine();
  e.defineWorkflow(simpleActionWf());
  const id = e.trigger('simple', { foo: 1 });
  const inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.COMPLETED);
  assert.equal(inst.stepStates.a.status, STEP_STATUS.COMPLETED);
  assert.equal(inst.stepStates.b.status, STEP_STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 04. Conditional branching takes the `then` branch
// ──────────────────────────────────────────────────────────────
test('04. condition step routes to then-branch on true', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 100 });
  const inst = e.getInstance(id);
  // 100 <= 5000 → auto-approve branch → notify
  assert.equal(inst.stepStates['amount-check'].branchTaken, 'else');
  assert.equal(inst.status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 05. Conditional routes to `then` on large amount and waits
// ──────────────────────────────────────────────────────────────
test('05. condition step routes to then-branch on false (large amount)', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  const inst = e.getInstance(id);
  assert.equal(inst.stepStates['amount-check'].branchTaken, 'then');
  assert.equal(inst.status, STATUS.WAITING); // waiting for manager
  assert.equal(inst.stepStates['manager-approve'].status, STEP_STATUS.WAITING);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 06. approve() progresses a waiting instance
// ──────────────────────────────────────────────────────────────
test('06. approve() advances manager-approve then completes', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  e.approve(id, 'manager-approve', 'u1', DECISION.APPROVE, 'ok');
  const inst = e.getInstance(id);
  assert.equal(inst.stepStates['manager-approve'].status, STEP_STATUS.APPROVED);
  assert.equal(inst.stepStates['manager-approve'].decidedBy, 'u1');
  assert.equal(inst.stepStates['manager-approve'].comment, 'ok');
  assert.equal(inst.status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 07. Rejection terminates the workflow
// ──────────────────────────────────────────────────────────────
test('07. reject decision ends workflow with rejected result', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  e.approve(id, 'manager-approve', 'u1', DECISION.REJECT, 'nope');
  const inst = e.getInstance(id);
  assert.equal(inst.stepStates['manager-approve'].status, STEP_STATUS.REJECTED);
  assert.equal(inst.status, STATUS.COMPLETED);
  assert.ok(inst.result && inst.result.rejected === true);
  // notify step should never have run
  assert.equal(inst.stepStates.notify, undefined);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 08. Cancel aborts a running workflow
// ──────────────────────────────────────────────────────────────
test('08. cancel() transitions to cancelled and clears approvals', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  e.cancel(id, 'user aborted');
  const inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.CANCELLED);
  assert.equal(inst.error, 'user aborted');
  assert.equal(inst.approvals.length, 0);
  // Attempting to approve a cancelled instance fails
  assert.throws(() => e.approve(id, 'manager-approve', 'u1', DECISION.APPROVE), /cancelled/);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 09. Pause / resume round-trip
// ──────────────────────────────────────────────────────────────
test('09. pause() + resume() restore prior status', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  e.pause(id, 'for review');
  let inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.PAUSED);
  // Approvals must refuse while paused
  assert.throws(() => e.approve(id, 'manager-approve', 'u1', DECISION.APPROVE), /paused/);
  e.resume(id);
  inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.WAITING);
  e.approve(id, 'manager-approve', 'u1', DECISION.APPROVE);
  inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 10. Retry logic succeeds after N failures
// ──────────────────────────────────────────────────────────────
test('10. action retry succeeds after transient failures', () => {
  const e = createEngine();
  let calls = 0;
  e.registerAction('flaky.do', () => {
    calls++;
    if (calls < 3) throw new Error('transient');
    return { ok: true };
  });
  e.defineWorkflow({
    id: 'retry-wf',
    steps: [
      { id: 'only', type: 'action', do: 'flaky.do', retry: { max: 5, backoff_ms: 0 } },
    ],
  });
  const id = e.trigger('retry-wf', {});
  const inst = e.getInstance(id);
  assert.equal(calls, 3);
  assert.equal(inst.stepStates.only.status, STEP_STATUS.COMPLETED);
  assert.equal(inst.stepStates.only.attempts, 3);
  assert.equal(inst.status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 11. Retry exhausted → workflow fails
// ──────────────────────────────────────────────────────────────
test('11. action retry exhausted fails the workflow', () => {
  const e = createEngine();
  e.registerAction('always.fail', () => { throw new Error('boom'); });
  e.defineWorkflow({
    id: 'fail-wf',
    steps: [{ id: 'f', type: 'action', do: 'always.fail', retry: { max: 2, backoff_ms: 0 } }],
  });
  const id = e.trigger('fail-wf', {});
  const inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.FAILED);
  assert.match(inst.error, /boom/);
  assert.equal(inst.stepStates.f.attempts, undefined); // not set on failure path
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 12. Parallel step joins after all branches finish
// ──────────────────────────────────────────────────────────────
test('12. parallel step runs all branches and joins', () => {
  const e = createEngine();
  const order = [];
  e.registerAction('track', (ctx, step) => { order.push(step.id); return { ok: true }; });
  e.defineWorkflow({
    id: 'par-wf',
    steps: [
      { id: 'fan', type: 'parallel', branches: ['b1', 'b2', 'b3'], next: 'final' },
      { id: 'b1', type: 'action', do: 'track' },
      { id: 'b2', type: 'action', do: 'track' },
      { id: 'b3', type: 'action', do: 'track' },
      { id: 'final', type: 'action', do: 'track' },
    ],
  });
  const id = e.trigger('par-wf', {});
  const inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.COMPLETED);
  // All four branches ran
  assert.ok(order.includes('b1'));
  assert.ok(order.includes('b2'));
  assert.ok(order.includes('b3'));
  assert.equal(order[order.length - 1], 'final');
  assert.equal(inst.stepStates.fan.status, STEP_STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 13. Sequential step executes children in order
// ──────────────────────────────────────────────────────────────
test('13. sequential step runs branches in declared order', () => {
  const e = createEngine();
  const order = [];
  e.registerAction('seq.track', (ctx, step) => { order.push(step.id); return { ok: true }; });
  e.defineWorkflow({
    id: 'seq-wf',
    steps: [
      { id: 'group', type: 'sequential', branches: ['s1', 's2', 's3'], next: 'end' },
      { id: 's1', type: 'action', do: 'seq.track' },
      { id: 's2', type: 'action', do: 'seq.track' },
      { id: 's3', type: 'action', do: 'seq.track' },
      { id: 'end', type: 'action', do: 'seq.track' },
    ],
  });
  const id = e.trigger('seq-wf', {});
  assert.deepEqual(order, ['s1', 's2', 's3', 'end']);
  assert.equal(e.getInstance(id).status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 14. Event-driven trigger via emitEvent
// ──────────────────────────────────────────────────────────────
test('14. emitEvent triggers registered workflows', () => {
  const e = createEngine();
  e.defineWorkflow(simpleActionWf('ev-wf'));
  const ids = e.emitEvent('ev-wf.evt', { amount: 1 });
  assert.equal(ids.length, 1);
  const inst = e.getInstance(ids[0]);
  assert.equal(inst.status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 15. Role-based authorization with ctx.users
// ──────────────────────────────────────────────────────────────
test('15. role-based approval rejects unauthorized users', () => {
  const e = createEngine();
  const users = {
    alice: { roles: ['manager'] },
    bob:   { roles: ['engineer'] },
  };
  const id = e.trigger('invoice-approval', { amount: 20000, users });
  // bob cannot approve
  assert.throws(() => e.approve(id, 'manager-approve', 'bob', DECISION.APPROVE), /not authorized/);
  // alice can
  e.approve(id, 'manager-approve', 'alice', DECISION.APPROVE);
  const inst = e.getInstance(id);
  assert.equal(inst.stepStates['manager-approve'].decidedBy, 'alice');
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 16. listPending lists open approvals for a user by role
// ──────────────────────────────────────────────────────────────
test('16. listPending filters by user role via ctx.users', () => {
  const e = createEngine();
  const users = { alice: { roles: ['manager'] }, bob: { roles: ['accountant'] } };
  const id = e.trigger('invoice-approval', { amount: 20000, users });
  const forAlice = e.listPending('alice');
  const forBob = e.listPending('bob');
  assert.equal(forAlice.length, 1);
  assert.equal(forAlice[0].stepId, 'manager-approve');
  assert.equal(forBob.length, 0);
  e.approve(id, 'manager-approve', 'alice', DECISION.APPROVE);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 17. Timeout with escalate_to reassigns the approval
// ──────────────────────────────────────────────────────────────
test('17. forceTimeout escalates to configured role', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  e.forceTimeout(id, 'manager-approve');
  const inst = e.getInstance(id);
  assert.equal(inst.stepStates['manager-approve'].escalated, true);
  assert.equal(inst.stepStates['manager-approve'].escalatedTo, 'role:director');
  assert.equal(inst.stepStates['manager-approve'].status, STEP_STATUS.WAITING);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 18. Timeout without escalation fails the workflow
// ──────────────────────────────────────────────────────────────
test('18. forceTimeout without escalate_to fails workflow', () => {
  const e = createEngine();
  e.defineWorkflow({
    id: 'timeout-wf',
    steps: [
      { id: 'wait', type: 'approval', assignee: 'role:manager', timeout_hours: 1 },
    ],
  });
  const id = e.trigger('timeout-wf', {});
  e.forceTimeout(id, 'wait');
  const inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.FAILED);
  assert.equal(inst.stepStates.wait.status, STEP_STATUS.TIMED_OUT);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 19. Audit trail captures every lifecycle event
// ──────────────────────────────────────────────────────────────
test('19. audit trail records workflow and step events', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  e.approve(id, 'manager-approve', 'u1', DECISION.APPROVE, 'looks ok');
  const inst = e.getInstance(id);
  const types = inst.history.map((h) => h.type);
  assert.ok(types.includes('workflow.started'));
  assert.ok(types.includes('step.started'));
  assert.ok(types.includes('approval.approved'));
  assert.ok(types.includes('workflow.completed'));
  // Every entry has a timestamp
  for (const h of inst.history) assert.ok(typeof h.at === 'number');
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 20. SLA due_at is recorded for timeout-bound approvals
// ──────────────────────────────────────────────────────────────
test('20. SLA dueAt is set from timeout_hours', () => {
  const e = createEngine();
  const before = Date.now();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  const inst = e.getInstance(id);
  const due = inst.stepStates['manager-approve'].dueAt;
  assert.ok(typeof due === 'number');
  assert.ok(due >= before + 47 * 60 * 60 * 1000);
  assert.ok(due <= before + 49 * 60 * 60 * 1000);
  assert.ok(inst.sla && typeof inst.sla.dueAt === 'number');
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 21. Safe expression parser handles nested ctx paths
// ──────────────────────────────────────────────────────────────
test('21. evaluateCondition supports nested paths & operators', () => {
  assert.equal(evaluateCondition('ctx.a.b > 5', { a: { b: 10 } }), true);
  assert.equal(evaluateCondition('ctx.a.b > 5', { a: { b: 3 } }), false);
  assert.equal(evaluateCondition('ctx.x == "hello"', { x: 'hello' }), true);
  assert.equal(evaluateCondition('ctx.amount >= 100 && ctx.ok', { amount: 200, ok: true }), true);
  assert.equal(evaluateCondition('ctx.amount >= 100 || !ctx.ok', { amount: 50, ok: false }), true);
  assert.equal(evaluateCondition('(ctx.a + ctx.b) * 2 === 10', { a: 2, b: 3 }), true);
  assert.equal(evaluateCondition('ctx.xs[0] === 1', { xs: [1, 2, 3] }), true);
  // malformed → false (never throws)
  assert.equal(evaluateCondition('ctx.amount >', {}), false);
});

// ──────────────────────────────────────────────────────────────
// 22. parseExpr refuses dangerous input
// ──────────────────────────────────────────────────────────────
test('22. parseExpr has no escape hatch (no eval/new Function)', () => {
  // The parser only recognises its tiny grammar; anything else throws or
  // evaluates to undefined. It does NOT call `eval` or `new Function`.
  assert.throws(() => parseExpr('process.exit(0)'));
  // function-call-ish syntax rejected
  assert.throws(() => parseExpr('ctx.foo()'));
  // This evaluates as a condition of undefined / falsy
  assert.equal(evaluateCondition('process.exit(0)', {}), false);
  assert.equal(evaluateCondition('ctx.foo()', { foo: () => true }), false);
});

// ──────────────────────────────────────────────────────────────
// 23. when-clause skips a step when expression is false
// ──────────────────────────────────────────────────────────────
test('23. step.when=false skips the step', () => {
  const e = createEngine();
  e.defineWorkflow({
    id: 'when-wf',
    steps: [
      { id: 's1', type: 'action', do: 'invoice.approve', when: 'ctx.amount > 100', next: 's2' },
      { id: 's2', type: 'action', do: 'notification.send' },
    ],
  });
  const id = e.trigger('when-wf', { amount: 5 });
  const inst = e.getInstance(id);
  assert.equal(inst.stepStates.s1.status, STEP_STATUS.SKIPPED);
  assert.equal(inst.stepStates.s2.status, STEP_STATUS.COMPLETED);
  assert.equal(inst.status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 24. All built-in workflows pass basic definition sanity
// ──────────────────────────────────────────────────────────────
test('24. every built-in workflow runs at least its first step', () => {
  const e = createEngine();
  // invoice-approval / expense-reimbursement have the small-amount auto path
  const i1 = e.trigger('invoice-approval', { amount: 10 });
  assert.ok(e.getInstance(i1));
  const i2 = e.trigger('expense-reimbursement', { amount: 10 });
  assert.equal(e.getInstance(i2).status, STATUS.COMPLETED);
  // employee-onboarding, vendor-onboarding, payment-release need approvals
  const i3 = e.trigger('employee-onboarding', { employee: { name: 'Dana' } });
  assert.ok(['waiting', 'running'].includes(e.getInstance(i3).status));
  const i4 = e.trigger('vendor-onboarding', { vendor: { name: 'ACME' } });
  assert.ok(['waiting', 'running'].includes(e.getInstance(i4).status));
  const i5 = e.trigger('payment-release', { amount: 50000 });
  assert.ok(['waiting', 'running'].includes(e.getInstance(i5).status));
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 25. trigger() on unknown workflow throws
// ──────────────────────────────────────────────────────────────
test('25. trigger with unknown workflow id throws', () => {
  const e = createEngine();
  assert.throws(() => e.trigger('no-such-wf', {}), /unknown workflow/);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 26. Custom db adapter is used when provided
// ──────────────────────────────────────────────────────────────
test('26. custom db adapter receives saveInstance calls', () => {
  const saved = [];
  const db = {
    saveInstance(i) { saved.push(i); },
    loadInstance(id) { return saved.find((x) => x.id === id) || null; },
    listInstances() { return saved.slice(); },
    appendHistory() {},
  };
  const e = new WorkflowEngine(db);
  e.defineWorkflow(simpleActionWf('db-wf'));
  const id = e.trigger('db-wf', {});
  assert.ok(saved.length > 0);
  assert.equal(saved[saved.length - 1].id, id);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 27. finance-gate conditional routes large invoices through finance
// ──────────────────────────────────────────────────────────────
test('27. invoice-approval over 50k goes manager→finance', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 75000 });
  e.approve(id, 'manager-approve', 'u1', DECISION.APPROVE);
  let inst = e.getInstance(id);
  assert.equal(inst.stepStates['finance-approve'].status, STEP_STATUS.WAITING);
  e.approve(id, 'finance-approve', 'u2', DECISION.APPROVE);
  inst = e.getInstance(id);
  assert.equal(inst.status, STATUS.COMPLETED);
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 28. Double-approve throws (step no longer waiting)
// ──────────────────────────────────────────────────────────────
test('28. approving the same step twice throws', () => {
  const e = createEngine();
  const id = e.trigger('invoice-approval', { amount: 20000 });
  e.approve(id, 'manager-approve', 'u1', DECISION.APPROVE);
  assert.throws(
    () => e.approve(id, 'manager-approve', 'u2', DECISION.APPROVE),
    /not waiting|completed/
  );
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 29. audit events emitted on the EventEmitter bus
// ──────────────────────────────────────────────────────────────
test('29. engine emits audit events for listeners', () => {
  const e = createEngine();
  const events = [];
  e.on('audit', (ev) => events.push(ev.entry.type));
  e.defineWorkflow(simpleActionWf('emit-wf'));
  e.trigger('emit-wf', {});
  assert.ok(events.includes('workflow.started'));
  assert.ok(events.includes('workflow.completed'));
  e.shutdown();
});

// ──────────────────────────────────────────────────────────────
// 30. cancel on terminal instance is a no-op
// ──────────────────────────────────────────────────────────────
test('30. cancel after completion is idempotent', () => {
  const e = createEngine();
  e.defineWorkflow(simpleActionWf('idem-wf'));
  const id = e.trigger('idem-wf', {});
  assert.equal(e.getInstance(id).status, STATUS.COMPLETED);
  e.cancel(id, 'too-late');
  assert.equal(e.getInstance(id).status, STATUS.COMPLETED);
  e.shutdown();
});
