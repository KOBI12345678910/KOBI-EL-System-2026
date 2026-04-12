/* ============================================================================
 * Techno-Kol ERP — PO Approval Matrix Test Suite
 * Agent X-38 / Swarm 3C / 2026-04-11
 * ----------------------------------------------------------------------------
 * Coverage (30 cases):
 *   01  resolveBracket — boundary classification (0, 1k, 5k, 25k, 100k, 1M)
 *   02  evaluatePO — auto bracket returns empty approver list
 *   03  evaluatePO — low bracket (₪3,000) requires manager only
 *   04  evaluatePO — medium bracket (₪15,000) requires manager + dept head
 *   05  evaluatePO — high bracket (₪50,000) requires mgr + head + CFO
 *   06  evaluatePO — very high bracket (₪500,000) full chain incl. CEO Kobi
 *   07  evaluatePO — capex > ₪50k adds board review
 *   08  evaluatePO — capex ≤ ₪50k does NOT add board but is tagged capex
 *   09  evaluatePO — strategic medium bracket promotes CFO
 *   10  evaluatePO — vendor risk tier D blocks submission
 *   11  evaluatePO — vendor risk tier C adds CFO review
 *   12  evaluatePO — emergency flag yields parallel flow + retroactive deadline
 *   13  evaluatePO — substitute approver applied when active+in-window
 *   14  evaluatePO — substitute approver NOT applied after `until`
 *   15  evaluatePO — department-specific manager via context.department_manager_of
 *   16  submitForApproval — auto-approved PO reaches APPROVED immediately
 *   17  submitForApproval — sequential flow notifies only first step
 *   18  submitForApproval — budget check failure raises E_BUDGET_EXCEEDED
 *   19  submitForApproval — vendor compliance failure raises E_VENDOR_COMPLIANCE
 *   20  submitForApproval — duplicate detector raises E_DUPLICATE_PO
 *   21  approve — sequential chain walks step-by-step to APPROVED
 *   22  approve — rejection terminates with E_NOT_PENDING afterwards
 *   23  approve — rejection requires a non-empty reason
 *   24  approve — wrong-user approval raises E_NOT_ELIGIBLE
 *   25  approve — delegation lets delegate approve on behalf of original
 *   26  getPendingApprovals — returns only requests awaiting a given user
 *   27  escalate — moves request to ESCALATED and preserves history
 *   28  tick — auto-escalates expired steps via deterministic clock
 *   29  tick — emergency retroactive deadline expires unratified PO
 *   30  amend — re-routes PO when amount increases >10%
 *   31  getHistory — returns full audit trail with events in order
 *   32  delegate — rejects zero / negative window and self-delegation
 *   33  integration — notifier + audit hooks fire with expected payloads
 *
 * Zero dependencies. Runs under plain `node path/to/this/file.js`.
 * ========================================================================== */

'use strict';

const path = require('path');

const approvalMatrixPath = path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'po',
  'approval-matrix.js'
);

const {
  evaluatePO,
  resolveBracket,
  createApprovalSystem,
  BRACKET,
  CATEGORY,
  RISK_TIER,
  REQUEST_STATUS,
  DECISION,
  ROLE,
} = require(approvalMatrixPath);

// ─── Tiny harness ──────────────────────────────────────────────────────────

const results = [];
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg || 'assertEq') +
        ': expected ' + JSON.stringify(expected) +
        ', got ' + JSON.stringify(actual)
    );
  }
}
function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || 'assertDeep') + ': ' + a + ' !== ' + e);
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}
function assertThrows(fn, code, msg) {
  let threw = false;
  let err = null;
  try { fn(); } catch (e) { threw = true; err = e; }
  if (!threw) throw new Error((msg || 'expected throw') + ' (no throw)');
  if (code && err && err.code !== code) {
    throw new Error(
      (msg || 'expected throw') +
        ' (expected code ' + code + ', got ' + err.code + ': ' + err.message + ')'
    );
  }
}

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log('  ok   - ' + name);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log('  FAIL - ' + name + '\n         ' + err.message);
  }
}

// ─── Deterministic clock factory ───────────────────────────────────────────

function mkClock(start) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; return t; },
    set: (v) => { t = v; },
  };
}

// ─── Shared fixtures ───────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;

function ctx() {
  return {
    now: T0,
    roleHolders: {
      [ROLE.CEO]: ['kobi'],
      [ROLE.CFO]: ['cfo_user'],
      [ROLE.BOARD]: ['board_1', 'board_2'],
    },
    department_manager_of: (dept) => 'mgr_' + dept,
    substitutes: {},
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

console.log('approval-matrix.test.js — Techno-Kol ERP / Agent X-38');
console.log('----------------------------------------------------');

test('01 resolveBracket — boundary classification', () => {
  assertEq(resolveBracket(0),       BRACKET.AUTO);
  assertEq(resolveBracket(1),       BRACKET.AUTO);
  assertEq(resolveBracket(1000),    BRACKET.AUTO);
  assertEq(resolveBracket(1001),    BRACKET.LOW);
  assertEq(resolveBracket(5000),    BRACKET.LOW);
  assertEq(resolveBracket(5001),    BRACKET.MEDIUM);
  assertEq(resolveBracket(25000),   BRACKET.MEDIUM);
  assertEq(resolveBracket(25001),   BRACKET.HIGH);
  assertEq(resolveBracket(100000),  BRACKET.HIGH);
  assertEq(resolveBracket(100001),  BRACKET.VERY_HIGH);
  assertEq(resolveBracket(1_000_000), BRACKET.VERY_HIGH);
});

test('02 evaluatePO — auto bracket returns empty chain', () => {
  const plan = evaluatePO({
    id: 'po_auto',
    amount: 500,
    category: CATEGORY.ROUTINE,
    department: 'IT',
    vendor_risk_tier: RISK_TIER.A,
  }, ctx());
  assertEq(plan.flow_type, 'auto');
  assertEq(plan.required_approvers.length, 0);
  assertEq(plan.steps.length, 0);
  assertTrue(plan.rules_applied.includes('R1_AUTO_UNDER_1000'));
});

test('03 evaluatePO — low bracket needs manager only', () => {
  const plan = evaluatePO({
    id: 'po_low', amount: 3000, category: CATEGORY.ROUTINE,
    department: 'IT', vendor_risk_tier: RISK_TIER.A,
  }, ctx());
  assertEq(plan.flow_type, 'sequential');
  assertEq(plan.steps.length, 1);
  assertEq(plan.steps[0].role, ROLE.MANAGER);
  assertDeep(plan.required_approvers, ['mgr_IT']);
  assertTrue(plan.rules_applied.includes('R2b_LOW_MANAGER'));
});

test('04 evaluatePO — medium bracket needs manager + dept head', () => {
  const plan = evaluatePO({
    id: 'po_med', amount: 15000, category: CATEGORY.ROUTINE,
    department: 'Ops', vendor_risk_tier: RISK_TIER.A,
  }, ctx());
  assertEq(plan.steps.length, 2);
  assertEq(plan.steps[0].role, ROLE.MANAGER);
  assertEq(plan.steps[1].role, ROLE.DEPT_HEAD);
  assertDeep(plan.required_approvers, ['mgr_Ops', 'head_Ops']);
});

test('05 evaluatePO — high bracket needs mgr + head + CFO', () => {
  const plan = evaluatePO({
    id: 'po_high', amount: 50000, category: CATEGORY.ROUTINE,
    department: 'Finance', vendor_risk_tier: RISK_TIER.A,
  }, ctx());
  assertEq(plan.steps.length, 3);
  assertEq(plan.steps[2].role, ROLE.CFO);
  assertEq(plan.required_approvers.includes('cfo_user'), true);
});

test('06 evaluatePO — very high bracket full chain includes CEO Kobi', () => {
  const plan = evaluatePO({
    id: 'po_vh', amount: 250000, category: CATEGORY.ROUTINE,
    department: 'Eng', vendor_risk_tier: RISK_TIER.A,
  }, ctx());
  assertEq(plan.steps.length, 4);
  assertEq(plan.steps[3].role, ROLE.CEO);
  assertEq(plan.required_approvers.includes('kobi'), true);
});

test('07 evaluatePO — capex > ₪50k adds board review', () => {
  const plan = evaluatePO({
    id: 'po_capex_big', amount: 75000, category: CATEGORY.CAPEX,
    department: 'Ops', vendor_risk_tier: RISK_TIER.B,
  }, ctx());
  const roles = plan.steps.map((s) => s.role);
  assertTrue(roles.includes(ROLE.BOARD), 'must include board review');
  assertTrue(plan.rules_applied.includes('R3_CAPEX_BOARD_REVIEW'));
});

test('08 evaluatePO — capex ≤ ₪50k tagged but no board', () => {
  const plan = evaluatePO({
    id: 'po_capex_small', amount: 20000, category: CATEGORY.CAPEX,
    department: 'Ops', vendor_risk_tier: RISK_TIER.B,
  }, ctx());
  const roles = plan.steps.map((s) => s.role);
  assertEq(roles.includes(ROLE.BOARD), false);
  assertTrue(plan.rules_applied.includes('R3a_CAPEX_TRACKED'));
});

test('09 evaluatePO — strategic medium promotes CFO', () => {
  const plan = evaluatePO({
    id: 'po_strat', amount: 15000, category: CATEGORY.STRATEGIC,
    department: 'Marketing', vendor_risk_tier: RISK_TIER.B,
  }, ctx());
  const roles = plan.steps.map((s) => s.role);
  assertEq(roles.includes(ROLE.CFO), true);
  assertTrue(plan.rules_applied.includes('R4_STRATEGIC_MEDIUM_ADD_CFO'));
});

test('10 evaluatePO — vendor risk tier D blocks', () => {
  const plan = evaluatePO({
    id: 'po_blocked', amount: 10000, category: CATEGORY.ROUTINE,
    department: 'IT', vendor_risk_tier: RISK_TIER.D,
  }, ctx());
  assertEq(plan.flow_type, 'blocked');
  assertEq(plan.blocked, true);
  assertEq(plan.block_reason, 'vendor_risk_tier_D');
  assertTrue(plan.block_reason_he.length > 0, 'hebrew reason present');
});

test('11 evaluatePO — vendor risk tier C adds CFO', () => {
  const plan = evaluatePO({
    id: 'po_tierC', amount: 4000, category: CATEGORY.ROUTINE,
    department: 'IT', vendor_risk_tier: RISK_TIER.C,
  }, ctx());
  const roles = plan.steps.map((s) => s.role);
  assertEq(roles.includes(ROLE.CFO), true);
  assertTrue(plan.rules_applied.includes('R6_VENDOR_TIER_C_ADD_CFO'));
});

test('12 evaluatePO — emergency → parallel + retroactive deadline', () => {
  const plan = evaluatePO({
    id: 'po_emg', amount: 30000, category: CATEGORY.ROUTINE,
    department: 'Ops', vendor_risk_tier: RISK_TIER.B, emergency: true,
  }, ctx());
  assertEq(plan.flow_type, 'parallel');
  assertEq(plan.emergency, true);
  assertEq(plan.parallel_groups.length, 1);
  assertTrue(plan.retroactive_deadline > T0);
  assertEq(plan.retroactive_deadline - T0, 48 * 60 * 60 * 1000); // 48h
  assertTrue(plan.rules_applied.includes('R8_EMERGENCY_PARALLEL_RETROACTIVE'));
});

test('13 evaluatePO — active substitute replaces original approver', () => {
  const c = ctx();
  c.substitutes = {
    cfo_user: { active: true, sub: 'deputy_cfo', until: T0 + 10 * 60 * 60 * 1000 },
  };
  const plan = evaluatePO({
    id: 'po_sub', amount: 50000, category: CATEGORY.ROUTINE,
    department: 'Finance', vendor_risk_tier: RISK_TIER.A,
  }, c);
  assertEq(plan.required_approvers.includes('cfo_user'), false);
  assertEq(plan.required_approvers.includes('deputy_cfo'), true);
  assertTrue(plan.rules_applied.some((r) => r.startsWith('R7_SUBSTITUTE_cfo_user_TO_deputy_cfo')));
});

test('14 evaluatePO — expired substitute NOT applied', () => {
  const c = ctx();
  c.substitutes = {
    cfo_user: { active: true, sub: 'deputy_cfo', until: T0 - 1 },
  };
  const plan = evaluatePO({
    id: 'po_sub_exp', amount: 50000, category: CATEGORY.ROUTINE,
    department: 'Finance', vendor_risk_tier: RISK_TIER.A,
  }, c);
  assertEq(plan.required_approvers.includes('cfo_user'), true);
  assertEq(plan.required_approvers.includes('deputy_cfo'), false);
});

test('15 evaluatePO — department_manager_of fallback honored', () => {
  const c = ctx();
  c.department_manager_of = (d) => (d === 'IT' ? 'alice' : null);
  const plan = evaluatePO({
    id: 'po_it', amount: 2000, department: 'IT', vendor_risk_tier: RISK_TIER.A,
    category: CATEGORY.ROUTINE,
  }, c);
  assertEq(plan.required_approvers[0], 'alice');
});

test('16 submitForApproval — auto PO reaches APPROVED immediately', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({ clock: clock.now });
  const reqId = sys.submitForApproval({
    id: 'p1', amount: 500, category: CATEGORY.ROUTINE,
    department: 'IT', vendor_risk_tier: RISK_TIER.A, submitter: 'alice',
  });
  const r = sys.getRequest(reqId);
  assertEq(r.status, REQUEST_STATUS.APPROVED);
});

test('17 submitForApproval — sequential notifies only first step', () => {
  const notifications = [];
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    notifier: (e) => notifications.push(e),
    department_manager_of: (d) => 'mgr_' + d,
  });
  sys.submitForApproval({
    id: 'p2', amount: 15000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  const first = notifications.filter((n) => n.kind === 'approval_request');
  assertTrue(first.length >= 1, 'first step notified');
  // Only mgr_IT notified (step 0), head_IT should not be notified yet
  const users = first.map((n) => n.user_id);
  assertEq(users.includes('mgr_IT'), true);
  assertEq(users.includes('head_IT'), false);
});

test('18 submitForApproval — budget rejection', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    budget: { checkBudget: () => ({ ok: false, reason: 'over_budget' }) },
  });
  assertThrows(
    () => sys.submitForApproval({
      id: 'p3', amount: 10000, department: 'IT', category: CATEGORY.ROUTINE,
      vendor_risk_tier: RISK_TIER.A,
    }),
    'E_BUDGET_EXCEEDED',
    'budget exceeded should throw'
  );
});

test('19 submitForApproval — vendor compliance rejection', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    vendor: { getStatus: () => ({ active: false, approved: true, debt: false }) },
  });
  assertThrows(
    () => sys.submitForApproval({
      id: 'p4', amount: 5000, department: 'IT', category: CATEGORY.ROUTINE,
      vendor_id: 'v99', vendor_risk_tier: RISK_TIER.A,
    }),
    'E_VENDOR_COMPLIANCE',
    'inactive vendor should throw'
  );
});

test('20 submitForApproval — duplicate detector rejection', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    dupDetector: (po) => ({ duplicate: true, of: 'po_prev' }),
  });
  assertThrows(
    () => sys.submitForApproval({
      id: 'p5', amount: 5000, department: 'IT', category: CATEGORY.ROUTINE,
      vendor_risk_tier: RISK_TIER.A,
    }),
    'E_DUPLICATE_PO',
    'duplicate should throw'
  );
});

test('21 approve — sequential chain walks to APPROVED', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p6', amount: 50000, department: 'Eng', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  let step = sys.approve(reqId, 'mgr_Eng', DECISION.APPROVE, 'ok');
  assertEq(step.terminal, false);
  assertEq(step.next_step.role, ROLE.DEPT_HEAD);
  step = sys.approve(reqId, 'head_Eng', DECISION.APPROVE, 'ok');
  assertEq(step.terminal, false);
  assertEq(step.next_step.role, ROLE.CFO);
  step = sys.approve(reqId, 'cfo_user', DECISION.APPROVE, 'ok');
  assertEq(step.terminal, true);
  const r = sys.getRequest(reqId);
  assertEq(r.status, REQUEST_STATUS.APPROVED);
});

test('22 approve — rejection terminal, further approvals refused', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p7', amount: 50000, department: 'Eng', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  sys.approve(reqId, 'mgr_Eng', DECISION.REJECT, 'too expensive');
  const r = sys.getRequest(reqId);
  assertEq(r.status, REQUEST_STATUS.REJECTED);
  assertEq(r.reject_reason, 'too expensive');
  assertThrows(
    () => sys.approve(reqId, 'head_Eng', DECISION.APPROVE, 'override'),
    'E_NOT_PENDING',
    'should not allow approval after reject'
  );
});

test('23 approve — rejection without reason is refused', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p8', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  assertThrows(
    () => sys.approve(reqId, 'mgr_IT', DECISION.REJECT, ''),
    'E_INVALID_INPUT',
    'rejection requires non-empty reason'
  );
});

test('24 approve — wrong user is refused with E_NOT_ELIGIBLE', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p9', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  assertThrows(
    () => sys.approve(reqId, 'random_user', DECISION.APPROVE, 'ok'),
    'E_NOT_ELIGIBLE',
    'random user should not approve'
  );
});

test('25 approve — delegation lets delegate act on behalf of original', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  sys.delegate('mgr_IT', 'deputy_it', T0 - 1000, T0 + 10_000_000);
  const reqId = sys.submitForApproval({
    id: 'p10', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  const step = sys.approve(reqId, 'deputy_it', DECISION.APPROVE, 'on behalf');
  assertEq(step.terminal, true);
  const r = sys.getRequest(reqId);
  assertEq(r.status, REQUEST_STATUS.APPROVED);
  assertEq(r.decisions[0].on_behalf_of, 'mgr_IT');
});

test('26 getPendingApprovals — filters by eligibility', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  sys.submitForApproval({
    id: 'p11a', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  sys.submitForApproval({
    id: 'p11b', amount: 3000, department: 'Ops', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  const pendingForIT = sys.getPendingApprovals('mgr_IT');
  const pendingForOps = sys.getPendingApprovals('mgr_Ops');
  assertEq(pendingForIT.length, 1);
  assertEq(pendingForOps.length, 1);
  assertEq(pendingForIT[0].po_id, 'p11a');
  assertEq(pendingForOps[0].po_id, 'p11b');
});

test('27 escalate — moves to ESCALATED, history preserved', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p12', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  sys.escalate(reqId, 'no_reply_24h');
  const r = sys.getRequest(reqId);
  assertEq(r.status, REQUEST_STATUS.ESCALATED);
  assertEq(r.escalation_reason, 'no_reply_24h');
  const hist = sys.getHistory('p12');
  assertTrue(hist.some((h) => h.event === 'escalated'));
});

test('28 tick — auto-escalates expired steps', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p13', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  clock.advance(48 * 60 * 60 * 1000); // 48h past the 24h deadline
  const expired = sys.tick();
  assertEq(expired.includes(reqId), true);
  const r = sys.getRequest(reqId);
  assertEq(r.status, REQUEST_STATUS.ESCALATED);
  assertEq(r.escalation_reason, 'timeout');
});

test('29 tick — emergency retroactive deadline expires unratified PO', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p14', amount: 30000, department: 'Ops', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.B, emergency: true,
  });
  clock.advance(49 * 60 * 60 * 1000); // past 48h retroactive deadline
  sys.tick();
  const r = sys.getRequest(reqId);
  assertEq(r.status, REQUEST_STATUS.EXPIRED);
  const hist = sys.getHistory('p14');
  assertTrue(hist.some((h) => h.event === 'retroactive_expired'));
});

test('30 amend — re-routes when amount increases >10%', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p15', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  sys.approve(reqId, 'mgr_IT', DECISION.APPROVE, 'ok');
  const res = sys.amend('p15', { amount: 4000 }, { changed_by: 'alice' }); // +33%
  assertEq(res.rerouted, true);
  assertTrue(typeof res.request_id === 'string' && res.request_id.length > 0);
});

test('31 getHistory — returns full ordered audit trail', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p16', amount: 15000, department: 'Eng', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  sys.approve(reqId, 'mgr_Eng', DECISION.APPROVE, 'ok');
  sys.approve(reqId, 'head_Eng', DECISION.APPROVE, 'ok');
  const hist = sys.getHistory('p16');
  const events = hist.map((h) => h.event);
  assertTrue(events[0] === 'submitted', 'first event is submitted');
  assertTrue(events.includes('decision'), 'decision logged');
  assertTrue(events.includes('approved'), 'approved logged');
  for (let i = 1; i < hist.length; i++) {
    assertTrue(hist[i].at >= hist[i - 1].at, 'events monotonic in time');
  }
});

test('32 delegate — rejects invalid windows and self-delegation', () => {
  const clock = mkClock(T0);
  const sys = createApprovalSystem({ clock: clock.now });
  assertThrows(
    () => sys.delegate('alice', 'alice', T0, T0 + 1000),
    'E_INVALID_INPUT',
    'self-delegation refused'
  );
  assertThrows(
    () => sys.delegate('alice', 'bob', T0 + 1000, T0),
    'E_INVALID_INPUT',
    'inverted window refused'
  );
  assertThrows(
    () => sys.delegate('alice', 'bob', T0, T0),
    'E_INVALID_INPUT',
    'zero-length window refused'
  );
});

test('33 integration — notifier + audit hooks fire with payloads', () => {
  const notifications = [];
  const auditEntries = [];
  const clock = mkClock(T0);
  const sys = createApprovalSystem({
    clock: clock.now,
    notifier: (e) => notifications.push(e),
    audit: (e) => auditEntries.push(e),
    department_manager_of: (d) => 'mgr_' + d,
  });
  const reqId = sys.submitForApproval({
    id: 'p17', amount: 3000, department: 'IT', category: CATEGORY.ROUTINE,
    vendor_risk_tier: RISK_TIER.A,
  });
  sys.approve(reqId, 'mgr_IT', DECISION.APPROVE, 'ok');

  // Notifier received at least request + approved events
  assertTrue(notifications.some((n) => n.kind === 'approval_request'));
  assertTrue(notifications.some((n) => n.kind === 'approved'));
  // Audit log received submitted + decision + approved
  const auditEvents = auditEntries.map((a) => a.event);
  assertTrue(auditEvents.includes('submitted'));
  assertTrue(auditEvents.includes('decision'));
  assertTrue(auditEvents.includes('approved'));
});

// ─── Summary ───────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log('----------------------------------------------------');
console.log('Total: ' + results.length + '  Passed: ' + passed + '  Failed: ' + failed);
if (failed > 0) {
  console.log('FAILED TESTS:');
  for (const r of results) if (!r.ok) console.log('  - ' + r.name + ': ' + r.error);
  if (typeof process !== 'undefined') process.exitCode = 1;
}

module.exports = { results };
