/**
 * Unit tests — Account Assignment Engine
 * Agent Y-029  |  Swarm Sales-Ops  |  Wave 2026
 *
 * Run: node --test test/sales/account-assignment.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AccountAssigner } = require('../../src/sales/account-assignment');

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function freshAssigner(opts) {
  return new AccountAssigner(Object.assign({ seed: 42, now: () => '2026-04-11T09:00:00.000Z' }, opts || {}));
}

function makeSp(overrides = {}) {
  return Object.assign({
    id:             'sp1',
    name:           'Salesperson 1',
    skills:         [],
    certifications: [],
    capacity:       10,
    load:           0,
    weight:         1.0,
    active:         true,
  }, overrides);
}

function makeAccount(overrides = {}) {
  return Object.assign({
    id:       'acc-1',
    name:     'Acme Ltd',
    industry: 'construction',
    size:     'mid-market',
    region:   'center',
    product:  'erp',
  }, overrides);
}

// ===========================================================================
// 1. defineRule / basic wiring
// ===========================================================================

test('1. defineRule: rejects invalid strategy', () => {
  const ac = freshAssigner();
  assert.throws(
    () => ac.defineRule({ priority: 10, strategy: 'random' }),
    /unknown strategy/
  );
});

test('2. defineRule: requires numeric priority', () => {
  const ac = freshAssigner();
  assert.throws(
    () => ac.defineRule({ strategy: 'round-robin' }),
    /priority/
  );
});

test('3. defineRule: stores rules sorted by priority ascending', () => {
  const ac = freshAssigner();
  ac.defineRule({ priority: 50, strategy: 'capacity' });
  ac.defineRule({ priority: 10, strategy: 'skill' });
  ac.defineRule({ priority: 30, strategy: 'weighted' });
  const rules = ac.listRules();
  assert.deepEqual(rules.map(r => r.priority), [10, 30, 50]);
  assert.deepEqual(rules.map(r => r.strategy), ['skill', 'weighted', 'capacity']);
});

// ===========================================================================
// 2. Round-robin fairness
// ===========================================================================

test('4. round-robin: fair rotation over N salespeople and many accounts', () => {
  const ac = freshAssigner();
  const ids = ['alice', 'bob', 'carol', 'dave'];
  ids.forEach(id => ac.registerSalesperson(makeSp({ id, name: id })));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });

  const assigned = [];
  for (let i = 0; i < 40; i++) {
    const r = ac.assign(makeAccount({ id: `acc-${i}` }));
    assigned.push(r.assignee_id);
  }
  // Each of 4 reps should get exactly 10.
  const counts = {};
  assigned.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  assert.equal(counts.alice, 10);
  assert.equal(counts.bob,   10);
  assert.equal(counts.carol, 10);
  assert.equal(counts.dave,  10);

  // Order should be a cycle alice→bob→carol→dave repeating.
  for (let i = 0; i < 40; i++) {
    assert.equal(assigned[i], ids[i % 4], `idx ${i}`);
  }
});

test('5. round-robin: skips inactive reps', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.registerSalesperson(makeSp({ id: 'b', active: false }));
  ac.registerSalesperson(makeSp({ id: 'c' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });

  const picks = [];
  for (let i = 0; i < 6; i++) {
    picks.push(ac.assign(makeAccount({ id: `a-${i}` })).assignee_id);
  }
  assert.deepEqual(picks, ['a', 'c', 'a', 'c', 'a', 'c']);
});

// ===========================================================================
// 3. Weighted distribution over many trials
// ===========================================================================

test('6. weighted: probability roughly matches configured weights over many trials', () => {
  const ac = freshAssigner({ seed: 1 });
  ac.registerSalesperson(makeSp({ id: 'big',    weight: 0.7, capacity: 10000 }));
  ac.registerSalesperson(makeSp({ id: 'medium', weight: 0.2, capacity: 10000 }));
  ac.registerSalesperson(makeSp({ id: 'ramp',   weight: 0.1, capacity: 10000 }));
  ac.defineRule({ priority: 10, strategy: 'weighted' });

  const N = 5000;
  const counts = { big: 0, medium: 0, ramp: 0 };
  for (let i = 0; i < N; i++) {
    const r = ac.assign(makeAccount({ id: `acc-${i}` }));
    counts[r.assignee_id] += 1;
  }

  // Check each rep is within ±5% of its configured weight.
  const pBig    = counts.big / N;
  const pMedium = counts.medium / N;
  const pRamp   = counts.ramp / N;
  assert.ok(Math.abs(pBig    - 0.7) < 0.05, `big ${pBig}`);
  assert.ok(Math.abs(pMedium - 0.2) < 0.05, `medium ${pMedium}`);
  assert.ok(Math.abs(pRamp   - 0.1) < 0.05, `ramp ${pRamp}`);
  // Order sanity: big > medium > ramp
  assert.ok(counts.big > counts.medium);
  assert.ok(counts.medium > counts.ramp);
});

test('7. weighted: zero-total weights falls back to first rep deterministically', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'x', weight: 0 }));
  ac.registerSalesperson(makeSp({ id: 'y', weight: 0 }));
  ac.defineRule({ priority: 10, strategy: 'weighted' });
  const r = ac.assign(makeAccount());
  assert.ok(['x', 'y'].includes(r.assignee_id));
});

// ===========================================================================
// 4. Skill match
// ===========================================================================

test('8. skill: picks rep whose skills best match account traits', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({
    id: 'generalist',
    skills: ['french', 'italian'],
  }));
  ac.registerSalesperson(makeSp({
    id: 'construction-expert',
    skills: ['construction', 'hebrew'],
    certifications: ['ISO-9001'],
  }));
  ac.registerSalesperson(makeSp({
    id: 'erp-specialist',
    skills: ['erp', 'english'],
  }));
  ac.defineRule({ priority: 10, strategy: 'skill' });

  const acct = makeAccount({
    id: 'big-construction-co',
    industry: 'construction',
    product: 'erp',
    traits: ['hebrew'],
  });
  const r = ac.assign(acct);
  // construction-expert has 2 hits (construction, hebrew) vs erp-specialist's 1 (erp)
  assert.equal(r.assignee_id, 'construction-expert');
  assert.equal(r.strategy, 'skill');
});

test('9. skill: falls back to capacity when no trait matches', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'heavy', load: 8, capacity: 10, skills: ['aerospace'] }));
  ac.registerSalesperson(makeSp({ id: 'light', load: 2, capacity: 10, skills: ['maritime'] }));
  ac.defineRule({ priority: 10, strategy: 'skill' });

  const r = ac.assign(makeAccount({ industry: 'retail', product: 'pos', traits: ['english'] }));
  assert.equal(r.assignee_id, 'light');
});

// ===========================================================================
// 5. Capacity balancing
// ===========================================================================

test('10. capacity: assigns to least-loaded rep (by ratio)', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a', load: 5, capacity: 10 })); // 50%
  ac.registerSalesperson(makeSp({ id: 'b', load: 2, capacity: 10 })); // 20%
  ac.registerSalesperson(makeSp({ id: 'c', load: 8, capacity: 10 })); // 80%
  ac.defineRule({ priority: 10, strategy: 'capacity' });

  const r = ac.assign(makeAccount());
  assert.equal(r.assignee_id, 'b');
});

test('11. capacity: refuses to over-assign when reps are full', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'x', load: 10, capacity: 10 }));
  ac.registerSalesperson(makeSp({ id: 'y', load: 10, capacity: 10 }));
  ac.defineRule({ priority: 10, strategy: 'capacity' });

  const r = ac.assign(makeAccount());
  assert.equal(r.assignee_id, null);
  assert.match(r.reason_en, /no matching rule|left unassigned/i);
});

test('12. balanceLoad: moves accounts from heaviest to lightest until flat', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a', capacity: 100 }));
  ac.registerSalesperson(makeSp({ id: 'b', capacity: 100 }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });

  // Seed 20 accounts, then swap them all to 'a' via reassign to create imbalance.
  for (let i = 0; i < 20; i++) ac.assign(makeAccount({ id: `acc-${i}` }));
  for (let i = 0; i < 20; i++) {
    // if already on 'a' this is a no-op; if on 'b' move to 'a'
    const h = ac.getHistory(`acc-${i}`);
    const last = h[h.length - 1];
    if (last.assignee_id !== 'a') ac.reassign(`acc-${i}`, 'a', 'setup-imbalance');
  }

  const spA = ac.listSalespeople().find(s => s.id === 'a');
  const spB = ac.listSalespeople().find(s => s.id === 'b');
  assert.equal(spA.load, 20);
  assert.equal(spB.load, 0);

  const result = ac.balanceLoad();
  assert.ok(result.moves.length > 0);
  const postA = ac.listSalespeople().find(s => s.id === 'a').load;
  const postB = ac.listSalespeople().find(s => s.id === 'b').load;
  assert.ok(Math.abs(postA - postB) <= 1, `after rebalance: a=${postA}, b=${postB}`);
});

// ===========================================================================
// 6. Account-owner preservation
// ===========================================================================

test('13. account-owner: preserves existing owner for returning customer', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'vip-rep' }));
  ac.registerSalesperson(makeSp({ id: 'other-rep' }));
  ac.defineRule({ priority: 10, strategy: 'account-owner' });
  ac.defineRule({ priority: 20, strategy: 'round-robin' });

  const r = ac.assign(makeAccount({ id: 'returning', currentOwner: 'vip-rep' }));
  assert.equal(r.assignee_id, 'vip-rep');
  assert.equal(r.strategy, 'account-owner');
});

test('14. account-owner: falls through when owner is inactive', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'former-rep', active: false }));
  ac.registerSalesperson(makeSp({ id: 'backup' }));
  ac.defineRule({ priority: 10, strategy: 'account-owner' });
  ac.defineRule({ priority: 20, strategy: 'round-robin' });

  const r = ac.assign(makeAccount({ id: 'orphan', currentOwner: 'former-rep' }));
  assert.equal(r.assignee_id, 'backup');
  assert.equal(r.strategy, 'round-robin');
});

// ===========================================================================
// 7. Priority / matcher rules
// ===========================================================================

test('15. assign: priority ordering — first matching rule wins', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'north-rep', regions: ['north'] }));
  ac.registerSalesperson(makeSp({ id: 'south-rep', regions: ['south'] }));
  ac.registerSalesperson(makeSp({ id: 'default-rep' }));

  ac.defineRule({
    priority: 10,
    matcher: { region: 'north' },
    strategy: 'round-robin',
    pool: ['north-rep'],
  });
  ac.defineRule({
    priority: 20,
    matcher: { region: 'south' },
    strategy: 'round-robin',
    pool: ['south-rep'],
  });
  ac.defineRule({
    priority: 100,
    strategy: 'round-robin',
    pool: ['default-rep'],
  });

  assert.equal(ac.assign(makeAccount({ id: 'n1', region: 'north' })).assignee_id, 'north-rep');
  assert.equal(ac.assign(makeAccount({ id: 's1', region: 'south' })).assignee_id, 'south-rep');
  assert.equal(ac.assign(makeAccount({ id: 'c1', region: 'center' })).assignee_id, 'default-rep');
});

test('16. assign: matcher accepts array of allowed values', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'enterprise-rep' }));
  ac.registerSalesperson(makeSp({ id: 'smb-rep' }));

  ac.defineRule({
    priority: 10,
    matcher: { size: ['enterprise', 'mid-market'] },
    strategy: 'round-robin',
    pool: ['enterprise-rep'],
  });
  ac.defineRule({
    priority: 20,
    strategy: 'round-robin',
    pool: ['smb-rep'],
  });

  assert.equal(
    ac.assign(makeAccount({ id: '1', size: 'enterprise' })).assignee_id,
    'enterprise-rep'
  );
  assert.equal(
    ac.assign(makeAccount({ id: '2', size: 'smb' })).assignee_id,
    'smb-rep'
  );
});

// ===========================================================================
// 8. Blacklist respected
// ===========================================================================

test('17. blacklist: prevents assigning a blacklisted rep', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.registerSalesperson(makeSp({ id: 'b' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });

  ac.blacklist('a', 'acc-secret', 'conflict of interest — brother-in-law');

  // Even though a is "next in queue", the blacklisted pair must skip a.
  const r1 = ac.assign(makeAccount({ id: 'acc-secret' }));
  assert.equal(r1.assignee_id, 'b');

  // Other accounts still reach 'a'.
  const r2 = ac.assign(makeAccount({ id: 'acc-other' }));
  assert.ok(['a', 'b'].includes(r2.assignee_id));
});

test('18. blacklist: reassign to blacklisted rep throws', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.registerSalesperson(makeSp({ id: 'b' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });
  ac.assign(makeAccount({ id: 'acc' }));

  ac.blacklist('b', 'acc', 'too many active deals');
  assert.throws(() => ac.reassign('acc', 'b', 'test'), /blacklisted/);
});

test('19. blacklist: listBlacklist + isBlacklisted', () => {
  const ac = freshAssigner();
  ac.blacklist('rep-a', 'acc-1', 'reason-1');
  ac.blacklist('rep-b', 'acc-2', 'reason-2');
  assert.equal(ac.listBlacklist().length, 2);
  assert.equal(ac.isBlacklisted('rep-a', 'acc-1'), true);
  assert.equal(ac.isBlacklisted('rep-a', 'acc-2'), false);
});

// ===========================================================================
// 9. Reassign + history
// ===========================================================================

test('20. reassign: creates new history entry, preserves previous', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'alice' }));
  ac.registerSalesperson(makeSp({ id: 'bob' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin', pool: ['alice'] });

  const first = ac.assign(makeAccount({ id: 'acc-1' }));
  assert.equal(first.assignee_id, 'alice');

  const second = ac.reassign('acc-1', 'bob', 'promotion');
  assert.equal(second.assignee_id, 'bob');
  assert.equal(second.previous_assignee_id, 'alice');

  const hist = ac.getHistory('acc-1');
  assert.equal(hist.length, 2);
  assert.equal(hist[0].assignee_id, 'alice');
  assert.equal(hist[0].action, 'assign');
  assert.equal(hist[1].assignee_id, 'bob');
  assert.equal(hist[1].action, 'reassign');
  assert.ok(hist[1].reason_he.includes('ידנית') || hist[1].reason_he.length > 0);
});

test('21. reassign: history entries are frozen (append-only integrity)', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });
  ac.assign(makeAccount({ id: 'acc' }));
  const hist = ac.getHistory('acc');
  assert.throws(() => { hist[0].reason = 'MUTATED'; }, /read.only|Cannot.*assign/);
});

// ===========================================================================
// 10. Listings
// ===========================================================================

test('22. listUnassigned + listByAssignee', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'alice' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });
  ac.assign(makeAccount({ id: 'acc-1' }));
  ac.assign(makeAccount({ id: 'acc-2' }));

  // Force an unassigned — define an assigner with no reps
  const ac2 = freshAssigner();
  ac2.assign(makeAccount({ id: 'lonely' }));

  assert.equal(ac.listByAssignee('alice').length, 2);
  assert.equal(ac.listUnassigned().length, 0);
  assert.equal(ac2.listUnassigned().length, 1);
});

// ===========================================================================
// 11. Simulation (dry-run)
// ===========================================================================

test('23. simulateAssignment: does not mutate live state', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.registerSalesperson(makeSp({ id: 'b' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });

  const statsBefore = ac.stats();
  const loadsBefore = ac.listSalespeople().map(s => [s.id, s.load]);

  const accounts = Array.from({ length: 10 }, (_, i) => makeAccount({ id: `sim-${i}` }));
  const sim = ac.simulateAssignment(accounts);

  // live state unchanged
  assert.deepEqual(ac.stats(), statsBefore);
  assert.deepEqual(ac.listSalespeople().map(s => [s.id, s.load]), loadsBefore);

  // simulation still returned 10 decisions
  assert.equal(sim.results.length, 10);
  assert.equal(sim.results.every(r => r.assignee_id), true);
  assert.equal(sim.loadDelta.length, 2);
  // delta sums equal 10 (all simulated accounts)
  const totalDelta = sim.loadDelta.reduce((s, d) => s + d.delta, 0);
  assert.equal(totalDelta, 10);
});

test('24. simulateAssignment: warns on unassigned', () => {
  const ac = freshAssigner();            // no reps, no rules
  const sim = ac.simulateAssignment([makeAccount({ id: 'ghost' })]);
  assert.equal(sim.warnings.length, 1);
  assert.equal(sim.warnings[0].code, 'unassigned');
});

// ===========================================================================
// 12. Bilingual log messages
// ===========================================================================

test('25. assign: log messages are bilingual (Hebrew + English)', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'r1' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });
  const r = ac.assign(makeAccount());
  assert.ok(r.reason_he.length > 0);
  assert.ok(r.reason_en.length > 0);
  // Hebrew sanity: must contain at least one Hebrew letter
  assert.ok(/[\u0590-\u05FF]/.test(r.reason_he), r.reason_he);
  // English sanity: must contain latin chars
  assert.ok(/[a-zA-Z]/.test(r.reason_en), r.reason_en);
  // Combined reason contains the pipe separator
  assert.ok(r.reason.includes('|'), r.reason);
});

// ===========================================================================
// 13. Round-robin independent cursors per rule
// ===========================================================================

test('26. round-robin: each rule tracks its own cursor', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.registerSalesperson(makeSp({ id: 'b' }));
  ac.registerSalesperson(makeSp({ id: 'c' }));

  ac.defineRule({
    priority: 10,
    matcher: { industry: 'construction' },
    strategy: 'round-robin',
    pool: ['a', 'b'],
  });
  ac.defineRule({
    priority: 20,
    strategy: 'round-robin',
    pool: ['b', 'c'],
  });

  const picks = [];
  picks.push(ac.assign(makeAccount({ id: '1', industry: 'construction' })).assignee_id);
  picks.push(ac.assign(makeAccount({ id: '2', industry: 'retail' })).assignee_id);
  picks.push(ac.assign(makeAccount({ id: '3', industry: 'construction' })).assignee_id);
  picks.push(ac.assign(makeAccount({ id: '4', industry: 'retail' })).assignee_id);

  assert.equal(picks[0], 'a');
  assert.equal(picks[1], 'b');
  assert.equal(picks[2], 'b');
  assert.equal(picks[3], 'c');
});

// ===========================================================================
// 14. Error handling
// ===========================================================================

test('27. registerSalesperson: rejects duplicates', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'x' }));
  assert.throws(() => ac.registerSalesperson(makeSp({ id: 'x' })), /duplicate/);
});

test('28. assign: requires account.id', () => {
  const ac = freshAssigner();
  assert.throws(() => ac.assign({}), /account\.id required/);
});

test('29. unassign: records action and clears assignee', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });
  ac.assign(makeAccount({ id: 'acc' }));
  ac.unassign('acc', 'customer churned');

  const acct = ac.listUnassigned().find(a => a.id === 'acc');
  assert.ok(acct);
  assert.equal(acct.assignee_id, null);
  const hist = ac.getHistory('acc');
  assert.equal(hist[hist.length - 1].action, 'unassign');
});

test('30. stats reports live counters', () => {
  const ac = freshAssigner();
  ac.registerSalesperson(makeSp({ id: 'a' }));
  ac.registerSalesperson(makeSp({ id: 'b' }));
  ac.defineRule({ priority: 10, strategy: 'round-robin' });
  ac.assign(makeAccount({ id: '1' }));
  ac.assign(makeAccount({ id: '2' }));
  ac.reassign('1', 'b', 'test');

  const s = ac.stats();
  assert.equal(s.rules, 1);
  assert.equal(s.salespeople, 2);
  assert.equal(s.accounts, 2);
  assert.equal(s.assignments, 3); // 2 initial + 1 reassign
  assert.equal(s.reassignments, 1);
});
