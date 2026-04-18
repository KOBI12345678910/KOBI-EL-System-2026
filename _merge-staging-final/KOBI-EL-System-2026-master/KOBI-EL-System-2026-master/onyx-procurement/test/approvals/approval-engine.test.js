/**
 * ApprovalEngine unit tests — Agent Y-109 (Techno-Kol Uzi mega-ERP)
 * מבחני יחידה למנוע האישורים הגנרי
 *
 * Run:  node --test test/approvals/approval-engine.test.js
 *
 * Coverage:
 *   - defineFlow validation
 *   - routing logic (sequential, parallel, conditional)
 *   - parallel aggregation (one-of / all-of / majority)
 *   - delegation (out-of-office)
 *   - escalation on timeout
 *   - amount-based routing
 *   - metrics (avg time, bottleneck, rejection rate)
 *   - bulk approval
 *   - mobile token sign/verify
 *   - bilingual history
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ApprovalEngine,
  STATUS,
  DECISIONS,
  DEFAULT_TIERS,
  evalCondition,
} = require('../../src/approvals/approval-engine.js');

// ─── helpers ────────────────────────────────────────────────────────────────

function mkEngine(startAt = 1_700_000_000_000) {
  let t = startAt;
  const eng = new ApprovalEngine({
    now: () => t,
    secret: 'test-secret-abcdef1234567890',
    defaultTimeoutMs: 60_000,
  });
  return {
    eng,
    advance(ms) { t += ms; },
    clock() { return t; },
  };
}

function invoiceFlow() {
  return {
    id: 'inv-standard',
    name_he: 'אישור חשבונית סטנדרטי',
    name_en: 'Standard invoice approval',
    entity: 'invoice',
    steps: [
      {
        id: 'manager',
        name_he: 'מנהל צוות',
        name_en: 'Team manager',
        type: 'one-of',
        approvers: ['alice@co.il', 'bob@co.il'],
        timeout: 30_000,
        condition: true,
      },
      {
        id: 'director',
        name_he: 'מנהל כספים',
        name_en: 'Finance director',
        type: 'one-of',
        approvers: ['carol@co.il'],
        timeout: 60_000,
        condition: 'ctx.payload.amount > 10000',
      },
    ],
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

test('01. defineFlow validates required fields', () => {
  const { eng } = mkEngine();
  assert.throws(() => eng.defineFlow(null), /requires object/);
  assert.throws(() => eng.defineFlow({}), /flow\.id required/);
  assert.throws(() => eng.defineFlow({ id: 'x', entity: 'foo', steps: [] }), /entity invalid/);
  assert.throws(() => eng.defineFlow({ id: 'x', entity: 'invoice', steps: [] }), /steps/);
  assert.throws(() => eng.defineFlow({
    id: 'x', entity: 'invoice', steps: [{ id: 's1', type: 'bad', approvers: ['a'] }],
  }), /type invalid/);
  assert.throws(() => eng.defineFlow({
    id: 'x', entity: 'invoice', steps: [{ id: 's1', type: 'one-of', approvers: [] }],
  }), /approvers required/);
});

test('02. defineFlow registers valid flow and returns it', () => {
  const { eng } = mkEngine();
  const flow = eng.defineFlow(invoiceFlow());
  assert.equal(flow.id, 'inv-standard');
  assert.equal(flow.entity, 'invoice');
  assert.equal(flow.steps.length, 2);
  assert.equal(eng.listFlows().length, 1);
  assert.equal(eng.getFlow('inv-standard').id, 'inv-standard');
});

test('03. startRequest rejects unknown flow', () => {
  const { eng } = mkEngine();
  assert.throws(() => eng.startRequest({
    flowId: 'nope', entity: 'invoice', initiator: 'u1', payload: {},
  }), /unknown flow/);
});

test('04. startRequest creates request in-review', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard',
    entity: 'invoice',
    initiator: 'initiator@co.il',
    payload: { amount: 5000, vendor: 'Acme' },
  });
  assert.ok(req.id);
  assert.equal(req.status, STATUS.IN_REVIEW);
  assert.equal(req.currentStep, 0);
  assert.equal(req.currentStepId, 'manager');
  assert.ok(req.history.length >= 1);
  assert.equal(req.history[0].type, 'request.started');
});

test('05. routeToApprovers returns current step approvers (sequential)', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 5000 },
  });
  const approvers = eng.routeToApprovers(req.id);
  assert.deepEqual(approvers.sort(), ['alice@co.il', 'bob@co.il']);
});

test('06. one-of step: single approval advances', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 5000 }, // below 10k — skips director step
  });
  const r = eng.submitDecision({
    requestId: req.id, approver: 'alice@co.il', decision: 'approve', comments: 'ok',
  });
  assert.ok([STATUS.APPROVED, STATUS.IN_REVIEW].includes(r.status));
  const final = eng.getRequest(req.id);
  assert.equal(final.status, STATUS.APPROVED);
});

test('07. conditional step is skipped when condition false', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 2000 }, // < 10000 triggers skip
  });
  eng.submitDecision({
    requestId: req.id, approver: 'alice@co.il', decision: 'approve',
  });
  const final = eng.getRequest(req.id);
  assert.equal(final.status, STATUS.APPROVED);
  const hist = eng.historyView(req.id);
  const skipped = hist.find((h) => h.type === 'step.skipped');
  assert.ok(skipped, 'director step should be skipped');
  assert.ok(skipped.note.he.includes('דולג'));
});

test('08. two-step sequential requires director for amount > 10k', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 50000 },
  });
  eng.submitDecision({ requestId: req.id, approver: 'alice@co.il', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.IN_REVIEW);
  const route2 = eng.routeToApprovers(req.id);
  assert.deepEqual(route2, ['carol@co.il']);
  eng.submitDecision({ requestId: req.id, approver: 'carol@co.il', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.APPROVED);
});

test('09. rejection terminates the flow', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 50000 },
  });
  eng.submitDecision({
    requestId: req.id, approver: 'alice@co.il', decision: 'reject', comments: 'bad price',
  });
  assert.equal(eng.getRequest(req.id).status, STATUS.REJECTED);
  const hist = eng.historyView(req.id);
  assert.ok(hist.some((h) => h.type === 'request.rejected'));
});

test('10. parallel aggregation with all-of requires every approver', () => {
  const { eng } = mkEngine();
  eng.defineFlow({
    id: 'parallel-all',
    entity: 'contract',
    parallel: true,
    steps: [
      { id: 's1', type: 'all-of', approvers: ['a', 'b', 'c'] },
    ],
  });
  const req = eng.startRequest({
    flowId: 'parallel-all', entity: 'contract', initiator: 'u1', payload: { amount: 1000 },
  });
  eng.submitDecision({ requestId: req.id, approver: 'a', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.IN_REVIEW);
  eng.submitDecision({ requestId: req.id, approver: 'b', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.IN_REVIEW);
  eng.submitDecision({ requestId: req.id, approver: 'c', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.APPROVED);
});

test('11. parallel aggregation with majority', () => {
  const { eng } = mkEngine();
  eng.defineFlow({
    id: 'parallel-maj',
    entity: 'custom',
    parallel: true,
    steps: [{ id: 's1', type: 'majority', approvers: ['a', 'b', 'c', 'd', 'e'] }],
  });
  const req = eng.startRequest({
    flowId: 'parallel-maj', entity: 'custom', initiator: 'u1', payload: {},
  });
  eng.submitDecision({ requestId: req.id, approver: 'a', decision: 'approve' });
  eng.submitDecision({ requestId: req.id, approver: 'b', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.IN_REVIEW);
  eng.submitDecision({ requestId: req.id, approver: 'c', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.APPROVED);
});

test('12. parallel with multiple steps all-done -> approved', () => {
  const { eng } = mkEngine();
  eng.defineFlow({
    id: 'multi-par',
    entity: 'custom',
    parallel: true,
    steps: [
      { id: 'legal',   type: 'one-of', approvers: ['legal@co.il'] },
      { id: 'finance', type: 'one-of', approvers: ['fin@co.il'] },
      { id: 'it',      type: 'one-of', approvers: ['it@co.il'] },
    ],
  });
  const req = eng.startRequest({
    flowId: 'multi-par', entity: 'custom', initiator: 'u1', payload: {},
  });
  const routes = eng.routeToApprovers(req.id);
  assert.equal(routes.length, 3);
  eng.submitDecision({ requestId: req.id, approver: 'legal@co.il', decision: 'approve' });
  eng.submitDecision({ requestId: req.id, approver: 'fin@co.il', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.IN_REVIEW);
  eng.submitDecision({ requestId: req.id, approver: 'it@co.il', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.APPROVED);
});

test('13. delegation routes approvers to delegate during window', () => {
  const { eng, clock } = mkEngine();
  eng.defineFlow(invoiceFlow());
  eng.delegateAuthority({
    fromUser: 'alice@co.il',
    toUser: 'dan@co.il',
    dateRange: { from: clock() - 1000, to: clock() + 10 * 60 * 60 * 1000 },
    scope: { entities: ['invoice'], maxAmount: Infinity },
  });
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 5000 },
  });
  const route = eng.routeToApprovers(req.id);
  assert.ok(route.includes('dan@co.il'), 'delegate should receive route');
  assert.ok(!route.includes('alice@co.il'), 'original should be replaced');
  // Dan can submit
  const r = eng.submitDecision({ requestId: req.id, approver: 'dan@co.il', decision: 'approve' });
  assert.equal(eng.getRequest(req.id).status, STATUS.APPROVED);
  assert.ok(r);
});

test('14. delegation respects entity scope', () => {
  const { eng, clock } = mkEngine();
  eng.defineFlow(invoiceFlow());
  eng.delegateAuthority({
    fromUser: 'alice@co.il',
    toUser: 'dan@co.il',
    dateRange: { from: clock() - 1000, to: clock() + 10 * 60 * 60 * 1000 },
    scope: { entities: ['po'], maxAmount: Infinity }, // only PO, not invoice
  });
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 5000 },
  });
  const route = eng.routeToApprovers(req.id);
  assert.ok(route.includes('alice@co.il'), 'scope mismatch — original should stay');
  assert.ok(!route.includes('dan@co.il'));
});

test('15. escalation on timeout', () => {
  const { eng, advance } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 5000 },
  });
  advance(31_000); // past the 30s step timeout
  const out = eng.checkTimeouts();
  assert.ok(out.includes(req.id));
  const final = eng.getRequest(req.id);
  assert.equal(final.status, STATUS.ESCALATED);
  const hist = eng.historyView(req.id);
  assert.ok(hist.some((h) => h.type === 'escalated' && h.data.reason === 'timeout'));
});

test('16. manual escalate() sets status and returns targets', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 100_000 },
  });
  const targets = eng.escalate(req.id, 'urgent');
  assert.ok(Array.isArray(targets));
  assert.equal(eng.getRequest(req.id).status, STATUS.ESCALATED);
});

test('17. amountBasedRouting returns tier chain', () => {
  const { eng } = mkEngine();
  // invoice tiers: 1k, 10k, 50k, 250k, Inf -> lead, mgr, dir, vp, ceo
  const r1 = eng.amountBasedRouting({ entity: 'invoice', amount: 500 });
  assert.equal(r1.finalApprover, 'role:team-lead');
  const r2 = eng.amountBasedRouting({ entity: 'invoice', amount: 5000 });
  assert.equal(r2.finalApprover, 'role:manager');
  const r3 = eng.amountBasedRouting({ entity: 'invoice', amount: 40000 });
  assert.equal(r3.finalApprover, 'role:director');
  const r4 = eng.amountBasedRouting({ entity: 'invoice', amount: 200000 });
  assert.equal(r4.finalApprover, 'role:vp-finance');
  const r5 = eng.amountBasedRouting({ entity: 'invoice', amount: 5_000_000 });
  assert.equal(r5.finalApprover, 'role:ceo');
});

test('18. amountBasedRouting for PO tier', () => {
  const { eng } = mkEngine();
  const r = eng.amountBasedRouting({ entity: 'po', amount: 30000 });
  assert.equal(r.finalApprover, 'role:director');
  assert.equal(r.currency, 'ILS');
  assert.equal(r.entity, 'po');
});

test('19. conditionalApproval attaches conditions', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 5000 },
  });
  const conds = eng.conditionalApproval({
    requestId: req.id,
    conditions: ['must deliver within 30 days', 'add net-60 terms'],
  });
  assert.equal(conds.length, 2);
  const hist = eng.historyView(req.id);
  assert.ok(hist.some((h) => h.type === 'conditions.attached'));
});

test('20. historyView returns bilingual entries', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 2000 },
  });
  eng.submitDecision({ requestId: req.id, approver: 'alice@co.il', decision: 'approve' });
  const hist = eng.historyView(req.id);
  assert.ok(hist.length >= 3);
  for (const h of hist) {
    assert.ok(h.note.he, 'hebrew note present');
    assert.ok(h.note.en, 'english note present');
    assert.ok(h.at_iso, 'iso timestamp present');
  }
});

test('21. metrics — rejection rate and avg time', () => {
  const { eng, advance } = mkEngine();
  eng.defineFlow(invoiceFlow());
  // 3 approved, 1 rejected
  for (let i = 0; i < 3; i++) {
    const r = eng.startRequest({
      flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 2000 },
    });
    advance(1000);
    eng.submitDecision({ requestId: r.id, approver: 'alice@co.il', decision: 'approve' });
  }
  const rej = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 2000 },
  });
  advance(2000);
  eng.submitDecision({ requestId: rej.id, approver: 'alice@co.il', decision: 'reject' });

  const m = eng.metrics({ flowId: 'inv-standard' });
  assert.equal(m.total, 4);
  assert.equal(m.approved, 3);
  assert.equal(m.rejected, 1);
  assert.equal(m.rejectionRate, 0.25);
  assert.ok(m.avgDecisionTimeMs > 0);
  assert.ok(m.bottleneckStep !== null);
});

test('22. metrics identify bottleneck step', () => {
  const { eng, advance } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const r = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 50000 },
  });
  advance(2000);
  eng.submitDecision({ requestId: r.id, approver: 'alice@co.il', decision: 'approve' });
  advance(10000); // director is slow
  eng.submitDecision({ requestId: r.id, approver: 'carol@co.il', decision: 'approve' });
  const m = eng.metrics({ flowId: 'inv-standard' });
  assert.equal(m.bottleneckStep, 'director', 'director should be slowest');
});

test('23. bulkApproval processes multiple requests', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = eng.startRequest({
      flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 500 },
    });
    ids.push(r.id);
  }
  const res = eng.bulkApproval(ids, 'alice@co.il');
  assert.equal(res.approved.length, 5);
  for (const id of ids) {
    assert.equal(eng.getRequest(id).status, STATUS.APPROVED);
  }
});

test('24. bulkApproval handles non-existent ids gracefully', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const res = eng.bulkApproval(['bogus1', 'bogus2'], 'alice@co.il');
  assert.equal(res.failed.length, 2);
  assert.equal(res.approved.length, 0);
});

test('25. mobileApprovalToken generates and verifies', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 5000 },
  });
  const tk = eng.mobileApprovalToken({ requestId: req.id, approver: 'alice@co.il' });
  assert.ok(tk.token);
  assert.ok(tk.token.includes('.'));
  assert.ok(tk.url.startsWith('/mobile/approve?t='));
  const payload = eng.verifyMobileToken(tk.token);
  assert.ok(payload);
  assert.equal(payload.rid, req.id);
  assert.equal(payload.ap, 'alice@co.il');
});

test('26. mobileApprovalToken rejects tampered token', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 5000 },
  });
  const tk = eng.mobileApprovalToken({ requestId: req.id });
  // tamper with signature
  const tampered = tk.token.slice(0, -2) + 'aa';
  assert.equal(eng.verifyMobileToken(tampered), null);
  assert.equal(eng.verifyMobileToken('garbage'), null);
  assert.equal(eng.verifyMobileToken(null), null);
});

test('27. mobileApprovalToken expires', () => {
  const { eng, advance } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1', payload: { amount: 5000 },
  });
  const tk = eng.mobileApprovalToken({ requestId: req.id, ttlMs: 5000 });
  advance(6000);
  assert.equal(eng.verifyMobileToken(tk.token), null);
});

test('28. safe evalCondition handles expressions', () => {
  assert.equal(evalCondition('ctx.amount > 5000', { amount: 6000 }), true);
  assert.equal(evalCondition('ctx.amount > 5000', { amount: 2000 }), false);
  assert.equal(evalCondition('ctx.a == 1 && ctx.b == 2', { a: 1, b: 2 }), true);
  assert.equal(evalCondition('ctx.a == 1 || ctx.b == 2', { a: 0, b: 2 }), true);
  assert.equal(evalCondition(true, {}), true);
  assert.equal(evalCondition('!(ctx.x > 3)', { x: 1 }), true);
});

test('29. evalCondition returns false on bad expression', () => {
  assert.equal(evalCondition('this is not valid', {}), false);
  assert.equal(evalCondition('ctx.a +', {}), false);
});

test('30. idempotent — same approver cannot vote twice on same step', () => {
  const { eng } = mkEngine();
  eng.defineFlow({
    id: 'par',
    entity: 'custom',
    parallel: true,
    steps: [{ id: 's', type: 'all-of', approvers: ['a', 'b'] }],
  });
  const req = eng.startRequest({
    flowId: 'par', entity: 'custom', initiator: 'u1', payload: {},
  });
  eng.submitDecision({ requestId: req.id, approver: 'a', decision: 'approve' });
  const second = eng.submitDecision({ requestId: req.id, approver: 'a', decision: 'approve' });
  assert.equal(second.message, 'already voted');
});

test('31. request-info decision does not close request', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 5000 },
  });
  eng.submitDecision({
    requestId: req.id, approver: 'alice@co.il', decision: 'request-info',
    comments: 'need more details',
  });
  const r = eng.getRequest(req.id);
  assert.notEqual(r.status, STATUS.APPROVED);
  assert.notEqual(r.status, STATUS.REJECTED);
});

test('32. unauthorized approver is rejected', () => {
  const { eng } = mkEngine();
  eng.defineFlow(invoiceFlow());
  const req = eng.startRequest({
    flowId: 'inv-standard', entity: 'invoice', initiator: 'u1',
    payload: { amount: 5000 },
  });
  assert.throws(() => eng.submitDecision({
    requestId: req.id, approver: 'random@co.il', decision: 'approve',
  }), /not authorized/);
});

test('33. DEFAULT_TIERS is present for all entities', () => {
  const entities = ['invoice','po','expense','contract','change-order','timecard','leave','new-vendor','new-customer','custom'];
  for (const e of entities) {
    assert.ok(DEFAULT_TIERS[e], 'tiers missing for ' + e);
    assert.ok(DEFAULT_TIERS[e].length > 0);
  }
});
