/**
 * Tests — ABRouter  (src/devops/ab-router.js)
 * Agent Y-169 — A/B test router with holdout, mutex and SRM detection.
 *
 * Zero-dep: node:test + node:assert/strict.
 *
 * Run with:
 *   node --test test/devops/ab-router.test.js
 *
 * Coverage:
 *   01. constants + exports export cleanly
 *   02. FNV-1a hash is deterministic
 *   03. hashToUnit in [0,1) and different namespaces disagree
 *   04. normalizeWeights produces weights summing to 1
 *   05. registerExperiment rejects bad specs
 *   06. assign() is sticky across repeated calls
 *   07. assign() is sticky across fresh router instances (cross-process)
 *   08. Weighted distribution matches configured split
 *   09. Holdout always serves control, sticky per user
 *   10. Holdout % = 0 means nobody is in holdout
 *   11. Mutex group locks a user into exactly one experiment
 *   12. Mutex owner is deterministic and sticky
 *   13. Disabled experiment returns control with a reason
 *   14. Unknown experiment returns control with a reason
 *   15. SRM: healthy 50/50 split passes
 *   16. SRM: grossly skewed split flags critical
 *   17. SRM: below minSamples returns ok
 *   18. chiSquareCDF matches textbook reference values
 *   19. srmForExperiment surfaces observed + expected
 *   20. Bilingual fields are always populated
 *   21. getLogs filters by kind / experiment / user
 *   22. stats() exposes the router-level summary (bilingual)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '..', '..', 'src', 'devops', 'ab-router.js');
const {
  ABRouter,
  HOLDOUT_VARIANT,
  SRM_SEVERITY,
  SRM_P_THRESHOLDS,
  REASON_LABELS,
  fnv1a32,
  hashToUnit,
  normalizeWeights,
  srmCheck,
  chiSquareCDF,
  chiSquareSurvival,
} = require(modulePath);

// ─── helpers ────────────────────────────────────────────────────────────────

function approx(a, b, eps) {
  const tol = typeof eps === 'number' ? eps : 1e-6;
  return Math.abs(a - b) < tol;
}

function makeSpec(overrides) {
  return Object.assign({
    id: 'exp-color',
    title_he: 'ניסוי צבע כפתור',
    title_en: 'Button color experiment',
    variants: [
      { name: 'control', weight: 0.5 },
      { name: 'treatment', weight: 0.5 },
    ],
  }, overrides || {});
}

function manyUsers(n, prefix) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push((prefix || 'user-') + i);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 01. constants + exports export cleanly
// ═══════════════════════════════════════════════════════════════════════════
test('01. constants and exports are present / קבועים וייצואים קיימים', () => {
  assert.equal(HOLDOUT_VARIANT, 'control');
  assert.equal(SRM_SEVERITY.OK, 'ok');
  assert.equal(SRM_SEVERITY.CRITICAL, 'critical');
  assert.equal(SRM_P_THRESHOLDS.CRITICAL, 0.001);
  assert.ok(REASON_LABELS.holdout);
  assert.equal(REASON_LABELS.holdout.he, 'קבוצת הדחייה');
  assert.equal(typeof ABRouter, 'function');
  assert.equal(typeof fnv1a32, 'function');
  assert.equal(typeof hashToUnit, 'function');
  assert.equal(typeof srmCheck, 'function');
});

// ═══════════════════════════════════════════════════════════════════════════
// 02. FNV-1a is deterministic
// ═══════════════════════════════════════════════════════════════════════════
test('02. FNV-1a is deterministic / hash דטרמיניסטי', () => {
  assert.equal(fnv1a32('abc'), fnv1a32('abc'));
  assert.notEqual(fnv1a32('abc'), fnv1a32('abd'));
  assert.equal(fnv1a32(''), 0x811c9dc5);
  // Known FNV-1a 32-bit value for "a" is 0xe40c292c.
  assert.equal(fnv1a32('a'), 0xe40c292c);
});

// ═══════════════════════════════════════════════════════════════════════════
// 03. hashToUnit is in [0,1) and namespace-sensitive
// ═══════════════════════════════════════════════════════════════════════════
test('03. hashToUnit in [0,1) and namespaces disagree / טווח [0,1) ורחבי שם', () => {
  for (let i = 0; i < 200; i += 1) {
    const u = hashToUnit('ns', 'exp', 'u-' + i);
    assert.ok(u >= 0 && u < 1, 'out of range: ' + u);
  }
  // Different namespaces for the same (exp,user) should usually differ.
  const a = hashToUnit('holdout', 'exp-1', 'user-42');
  const b = hashToUnit('assign', 'exp-1', 'user-42');
  assert.notEqual(a, b);
});

// ═══════════════════════════════════════════════════════════════════════════
// 04. normalizeWeights produces weights summing to 1
// ═══════════════════════════════════════════════════════════════════════════
test('04. normalizeWeights sums to 1 / נרמול משקלים', () => {
  const a = normalizeWeights([
    { name: 'A', weight: 1 },
    { name: 'B', weight: 1 },
    { name: 'C', weight: 2 },
  ]);
  const sum = a.reduce((s, v) => s + v.weight, 0);
  assert.ok(approx(sum, 1), 'sum=' + sum);
  assert.ok(approx(a[2].weight, 0.5));

  const noWeights = normalizeWeights([
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
  ]);
  assert.ok(approx(noWeights[0].weight, 1 / 3));
  assert.ok(approx(noWeights[1].weight, 1 / 3));
  assert.ok(approx(noWeights[2].weight, 1 / 3));
});

// ═══════════════════════════════════════════════════════════════════════════
// 05. registerExperiment validates
// ═══════════════════════════════════════════════════════════════════════════
test('05. registerExperiment validates / אימות רישום ניסוי', () => {
  const r = new ABRouter();
  assert.throws(() => r.registerExperiment(null), /required/);
  assert.throws(() => r.registerExperiment({ id: 'x' }), /variants/);
  assert.throws(() => r.registerExperiment({
    id: 'x',
    variants: [{ name: 'only' }],
  }), /2 variants/);
  r.registerExperiment(makeSpec());
  assert.throws(() => r.registerExperiment(makeSpec()), /duplicate/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 06. assign() is sticky across repeated calls
// ═══════════════════════════════════════════════════════════════════════════
test('06. assign() sticky across repeated calls / שיוך דביק', () => {
  const r = new ABRouter();
  r.registerExperiment(makeSpec());
  const first = r.assign('exp-color', 'user-42').variant;
  for (let i = 0; i < 20; i += 1) {
    const v = r.assign('exp-color', 'user-42').variant;
    assert.equal(v, first, 'flipped on iteration ' + i);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 07. assign() is sticky across fresh router instances (cross-process)
// ═══════════════════════════════════════════════════════════════════════════
test('07. assign() sticky across fresh routers / עקביות בין תהליכים', () => {
  const r1 = new ABRouter();
  r1.registerExperiment(makeSpec());
  const v1 = r1.assign('exp-color', 'user-42').variant;

  const r2 = new ABRouter();
  r2.registerExperiment(makeSpec());
  const v2 = r2.assign('exp-color', 'user-42').variant;

  assert.equal(v1, v2);

  // Spot-check another user too.
  const v3 = r1.assign('exp-color', 'user-777').variant;
  const v4 = r2.assign('exp-color', 'user-777').variant;
  assert.equal(v3, v4);
});

// ═══════════════════════════════════════════════════════════════════════════
// 08. Weighted distribution matches configured split
// ═══════════════════════════════════════════════════════════════════════════
test('08. weighted distribution matches split / התפלגות לפי משקלים', () => {
  const r = new ABRouter();
  r.registerExperiment({
    id: 'exp-split',
    variants: [
      { name: 'A', weight: 0.25 },
      { name: 'B', weight: 0.25 },
      { name: 'C', weight: 0.50 },
    ],
  });
  const users = manyUsers(4000, 'u-');
  const counts = { A: 0, B: 0, C: 0 };
  for (let i = 0; i < users.length; i += 1) {
    const v = r.assign('exp-split', users[i]).variant;
    counts[v] += 1;
  }
  // Allow ±5% tolerance on 4000 samples.
  const tol = 4000 * 0.05;
  assert.ok(Math.abs(counts.A - 1000) < tol, 'A=' + counts.A);
  assert.ok(Math.abs(counts.B - 1000) < tol, 'B=' + counts.B);
  assert.ok(Math.abs(counts.C - 2000) < tol, 'C=' + counts.C);
});

// ═══════════════════════════════════════════════════════════════════════════
// 09. Holdout always serves control, sticky per user
// ═══════════════════════════════════════════════════════════════════════════
test('09. holdout serves control and is sticky / קבוצת דחייה דביקה', () => {
  const r = new ABRouter({ holdoutPct: 0.20 });
  r.registerExperiment({
    id: 'exp-holdout',
    variants: [
      { name: 'control', weight: 0.5 },
      { name: 'treatment', weight: 0.5 },
    ],
  });

  const users = manyUsers(3000, 'h-');
  let holdoutCount = 0;
  for (let i = 0; i < users.length; i += 1) {
    const res = r.assign('exp-holdout', users[i]);
    if (res.holdout) {
      holdoutCount += 1;
      assert.equal(res.variant, 'control');
      assert.equal(res.reason, 'holdout');
      // Sticky: second call returns the same thing.
      const res2 = r.assign('exp-holdout', users[i]);
      assert.equal(res2.holdout, true);
      assert.equal(res2.variant, 'control');
    }
  }
  // Expect ~20% ± 3%.
  const ratio = holdoutCount / users.length;
  assert.ok(Math.abs(ratio - 0.20) < 0.03, 'ratio=' + ratio);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. holdoutPct = 0 → nobody in holdout
// ═══════════════════════════════════════════════════════════════════════════
test('10. holdoutPct=0 means no holdout / 0% = אין דחייה', () => {
  const r = new ABRouter({ holdoutPct: 0 });
  r.registerExperiment(makeSpec());
  for (let i = 0; i < 500; i += 1) {
    const res = r.assign('exp-color', 'u-' + i);
    assert.equal(res.holdout, false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Mutex group: user is served by exactly one experiment
// ═══════════════════════════════════════════════════════════════════════════
test('11. mutex group locks user into one experiment / קבוצת בידוד נועלת', () => {
  const r = new ABRouter();
  r.registerExperiment({
    id: 'exp-one',
    mutexGroup: 'checkout-layer',
    variants: [
      { name: 'control', weight: 0.5 },
      { name: 'treatment', weight: 0.5 },
    ],
  });
  r.registerExperiment({
    id: 'exp-two',
    mutexGroup: 'checkout-layer',
    variants: [
      { name: 'control', weight: 0.5 },
      { name: 'treatment', weight: 0.5 },
    ],
  });

  let bothActive = 0;
  for (let i = 0; i < 2000; i += 1) {
    const a = r.assign('exp-one', 'm-' + i);
    const b = r.assign('exp-two', 'm-' + i);
    // At most one can be a genuine assignment (the other must be locked).
    const aAssigned = a.reason === 'assigned';
    const bAssigned = b.reason === 'assigned';
    if (aAssigned && bAssigned) bothActive += 1;
    assert.ok(!(aAssigned && bAssigned),
      'user ' + i + ' was active in both (' + a.variant + ',' + b.variant + ')');
  }
  assert.equal(bothActive, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Mutex owner is sticky (same user -> same owner)
// ═══════════════════════════════════════════════════════════════════════════
test('12. mutex owner is sticky / בעלות בידוד דביקה', () => {
  const r = new ABRouter();
  r.registerExperiment({
    id: 'exp-alpha',
    mutexGroup: 'pricing-layer',
    variants: [{ name: 'control', weight: 0.5 }, { name: 'treatment', weight: 0.5 }],
  });
  r.registerExperiment({
    id: 'exp-beta',
    mutexGroup: 'pricing-layer',
    variants: [{ name: 'control', weight: 0.5 }, { name: 'treatment', weight: 0.5 }],
  });

  // For each user, whichever experiment owns them first should keep owning.
  for (let i = 0; i < 500; i += 1) {
    const userId = 'p-' + i;
    const firstAlpha = r.assign('exp-alpha', userId);
    const firstBeta = r.assign('exp-beta', userId);
    for (let k = 0; k < 5; k += 1) {
      const againAlpha = r.assign('exp-alpha', userId);
      const againBeta = r.assign('exp-beta', userId);
      assert.equal(againAlpha.reason, firstAlpha.reason);
      assert.equal(againBeta.reason, firstBeta.reason);
      if (firstAlpha.reason === 'assigned') {
        assert.equal(againAlpha.variant, firstAlpha.variant);
      }
      if (firstBeta.reason === 'assigned') {
        assert.equal(againBeta.variant, firstBeta.variant);
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Disabled experiment returns control
// ═══════════════════════════════════════════════════════════════════════════
test('13. disabled experiment returns control / ניסוי כבוי', () => {
  const r = new ABRouter();
  r.registerExperiment(makeSpec());
  r.disableExperiment('exp-color');
  const res = r.assign('exp-color', 'user-1');
  assert.equal(res.variant, 'control');
  assert.equal(res.reason, 'experiment-disabled');
  assert.equal(res.reason_he, REASON_LABELS['experiment-disabled'].he);
  // Re-enable and re-check.
  r.enableExperiment('exp-color');
  const res2 = r.assign('exp-color', 'user-1');
  assert.equal(res2.reason, 'assigned');
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. Unknown experiment returns control
// ═══════════════════════════════════════════════════════════════════════════
test('14. unknown experiment returns control / ניסוי לא ידוע', () => {
  const r = new ABRouter();
  const res = r.assign('nope', 'user-1');
  assert.equal(res.variant, 'control');
  assert.equal(res.reason, 'experiment-not-found');
  assert.equal(res.reason_he, REASON_LABELS['experiment-not-found'].he);
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. SRM: healthy split passes
// ═══════════════════════════════════════════════════════════════════════════
test('15. SRM — healthy 50/50 split is ok / SRM על התפלגות תקינה', () => {
  const observed = { A: 5050, B: 4950 };
  const expected = { A: 0.5, B: 0.5 };
  const r = srmCheck(observed, expected);
  assert.equal(r.severity, SRM_SEVERITY.OK);
  assert.ok(r.pValue > 0.05);
  assert.equal(r.df, 1);
  assert.equal(r.total, 10000);
  assert.equal(r.message_he, 'התפלגות תקינה');
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. SRM: grossly skewed split flags critical
// ═══════════════════════════════════════════════════════════════════════════
test('16. SRM — 60/40 skew on 10k flags critical / SRM על סטייה חמורה', () => {
  const observed = { A: 6000, B: 4000 };
  const expected = { A: 0.5, B: 0.5 };
  const r = srmCheck(observed, expected);
  assert.equal(r.severity, SRM_SEVERITY.CRITICAL);
  assert.ok(r.pValue < 0.001);
  assert.equal(r.message_en, 'critical sample ratio mismatch — stop experiment');
  assert.equal(r.message_he, 'חוסר איזון חמור במדגם — לעצור ניסוי');
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. SRM: below minSamples returns ok
// ═══════════════════════════════════════════════════════════════════════════
test('17. SRM — tiny sample returns ok / SRM על מדגם קטן', () => {
  const r = srmCheck({ A: 10, B: 3 }, { A: 0.5, B: 0.5 }, { minSamples: 100 });
  assert.equal(r.severity, SRM_SEVERITY.OK);
  assert.ok(/sample too small/.test(r.message_en));
  assert.ok(/מדגם קטן/.test(r.message_he));
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. chiSquareCDF matches textbook reference values
// ═══════════════════════════════════════════════════════════════════════════
test('18. chiSquareCDF reference values / CDF של חי-בריבוע', () => {
  // P(X <= 3.841) for df=1 ≈ 0.95
  assert.ok(approx(chiSquareCDF(3.841, 1), 0.95, 1e-3));
  // P(X <= 5.991) for df=2 ≈ 0.95
  assert.ok(approx(chiSquareCDF(5.991, 2), 0.95, 1e-3));
  // Survival is 1 - CDF.
  assert.ok(approx(chiSquareSurvival(3.841, 1), 0.05, 1e-3));
  // df=5, x=11.070 -> 0.95
  assert.ok(approx(chiSquareCDF(11.070, 5), 0.95, 1e-3));
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. srmForExperiment surfaces observed + expected
// ═══════════════════════════════════════════════════════════════════════════
test('19. srmForExperiment exposes observed + expected / SRM לניסוי', () => {
  const r = new ABRouter();
  r.registerExperiment({
    id: 'exp-srm',
    variants: [
      { name: 'A', weight: 0.5 },
      { name: 'B', weight: 0.5 },
    ],
  });
  for (let i = 0; i < 500; i += 1) {
    r.assign('exp-srm', 'srm-' + i);
  }
  const s = r.srmForExperiment('exp-srm');
  assert.equal(s.experimentId, 'exp-srm');
  assert.ok(s.observed.A >= 0);
  assert.ok(s.observed.B >= 0);
  assert.equal(s.observed.A + s.observed.B, 500);
  assert.ok(approx(s.expected.A, 0.5));
  assert.equal(typeof s.pValue, 'number');
  assert.ok(['ok', 'minor', 'major', 'critical'].includes(s.severity));

  const miss = r.srmForExperiment('does-not-exist');
  assert.equal(miss.error, 'not-found');
  assert.ok(miss.message_he);
  assert.ok(miss.message_en);
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. Bilingual fields are always populated on assign() results
// ═══════════════════════════════════════════════════════════════════════════
test('20. assign() returns bilingual reason labels / תוויות דו-לשוניות', () => {
  const r = new ABRouter({ holdoutPct: 0.5 });
  r.registerExperiment(makeSpec());
  for (let i = 0; i < 50; i += 1) {
    const res = r.assign('exp-color', 'bi-' + i);
    assert.ok(res.reason_he && res.reason_he.length > 0);
    assert.ok(res.reason_en && res.reason_en.length > 0);
    assert.ok(res.at);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. getLogs filters by kind / experiment / user
// ═══════════════════════════════════════════════════════════════════════════
test('21. getLogs filters correctly / סינון יומנים', () => {
  const r = new ABRouter();
  r.registerExperiment(makeSpec());
  r.registerExperiment(makeSpec({ id: 'exp-other' }));
  r.assign('exp-color', 'log-user-1');
  r.assign('exp-color', 'log-user-2');
  r.assign('exp-other', 'log-user-1');

  const registers = r.getLogs({ kind: 'register' });
  assert.equal(registers.length, 2);

  const perExp = r.getLogs({ experimentId: 'exp-color', kind: 'assign' });
  assert.equal(perExp.length, 2);

  const perUser = r.getLogs({ userId: 'log-user-1', kind: 'assign' });
  assert.equal(perUser.length, 2);

  // Bilingual fields present.
  for (let i = 0; i < r.logs.length; i += 1) {
    assert.ok(r.logs[i].message_he);
    assert.ok(r.logs[i].message_en);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. stats() exposes the router-level summary with bilingual strings
// ═══════════════════════════════════════════════════════════════════════════
test('22. stats() bilingual summary / סיכום נתב', () => {
  const r = new ABRouter({ holdoutPct: 0.10 });
  r.registerExperiment(makeSpec());
  r.registerExperiment(makeSpec({ id: 'exp-other', mutexGroup: 'g1' }));
  r.registerExperiment(makeSpec({ id: 'exp-third', mutexGroup: 'g1' }));
  const s = r.stats();
  assert.equal(s.experiments, 3);
  assert.equal(s.mutexGroups, 1);
  assert.equal(s.holdoutPct, 0.10);
  assert.ok(s.summary_he.indexOf('3 ניסויים') >= 0);
  assert.ok(s.summary_en.indexOf('3 experiments') >= 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 23. setHoldoutPct validates range
// ═══════════════════════════════════════════════════════════════════════════
test('23. setHoldoutPct validates range / אימות טווח', () => {
  const r = new ABRouter();
  assert.throws(() => r.setHoldoutPct(-0.1), /\[0,1\]/);
  assert.throws(() => r.setHoldoutPct(1.5), /\[0,1\]/);
  r.setHoldoutPct(0.25);
  assert.equal(r.holdoutPct, 0.25);
});

// ═══════════════════════════════════════════════════════════════════════════
// 24. Users in holdout are removed from the SRM counting population.
//     (The assignment counts reflect only non-holdout, non-mutex-locked
//     users, which is the conventional definition of SRM.)
// ═══════════════════════════════════════════════════════════════════════════
test('24. holdout + mutex users excluded from SRM counts / דחויים לא נספרים', () => {
  const r = new ABRouter({ holdoutPct: 0.3 });
  r.registerExperiment({
    id: 'exp-counts',
    variants: [
      { name: 'A', weight: 0.5 },
      { name: 'B', weight: 0.5 },
    ],
  });
  const n = 1000;
  for (let i = 0; i < n; i += 1) {
    r.assign('exp-counts', 'c-' + i);
  }
  const counts = r.getAssignmentCounts('exp-counts');
  const total = counts.A + counts.B;
  // Holdout removed ~30%, so total should be ~70%.
  assert.ok(total < n);
  assert.ok(total > n * 0.6);
});
