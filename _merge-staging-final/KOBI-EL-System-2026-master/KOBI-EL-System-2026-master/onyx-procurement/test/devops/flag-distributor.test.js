/**
 * Unit tests for FlagDistributor — feature flag distribution engine
 * Agent Y-168 — Techno-Kol Uzi Mega-ERP — 2026-04-11
 *
 * Run:  node --test test/devops/flag-distributor.test.js
 *
 * Coverage (20 cases, all pass):
 *   - MurmurHash3 32-bit determinism, unsigned range, UTF-8/Hebrew stability
 *   - bucketOf stability & flag-salting (no cross-flag correlation)
 *   - register / upgrade / listFlags (non-destructive version bump)
 *   - kill switch overrides everything (even 100% rollout + targeting)
 *   - global disabled gate
 *   - dependency chains (flag-depends-on-flag)
 *   - dependency missing → dependency-missing reason
 *   - targeting: userId, email domain, segment, country, tenantId
 *   - targeting + rollout composition (targeting expands rollout)
 *   - rollout 0 %, 100 %, and ~25 % statistical distribution (±3%)
 *   - deterministic sticky variant assignment A/B
 *   - evaluate() never throws on bad input
 *   - audit log contains bilingual he + en messages for every decision
 *   - audit ring trims at configured size
 *   - setRollout / setKillSwitch emit audit entries
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FlagDistributor,
  murmurHash3_32,
  bucketOf,
  _pickVariant,
  _clampRollout,
  _extractDomain,
  REASONS,
} = require('../../src/devops/flag-distributor.js');

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function makeFD(opts) {
  return new FlagDistributor(opts || {});
}

// ──────────────────────────────────────────────────────────────
// 1. MurmurHash3 — determinism + range + Hebrew
// ──────────────────────────────────────────────────────────────
test('Y168-01  murmurHash3_32 is deterministic and unsigned 32-bit', () => {
  const a = murmurHash3_32('hello');
  const b = murmurHash3_32('hello');
  const c = murmurHash3_32('world');
  assert.equal(a, b, 'same input → same hash');
  assert.notEqual(a, c, 'different input → different hash');
  assert.ok(Number.isInteger(a) && a >= 0 && a <= 0xffffffff,
    'in 32-bit unsigned range');
  // Seed changes output.
  assert.notEqual(murmurHash3_32('hello', 1), murmurHash3_32('hello', 2));
  // Hebrew / UTF-8 stable.
  const he1 = murmurHash3_32('דגל-חדש');
  const he2 = murmurHash3_32('דגל-חדש');
  assert.equal(he1, he2, 'Hebrew string hashes stably');
  assert.notEqual(he1, murmurHash3_32('דגל-ישן'), 'Hebrew differentiation');
});

// ──────────────────────────────────────────────────────────────
// 2. bucketOf stability + flag-salting
// ──────────────────────────────────────────────────────────────
test('Y168-02  bucketOf is sticky per (flag,user) and salts across flags', () => {
  // Stickiness.
  for (let i = 0; i < 200; i++) {
    const u = 'user-' + i;
    assert.equal(bucketOf('flag-x', u), bucketOf('flag-x', u),
      'bucket must be sticky');
  }
  // Cross-flag salting — two flags should not co-correlate.
  let collisions = 0;
  const N = 500;
  for (let i = 0; i < N; i++) {
    const u = 'u-' + i;
    if (bucketOf('flag-A', u) === bucketOf('flag-B', u)) collisions++;
  }
  assert.ok(collisions < N * 0.05,
    'two flags must produce independent buckets (collisions=' + collisions + ')');
});

// ──────────────────────────────────────────────────────────────
// 3. register + listFlags + non-destructive upgrade
// ──────────────────────────────────────────────────────────────
test('Y168-03  register + listFlags + non-destructive upgrade', () => {
  const fd = makeFD();
  const v1 = fd.register({ key: 'checkout', rollout: 10, description_he: 'תשלום', description_en: 'checkout' });
  assert.equal(v1.version, 1);
  assert.equal(v1.rollout, 10);
  assert.equal(fd.listFlags().length, 1);

  // Upgrade same key → version bumps, never deletes.
  const v2 = fd.register({ key: 'checkout', rollout: 20 });
  assert.equal(v2.version, 2, 'version must bump');
  assert.equal(v2.rollout, 20);
  // description preserved from v1.
  assert.equal(v2.description_he, 'תשלום', 'bilingual desc preserved');
  assert.equal(v2.description_en, 'checkout');
  assert.equal(fd.listFlags().length, 1, 'still one flag after upgrade');
});

// ──────────────────────────────────────────────────────────────
// 4. Unknown flag → not-registered
// ──────────────────────────────────────────────────────────────
test('Y168-04  unknown flag returns not-registered reason', () => {
  const fd = makeFD();
  const r = fd.evaluate('ghost-flag', { userId: 'u-1' });
  assert.equal(r.enabled, false);
  assert.equal(r.reason.code, 'not-registered');
  assert.ok(/ghost-flag/.test(r.reason.en));
  assert.ok(r.reason.he && r.reason.he.length > 0, 'Hebrew reason set');
});

// ──────────────────────────────────────────────────────────────
// 5. Kill switch overrides everything (even 100% rollout)
// ──────────────────────────────────────────────────────────────
test('Y168-05  kill switch overrides 100% rollout and targeting', () => {
  const fd = makeFD();
  fd.register({
    key: 'cashback',
    rollout: 100,
    killSwitch: true,
    targeting: { userIds: ['uzi'] },
  });
  const r = fd.evaluate('cashback', { userId: 'uzi' });
  assert.equal(r.enabled, false);
  assert.equal(r.killed, true);
  assert.equal(r.reason.code, 'killed');
});

// ──────────────────────────────────────────────────────────────
// 6. Global disabled gate
// ──────────────────────────────────────────────────────────────
test('Y168-06  enabled=false globally short-circuits to off', () => {
  const fd = makeFD();
  fd.register({ key: 'x', enabled: false, rollout: 100 });
  const r = fd.evaluate('x', { userId: 'anyone' });
  assert.equal(r.enabled, false);
  assert.equal(r.reason.code, 'disabled-global');
});

// ──────────────────────────────────────────────────────────────
// 7. Dependency chains
// ──────────────────────────────────────────────────────────────
test('Y168-07  flag depends on another flag', () => {
  const fd = makeFD();
  fd.register({ key: 'core', rollout: 100 });
  fd.register({ key: 'advanced', rollout: 100, dependsOn: ['core'] });

  // Both enabled — advanced evaluates true.
  assert.equal(fd.evaluate('advanced', { userId: 'u-1' }).enabled, true);

  // Turn core off (via kill switch) → advanced must also be off.
  fd.setKillSwitch('core', true, 'admin');
  const r = fd.evaluate('advanced', { userId: 'u-1' });
  assert.equal(r.enabled, false);
  assert.equal(r.reason.code, 'dependency-off');
  assert.ok(/core/.test(r.reason.en));
});

// ──────────────────────────────────────────────────────────────
// 8. Missing dependency
// ──────────────────────────────────────────────────────────────
test('Y168-08  missing dependency → dependency-missing reason', () => {
  const fd = makeFD();
  fd.register({ key: 'child', rollout: 100, dependsOn: ['parent-ghost'] });
  const r = fd.evaluate('child', { userId: 'u-1' });
  assert.equal(r.enabled, false);
  assert.equal(r.reason.code, 'dependency-missing');
  assert.ok(/parent-ghost/.test(r.reason.en));
});

// ──────────────────────────────────────────────────────────────
// 9. Targeting by userId
// ──────────────────────────────────────────────────────────────
test('Y168-09  targeting by explicit userId list', () => {
  const fd = makeFD();
  fd.register({
    key: 'beta',
    rollout: 0,
    targeting: { userIds: ['u-1', 'u-2'] },
  });
  assert.equal(fd.evaluate('beta', { userId: 'u-1' }).enabled, true);
  assert.equal(fd.evaluate('beta', { userId: 'u-1' }).reason.code, 'target-user');
  assert.equal(fd.evaluate('beta', { userId: 'u-999' }).enabled, false);
});

// ──────────────────────────────────────────────────────────────
// 10. Targeting by email domain
// ──────────────────────────────────────────────────────────────
test('Y168-10  targeting by email domain', () => {
  const fd = makeFD();
  fd.register({
    key: 'internal',
    rollout: 0,
    targeting: { emailDomains: ['tko.co.il'] },
  });
  const yes = fd.evaluate('internal', { email: 'uzi@tko.co.il' });
  assert.equal(yes.enabled, true);
  assert.equal(yes.reason.code, 'target-email-domain');
  assert.equal(fd.evaluate('internal', { email: 'x@gmail.com' }).enabled, false);
  // Case-insensitive.
  assert.equal(
    fd.evaluate('internal', { email: 'UZI@TKO.CO.IL' }).enabled, true,
    'domain match is case insensitive');
});

// ──────────────────────────────────────────────────────────────
// 11. Targeting by segment / country / tenantId
// ──────────────────────────────────────────────────────────────
test('Y168-11  targeting by segment, country, tenantId', () => {
  const fd = makeFD();
  fd.register({
    key: 'multi',
    rollout: 0,
    targeting: {
      segments:  ['beta'],
      countries: ['IL', 'US'],
      tenantIds: ['tenant-7'],
    },
  });
  assert.equal(fd.evaluate('multi', { userId: 'u', segment: 'beta' }).reason.code, 'target-segment');
  assert.equal(fd.evaluate('multi', { userId: 'u', country: 'il' }).reason.code, 'target-country');
  assert.equal(fd.evaluate('multi', { userId: 'u', tenantId: 'tenant-7' }).reason.code, 'target-tenant');
  // No match, no rollout → excluded.
  const miss = fd.evaluate('multi', { userId: 'u', segment: 'ga', country: 'FR', tenantId: 'tenant-1' });
  assert.equal(miss.enabled, false);
  assert.equal(miss.reason.code, 'target-excluded');
});

// ──────────────────────────────────────────────────────────────
// 12. Targeting + rollout composition
// ──────────────────────────────────────────────────────────────
test('Y168-12  targeting expands rollout (explicit targets always pass)', () => {
  const fd = makeFD();
  fd.register({
    key: 'promo',
    rollout: 10,
    targeting: { userIds: ['vip-1'] },
  });
  // vip-1 always true.
  assert.equal(fd.evaluate('promo', { userId: 'vip-1' }).enabled, true);
  // Non-vip users fall through to rollout — at least some must match.
  let hits = 0, total = 2000;
  for (let i = 0; i < total; i++) {
    if (fd.evaluate('promo', { userId: 'usr-' + i }).enabled) hits++;
  }
  const pct = (hits / total) * 100;
  assert.ok(pct > 5 && pct < 15, '~10% rollout observed, got ' + pct.toFixed(2) + '%');
});

// ──────────────────────────────────────────────────────────────
// 13. Rollout 0 % and 100 %
// ──────────────────────────────────────────────────────────────
test('Y168-13  rollout 0% and 100% hard boundaries', () => {
  const fd = makeFD();
  fd.register({ key: 'z', rollout: 0 });
  fd.register({ key: 'f', rollout: 100 });
  for (let i = 0; i < 500; i++) {
    assert.equal(fd.evaluate('z', { userId: 'u-' + i }).enabled, false);
    assert.equal(fd.evaluate('f', { userId: 'u-' + i }).enabled, true);
  }
});

// ──────────────────────────────────────────────────────────────
// 14. Rollout ~25 % distribution accuracy
// ──────────────────────────────────────────────────────────────
test('Y168-14  rollout 25% is statistically close to 25% ±3%', () => {
  const fd = makeFD();
  fd.register({ key: 'beta', rollout: 25 });
  let hits = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) {
    if (fd.evaluate('beta', { userId: 'u-' + i }).enabled) hits++;
  }
  const pct = (hits / N) * 100;
  assert.ok(pct > 22 && pct < 28, 'rollout accuracy ±3%, got ' + pct.toFixed(2) + '%');
});

// ──────────────────────────────────────────────────────────────
// 15. Sticky variant assignment
// ──────────────────────────────────────────────────────────────
test('Y168-15  variant assignment is sticky per user and pool-balanced', () => {
  const fd = makeFD();
  fd.register({ key: 'abtest', rollout: 100, variants: ['A', 'B'] });
  const counts = { A: 0, B: 0 };
  for (let i = 0; i < 1000; i++) {
    const r1 = fd.evaluate('abtest', { userId: 'u-' + i });
    const r2 = fd.evaluate('abtest', { userId: 'u-' + i });
    assert.equal(r1.variant, r2.variant, 'same user → same variant');
    counts[r1.variant]++;
  }
  assert.ok(counts.A > 300 && counts.B > 300,
    'both variants reached (A=' + counts.A + ', B=' + counts.B + ')');
});

// ──────────────────────────────────────────────────────────────
// 16. Bilingual audit log is populated on every decision
// ──────────────────────────────────────────────────────────────
test('Y168-16  audit log records bilingual he+en for every evaluation', () => {
  const fd = makeFD();
  fd.register({ key: 'checkout', rollout: 100 });
  fd.evaluate('checkout', { userId: 'u-1' });
  fd.evaluate('checkout', { userId: 'u-2' });

  const log = fd.getAuditLog();
  // First entry is the register event, then 2 evaluations.
  assert.ok(log.length >= 3, 'audit log contains register + 2 evaluations');

  const evalEntries = log.filter(function (e) { return e.event === 'evaluate'; });
  assert.equal(evalEntries.length, 2);
  for (const e of evalEntries) {
    assert.equal(typeof e.message_he, 'string');
    assert.equal(typeof e.message_en, 'string');
    assert.ok(e.message_he.length > 0, 'Hebrew message present');
    assert.ok(e.message_en.length > 0, 'English message present');
    assert.equal(typeof e.reasonCode, 'string');
  }
});

// ──────────────────────────────────────────────────────────────
// 17. setKillSwitch and setRollout emit audit entries
// ──────────────────────────────────────────────────────────────
test('Y168-17  setKillSwitch and setRollout emit audit entries', () => {
  const fd = makeFD();
  fd.register({ key: 'promo', rollout: 5 });

  fd.setRollout('promo', 50, 'admin@tko.co.il');
  assert.equal(fd.getFlag('promo').rollout, 50);
  assert.equal(fd.getFlag('promo').version, 2);

  fd.setKillSwitch('promo', true, 'admin@tko.co.il');
  assert.equal(fd.getFlag('promo').killSwitch, true);
  assert.equal(fd.getFlag('promo').version, 3);

  const events = fd.getAuditLog().map(function (e) { return e.event; });
  assert.ok(events.indexOf('register') >= 0);
  assert.ok(events.indexOf('rollout') >= 0);
  assert.ok(events.indexOf('kill-switch') >= 0);

  // Invalid key must throw.
  assert.throws(function () { fd.setKillSwitch('ghost', true); });
  assert.throws(function () { fd.setRollout('ghost', 1); });
});

// ──────────────────────────────────────────────────────────────
// 18. Audit ring trims at configured size
// ──────────────────────────────────────────────────────────────
test('Y168-18  audit ring trims to auditRingSize', () => {
  const fd = makeFD({ auditRingSize: 10 });
  fd.register({ key: 'k', rollout: 100 });
  for (let i = 0; i < 50; i++) {
    fd.evaluate('k', { userId: 'u-' + i });
  }
  assert.ok(fd.getAuditLog().length <= 10,
    'ring must not exceed configured size');
});

// ──────────────────────────────────────────────────────────────
// 19. Graceful degradation on bad input
// ──────────────────────────────────────────────────────────────
test('Y168-19  evaluate never throws on bad input', () => {
  const fd = makeFD();
  fd.register({ key: 'robust', rollout: 50 });

  // No user context — must not throw.
  const r1 = fd.evaluate('robust');
  assert.equal(typeof r1.enabled, 'boolean');

  // Non-object context.
  const r2 = fd.evaluate('robust', null);
  assert.equal(typeof r2.enabled, 'boolean');

  // Null flag key is gracefully rejected.
  const r3 = fd.evaluate(null, { userId: 'u' });
  assert.equal(r3.enabled, false);
  assert.equal(r3.reason.code, 'not-registered');

  // Invalid rollout values clamp instead of crashing.
  fd.register({ key: 'clamp', rollout: 250 });
  assert.equal(fd.getFlag('clamp').rollout, 100);
  fd.register({ key: 'clamp2', rollout: -50 });
  assert.equal(fd.getFlag('clamp2').rollout, 0);
  fd.register({ key: 'clamp3', rollout: 'nope' });
  assert.equal(fd.getFlag('clamp3').rollout, 100);
});

// ──────────────────────────────────────────────────────────────
// 20. Helper unit tests
// ──────────────────────────────────────────────────────────────
test('Y168-20  internal helpers behave correctly', () => {
  assert.equal(_extractDomain('uzi@tko.co.il'), 'tko.co.il');
  assert.equal(_extractDomain('bad'), null);
  assert.equal(_extractDomain(null), null);

  assert.equal(_clampRollout(50), 50);
  assert.equal(_clampRollout(-10), 0);
  assert.equal(_clampRollout(200), 100);
  assert.equal(_clampRollout('x', 42), 42);

  assert.equal(_pickVariant([], 5), null);
  assert.equal(_pickVariant(['A'], 5), 'A');
  assert.equal(_pickVariant(['A', 'B'], 0), 'A');
  assert.equal(_pickVariant(['A', 'B'], 1), 'B');

  // REASONS table is bilingual.
  assert.ok(REASONS['killed'].he.length > 0);
  assert.ok(REASONS['killed'].en.length > 0);
  assert.ok(REASONS['rollout-in'].he.length > 0);
});
