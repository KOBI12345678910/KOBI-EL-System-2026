/**
 * ONYX AI — Policy System Tests
 * ------------------------------------------------------------
 * Exercises the Governor policy machinery exported from
 * `src/onyx-platform.ts`. Uses the Node built-in test runner
 * (`node --test`) so no extra dependencies are required beyond
 * what `package.json` already declares.
 *
 * Run with:
 *   npx node --test --require ts-node/register test/policies.test.ts
 *
 * Architectural notes discovered while writing these tests:
 *   - The Governor exposes `addPolicy()` and `getPolicies()` but
 *     does NOT expose `removePolicy`, `updatePolicy` or
 *     `listPolicies` (the public surface is intentionally
 *     narrow — state mutation flows through the event store).
 *     Tests covering remove/update therefore drive the underlying
 *     policy map through the public API the Governor does expose
 *     (addPolicy + getPolicies) and document the gap.
 *   - Policy `scope` values are the strings
 *     `global | agent | task_type | tool | department`. The task
 *     brief mentioned "team" and "user"; those values are NOT
 *     part of the Policy contract, so the scoping test uses the
 *     scopes that actually exist (`global` vs `agent`).
 *   - Daily-budget evaluation blocks when
 *     `spent + estimatedCost > maxCostPerDay` (strictly greater).
 *     The cost is only accumulated on the tracker when the
 *     per-task and per-day checks both pass.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Governor, EventStore } from '../src/onyx-platform';
import type { Policy, PolicyRule } from '../src/onyx-platform';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function makeGovernor(): Governor {
  // In-memory EventStore (no persistPath) — no timers, no disk I/O.
  const store = new EventStore();
  return new Governor(store);
}

function budgetRule(
  maxCostPerTask: number,
  maxCostPerDay: number,
): PolicyRule {
  return {
    type: 'budget',
    maxCostPerTask,
    maxCostPerDay,
    currency: 'USD',
    currentSpent: 0,
  };
}

function rateLimitRule(
  maxPerMinute: number,
  maxPerHour = maxPerMinute * 60,
  maxPerDay = maxPerMinute * 60 * 24,
): PolicyRule {
  return { type: 'rate_limit', maxPerMinute, maxPerHour, maxPerDay };
}

// ----------------------------------------------------------------
// 1. Adding a policy → getPolicies returns it
// ----------------------------------------------------------------
test('addPolicy → getPolicies returns the newly added policy', () => {
  const gov = makeGovernor();

  const added = gov.addPolicy({
    name: 'Test Budget',
    description: 'unit test budget',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(50, 500),
    active: true,
    priority: 100,
    createdBy: 'unit-test',
  });

  assert.ok(added.id.startsWith('pol_'), 'policy id should have pol_ prefix');
  assert.equal(typeof added.createdAt, 'number');

  const list = gov.getPolicies();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, added.id);
  assert.equal(list[0].name, 'Test Budget');
  assert.equal(list[0].scope, 'global');
});

// ----------------------------------------------------------------
// 2. Removing a policy by id
// ----------------------------------------------------------------
// Governor does NOT expose a public removePolicy(). The closest
// affordance is `active: false` on an existing policy — inactive
// policies are filtered out of evaluation. We test that behaviour
// here and explicitly document the missing API surface.
test('policy can be functionally removed by flipping active=false (no public removePolicy API)', () => {
  const gov = makeGovernor();

  const p = gov.addPolicy({
    name: 'Disposable',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(50, 100),
    active: true,
    priority: 10,
    createdBy: 'unit-test',
  });

  // Flip the flag directly on the returned reference (Governor stores
  // the same object in its internal map — mutation is visible).
  p.active = false;

  // Evaluation should now ignore the policy (no budget enforcement).
  const decision = gov.evaluate({
    type: 'tool.invoke',
    estimatedCost: 9999,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.violations.length, 0);
});

// ----------------------------------------------------------------
// 3. Updating a policy
// ----------------------------------------------------------------
// Same story as remove: no updatePolicy() public API. The returned
// Policy object is a live handle into the Governor's map, so field
// mutation is the supported pattern.
test('policy fields can be updated in place and the Governor honours the change', () => {
  const gov = makeGovernor();

  const p = gov.addPolicy({
    name: 'Mutable',
    description: 'initial',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(10, 20),
    active: true,
    priority: 50,
    createdBy: 'unit-test',
  });

  // Tighten the daily cap.
  (p.rule as any).maxCostPerDay = 5;

  const decision = gov.evaluate({
    type: 'tool.invoke',
    estimatedCost: 6,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.violations[0].type, 'budget');
});

// ----------------------------------------------------------------
// 4. Policy scope: global vs agent — correct scoping
// ----------------------------------------------------------------
// NOTE: Policy scope enum is
//   'global' | 'agent' | 'task_type' | 'tool' | 'department'
// There is no 'team' or 'user' scope. Test uses 'global' and 'agent'
// which are the analogues for broad vs. narrow scoping.
test('policy scope: agent-scoped policy only affects the matching agentId', () => {
  const gov = makeGovernor();

  gov.addPolicy({
    name: 'Agent-Scoped Budget',
    description: 'only binds agent_alpha',
    type: 'budget',
    scope: 'agent',
    scopeTarget: 'agent_alpha',
    rule: budgetRule(1, 1),
    active: true,
    priority: 100,
    createdBy: 'unit-test',
  });

  // Over-budget action by a different agent → not in scope → allowed
  const otherAgent = gov.evaluate({
    type: 'tool.invoke',
    agentId: 'agent_beta',
    estimatedCost: 500,
  });
  assert.equal(
    otherAgent.allowed,
    true,
    'policy scoped to agent_alpha must not affect agent_beta',
  );

  // Same over-budget action by the matching agent → denied
  const matchingAgent = gov.evaluate({
    type: 'tool.invoke',
    agentId: 'agent_alpha',
    estimatedCost: 500,
  });
  assert.equal(matchingAgent.allowed, false);
  assert.equal(matchingAgent.violations[0].type, 'budget');
});

// ----------------------------------------------------------------
// 5. Global-scope policy applies to everything
// ----------------------------------------------------------------
test('policy scope: global policy applies regardless of agent/tool/department', () => {
  const gov = makeGovernor();

  gov.addPolicy({
    name: 'Global Daily Cap',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(1000, 10),
    active: true,
    priority: 100,
    createdBy: 'unit-test',
  });

  const d1 = gov.evaluate({ type: 'x', agentId: 'any', estimatedCost: 3 });
  assert.equal(d1.allowed, true);

  // 3 + 8 = 11 > 10 → denied
  const d2 = gov.evaluate({ type: 'x', agentId: 'other', estimatedCost: 8 });
  assert.equal(d2.allowed, false);
});

// ----------------------------------------------------------------
// 6. Daily Budget: spend_today + request_cost <= maxCostPerDay allowed
// ----------------------------------------------------------------
test('Daily Budget: accumulated spend stays under cap → allowed', () => {
  const gov = makeGovernor();

  gov.addPolicy({
    name: 'Daily Budget',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(50, 100),
    active: true,
    priority: 100,
    createdBy: 'unit-test',
  });

  // three requests of 25 + 25 + 25 = 75 <= 100, all allowed
  for (let i = 0; i < 3; i++) {
    const d = gov.evaluate({ type: 'tool.invoke', estimatedCost: 25 });
    assert.equal(d.allowed, true, `request ${i} should be allowed`);
    assert.equal(d.violations.length, 0);
  }
});

// ----------------------------------------------------------------
// 7. Daily Budget: exceeding daily cap → denied
// ----------------------------------------------------------------
test('Daily Budget: spend_today + cost > maxCostPerDay → denied', () => {
  const gov = makeGovernor();

  gov.addPolicy({
    name: 'Daily Budget',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(50, 100),
    active: true,
    priority: 100,
    createdBy: 'unit-test',
  });

  // Burn 80 of the 100 budget
  const a = gov.evaluate({ type: 'tool.invoke', estimatedCost: 40 });
  const b = gov.evaluate({ type: 'tool.invoke', estimatedCost: 40 });
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, true);

  // Next 40 would push to 120 → denied
  const c = gov.evaluate({ type: 'tool.invoke', estimatedCost: 40 });
  assert.equal(c.allowed, false);
  assert.equal(c.violations[0].type, 'budget');
  assert.match(c.violations[0].message, /Daily budget would be exceeded/);
});

// ----------------------------------------------------------------
// 8. Daily Budget: per-task cost greater than maxCostPerTask → denied
// ----------------------------------------------------------------
test('Daily Budget: per-task cost ceiling is enforced independently', () => {
  const gov = makeGovernor();

  gov.addPolicy({
    name: 'Per-Task Cap',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(10, 1000), // ample daily, tight per-task
    active: true,
    priority: 100,
    createdBy: 'unit-test',
  });

  const denied = gov.evaluate({ type: 'tool.invoke', estimatedCost: 11 });
  assert.equal(denied.allowed, false);
  assert.match(denied.violations[0].message, /exceeds max per-task budget/);

  const allowed = gov.evaluate({ type: 'tool.invoke', estimatedCost: 5 });
  assert.equal(allowed.allowed, true);
});

// ----------------------------------------------------------------
// 9. Rate limit: N requests in T seconds → (N+1)th is blocked
// ----------------------------------------------------------------
test('Rate limit: bucket drains after maxPerMinute requests and next is blocked', () => {
  const gov = makeGovernor();

  // Only 3 requests per minute — extremely small bucket for a fast test.
  gov.addPolicy({
    name: 'Tight Rate Limit',
    description: '',
    type: 'rate_limit',
    scope: 'global',
    rule: rateLimitRule(3),
    active: true,
    priority: 100,
    createdBy: 'unit-test',
  });

  const outcomes = [0, 1, 2, 3].map(() =>
    gov.evaluate({ type: 'tool.invoke' }).allowed,
  );

  // First three should be allowed, 4th should be blocked by rate limit.
  assert.deepEqual(outcomes.slice(0, 3), [true, true, true]);
  assert.equal(outcomes[3], false);
});

// ----------------------------------------------------------------
// 10. Policy priority/order: first deny wins
// ----------------------------------------------------------------
// Policies evaluated in descending priority order. A blocking
// violation from a high-priority policy should appear first in the
// `violations` array, and the overall decision must be `allowed=false`
// even when a lower-priority policy would have allowed it.
test('priority ordering: higher-priority blocking policy dominates', () => {
  const gov = makeGovernor();

  // Low-priority permissive policy (large daily budget)
  gov.addPolicy({
    name: 'Permissive Budget',
    description: 'big budget, low prio',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(1_000_000, 1_000_000),
    active: true,
    priority: 1,
    createdBy: 'unit-test',
  });

  // High-priority blacklist that denies 'tool.invoke'
  gov.addPolicy({
    name: 'Blacklist Invoke',
    description: 'hard stop',
    type: 'blacklist',
    scope: 'global',
    rule: {
      type: 'blacklist',
      blocked: ['tool.invoke'],
      reason: 'blocked for compliance',
    },
    active: true,
    priority: 999,
    createdBy: 'unit-test',
  });

  const decision = gov.evaluate({
    type: 'tool.invoke',
    estimatedCost: 1,
  });

  assert.equal(decision.allowed, false, 'blacklist should dominate');

  // The first violation should come from the high-priority blacklist.
  assert.equal(decision.violations[0].policyName, 'Blacklist Invoke');
  assert.equal(decision.violations[0].type, 'blacklist');
});

// ----------------------------------------------------------------
// 11. Kill switch: overrides every policy unconditionally
// ----------------------------------------------------------------
test('kill switch is the ultimate deny — overrides all policies', () => {
  const gov = makeGovernor();

  gov.addPolicy({
    name: 'Permissive',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(1_000_000, 1_000_000),
    active: true,
    priority: 1,
    createdBy: 'unit-test',
  });

  gov.activateKillSwitch('unit-test', 'exercising kill switch');

  const decision = gov.evaluate({ type: 'tool.invoke', estimatedCost: 1 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.violations[0].policyId, 'KILL_SWITCH');
  assert.equal(decision.violations[0].severity, 'critical');

  gov.deactivateKillSwitch('unit-test');
  const after = gov.evaluate({ type: 'tool.invoke', estimatedCost: 1 });
  assert.equal(after.allowed, true);
});

// ----------------------------------------------------------------
// 12. Compliance report reflects added policies
// ----------------------------------------------------------------
test('getComplianceReport surfaces policy counts and activity', () => {
  const gov = makeGovernor();

  gov.addPolicy({
    name: 'Active',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(10, 100),
    active: true,
    priority: 10,
    createdBy: 'unit-test',
  });

  const inactive = gov.addPolicy({
    name: 'Inactive',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: budgetRule(10, 100),
    active: false,
    priority: 10,
    createdBy: 'unit-test',
  });

  const report = gov.getComplianceReport();
  assert.equal(report.totalPolicies, 2);
  assert.equal(report.activePolicies, 1);
  assert.equal(report.killSwitchActive, false);
  // touch inactive to silence unused warnings
  assert.equal(inactive.active, false);
});
