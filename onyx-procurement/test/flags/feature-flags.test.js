/**
 * Unit tests for FeatureFlags — zero-dep feature flag engine
 * Agent-X98 — Techno-Kol Uzi Mega-ERP — 2026-04-11
 *
 * Run:  node --test test/flags/feature-flags.test.js
 *
 * Coverage:
 *   - defineFlag / listFlags / getFlag (non-destructive upgrade)
 *   - bucket stability (same userId + flag → same bucket, always)
 *   - bucket distribution across many users ≈ rolloutPercent (± tolerance)
 *   - rule evaluation: AND / OR / NOT, all operators
 *   - startDate / endDate schedule gating
 *   - setFlag audit trail (before/after, actor, timestamp)
 *   - exportState / importState round-trip + non-destructive merge
 *   - express middleware attaches req.flags and evaluates correctly
 *   - evaluate trace output for debugging
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  FeatureFlags,
  fnv1a32,
  evalRule,
  readAttr,
} = require('../../src/flags/feature-flags.js');

// ──────────────────────────────────────────────────────────────
// Helper — fresh in-memory FeatureFlags that writes audit to a temp file
// ──────────────────────────────────────────────────────────────
function makeFF(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-test-'));
  const auditFile = path.join(tmp, 'flag-audit.jsonl');
  return new FeatureFlags(Object.assign({ auditFile }, opts));
}

// ──────────────────────────────────────────────────────────────
// 1. FNV-1a primitive
// ──────────────────────────────────────────────────────────────
test('fnv1a32 is deterministic and produces an unsigned 32-bit integer', () => {
  const a = fnv1a32('hello');
  const b = fnv1a32('hello');
  const c = fnv1a32('world');
  assert.equal(a, b, 'same input → same hash');
  assert.notEqual(a, c, 'different input → different hash');
  assert.ok(a >= 0 && a <= 0xffffffff, 'in 32-bit unsigned range');
});

// ──────────────────────────────────────────────────────────────
// 2. defineFlag + listFlags + getFlag
// ──────────────────────────────────────────────────────────────
test('defineFlag registers a flag and listFlags returns a copy', () => {
  const ff = makeFF();
  ff.defineFlag({
    name: 'new-dashboard',
    type: 'boolean',
    default: false,
    description: 'New procurement dashboard',
    description_he: 'דשבורד רכש חדש',
  });
  const list = ff.listFlags();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'new-dashboard');
  assert.equal(list[0].description_he, 'דשבורד רכש חדש');

  // Mutating the returned copy must NOT affect internal state
  list[0].default = true;
  assert.equal(ff.getFlag('new-dashboard').default, false);
});

test('defineFlag treats re-definition as an UPGRADE (version bump)', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'x', default: false });
  ff.defineFlag({ name: 'x', default: true, description: 'upgraded' });
  const f = ff.getFlag('x');
  assert.equal(f.default, true);
  assert.equal(f.version, 2);
  assert.equal(f.description, 'upgraded');
});

// ──────────────────────────────────────────────────────────────
// 3. Boolean isEnabled + default
// ──────────────────────────────────────────────────────────────
test('isEnabled returns the default for a boolean flag with no rules', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'a', default: true });
  ff.defineFlag({ name: 'b', default: false });
  assert.equal(ff.isEnabled('a', {}), true);
  assert.equal(ff.isEnabled('b', {}), false);
});

test('isEnabled returns false for unknown flags', () => {
  const ff = makeFF();
  assert.equal(ff.isEnabled('does-not-exist', {}), false);
  const ev = ff.evaluate('does-not-exist', {});
  assert.equal(ev.enabled, false);
  assert.equal(ev.reason, 'unknown-flag');
});

// ──────────────────────────────────────────────────────────────
// 4. Bucket stability (FNV-1a sticky)
// ──────────────────────────────────────────────────────────────
test('bucketUser is sticky — same user + same flag → same bucket', () => {
  const ff = makeFF();
  for (let i = 0; i < 1000; i++) {
    const uid = `user-${i}`;
    const b1 = ff.bucketUser(uid, 'flag1');
    const b2 = ff.bucketUser(uid, 'flag1');
    assert.equal(b1, b2);
    assert.ok(b1 >= 0 && b1 < 100);
  }
});

test('bucketUser: same user gets different buckets per flag (salted)', () => {
  const ff = makeFF();
  // Count how many users land in the *same* bucket across 2 flags
  let same = 0;
  const total = 500;
  for (let i = 0; i < total; i++) {
    const uid = `u-${i}`;
    if (ff.bucketUser(uid, 'flagA') === ff.bucketUser(uid, 'flagB')) same++;
  }
  // Collisions are expected ~1% of the time (100 buckets);
  // we just assert it's not identical distribution.
  assert.ok(same < total * 0.5, `buckets should be salted per-flag (got ${same}/${total})`);
});

// ──────────────────────────────────────────────────────────────
// 5. Rollout percent accuracy
// ──────────────────────────────────────────────────────────────
test('rollout percent approximates target within tolerance (50% target)', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'rollout-50', rolloutPercent: 50 });
  let enabled = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) {
    if (ff.isEnabled('rollout-50', { userId: `u-${i}` })) enabled++;
  }
  const pct = (enabled / N) * 100;
  assert.ok(Math.abs(pct - 50) < 3,
    `expected ~50% rollout, got ${pct.toFixed(2)}%`);
});

test('rollout percent 0 and 100 are hard boundaries', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'all-off', rolloutPercent: 0 });
  ff.defineFlag({ name: 'all-on',  rolloutPercent: 100 });
  for (let i = 0; i < 500; i++) {
    assert.equal(ff.isEnabled('all-off', { userId: `u-${i}` }), false);
    assert.equal(ff.isEnabled('all-on',  { userId: `u-${i}` }), true);
  }
});

// ──────────────────────────────────────────────────────────────
// 6. Rule tree evaluation
// ──────────────────────────────────────────────────────────────
test('rule tree — AND of two leaf conditions', () => {
  const ff = makeFF();
  ff.defineFlag({
    name: 'admin-il',
    rules: { all: [
      { attr: 'role',    op: 'eq', val: 'admin' },
      { attr: 'country', op: 'in', val: ['IL', 'US'] },
    ] },
  });
  assert.equal(ff.isEnabled('admin-il', { role: 'admin', country: 'IL' }), true);
  assert.equal(ff.isEnabled('admin-il', { role: 'admin', country: 'DE' }), false);
  assert.equal(ff.isEnabled('admin-il', { role: 'user',  country: 'IL' }), false);
});

test('rule tree — OR nested under AND', () => {
  const ff = makeFF();
  ff.defineFlag({
    name: 'power-user',
    rules: { all: [
      { attr: 'role', op: 'ne', val: 'banned' },
      { any: [
        { attr: 'tier',    op: 'gte', val: 3 },
        { attr: 'country', op: 'eq',  val: 'IL' },
      ] },
    ] },
  });
  assert.equal(ff.isEnabled('power-user', { role: 'user', tier: 3, country: 'US' }), true);
  assert.equal(ff.isEnabled('power-user', { role: 'user', tier: 1, country: 'IL' }), true);
  assert.equal(ff.isEnabled('power-user', { role: 'user', tier: 1, country: 'US' }), false);
  assert.equal(ff.isEnabled('power-user', { role: 'banned', tier: 9, country: 'IL' }), false);
});

test('rule tree — NOT, contains, regex, exists operators', () => {
  const ff = makeFF();
  ff.defineFlag({
    name: 'not-test',
    rules: { not: { attr: 'role', op: 'eq', val: 'guest' } },
  });
  assert.equal(ff.isEnabled('not-test', { role: 'user'  }), true);
  assert.equal(ff.isEnabled('not-test', { role: 'guest' }), false);

  ff.defineFlag({
    name: 'contains-test',
    rules: { attr: 'email', op: 'contains', val: '@tko.co.il' },
  });
  assert.equal(ff.isEnabled('contains-test', { email: 'uzi@tko.co.il' }), true);
  assert.equal(ff.isEnabled('contains-test', { email: 'uzi@gmail.com' }), false);

  ff.defineFlag({
    name: 'regex-test',
    rules: { attr: 'phone', op: 'regex', val: '^05\\d{8}$' },
  });
  assert.equal(ff.isEnabled('regex-test', { phone: '0501234567' }), true);
  assert.equal(ff.isEnabled('regex-test', { phone: '031234567'  }), false);

  ff.defineFlag({
    name: 'exists-test',
    rules: { attr: 'userId', op: 'exists' },
  });
  assert.equal(ff.isEnabled('exists-test', { userId: 'x' }), true);
  assert.equal(ff.isEnabled('exists-test', {}),              false);
});

test('rule tree — user-list via attr/in operator', () => {
  const ff = makeFF();
  ff.defineFlag({
    name: 'beta-allowlist',
    type: 'user-list',
    rules: { attr: 'userId', op: 'in', val: ['alice', 'bob', 'carol'] },
  });
  assert.equal(ff.isEnabled('beta-allowlist', { userId: 'alice' }), true);
  assert.equal(ff.isEnabled('beta-allowlist', { userId: 'dave'  }), false);
});

test('readAttr supports dotted paths and context.attributes shortcut', () => {
  assert.equal(readAttr({ user: { id: 1 } }, 'user.id'), 1);
  assert.equal(readAttr({ attributes: { country: 'IL' } }, 'country'), 'IL');
  assert.equal(readAttr({}, 'missing'), undefined);
});

// ──────────────────────────────────────────────────────────────
// 7. Schedule dates
// ──────────────────────────────────────────────────────────────
test('startDate / endDate gate the flag', () => {
  let fakeNow = new Date('2026-04-01T00:00:00Z');
  const ff = new FeatureFlags({
    auditFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-')), 'a.jsonl'),
    clock: () => fakeNow,
  });
  ff.defineFlag({
    name: 'launch',
    default: true,
    startDate: '2026-05-01T00:00:00Z',
    endDate:   '2026-06-01T00:00:00Z',
  });
  // Before start
  assert.equal(ff.isEnabled('launch', {}), false);
  // During window
  fakeNow = new Date('2026-05-15T00:00:00Z');
  assert.equal(ff.isEnabled('launch', {}), true);
  // After end
  fakeNow = new Date('2026-06-15T00:00:00Z');
  assert.equal(ff.isEnabled('launch', {}), false);
});

// ──────────────────────────────────────────────────────────────
// 8. Audit trail
// ──────────────────────────────────────────────────────────────
test('setFlag writes an audit entry with before/after/actor', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'audited', default: false });
  ff.setFlag('audited', true, 'uzi@tko');
  const mem = ff._getAuditMemory();
  // 2 entries: define + set
  assert.ok(mem.length >= 2);
  const last = mem[mem.length - 1];
  assert.equal(last.event, 'set');
  assert.equal(last.name, 'audited');
  assert.equal(last.actor, 'uzi@tko');
  assert.equal(last.before.default, false);
  assert.equal(last.after.default, true);
  assert.ok(last.ts, 'timestamp present');
});

test('audit file is JSONL and readable line-by-line', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'f1', default: false });
  ff.setFlag('f1', true, 'tester');
  const lines = fs.readFileSync(ff.auditFile, 'utf8').trim().split('\n');
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    const obj = JSON.parse(line);
    assert.ok(obj.ts && obj.event && obj.name);
  }
});

test('setFlag throws on unknown flag', () => {
  const ff = makeFF();
  assert.throws(() => ff.setFlag('nope', true, 'x'), /unknown flag/);
});

// ──────────────────────────────────────────────────────────────
// 9. exportState / importState (non-destructive)
// ──────────────────────────────────────────────────────────────
test('exportState/importState round-trip preserves flags', () => {
  const ff1 = makeFF();
  ff1.defineFlag({ name: 'alpha', default: true, description_he: 'אלפא' });
  ff1.defineFlag({
    name: 'beta',
    rules: { attr: 'role', op: 'eq', val: 'admin' },
  });
  const state = ff1.exportState();

  const ff2 = makeFF();
  const res = ff2.importState(state);
  assert.equal(res.imported.length, 2);
  assert.equal(ff2.getFlag('alpha').default, true);
  assert.equal(ff2.getFlag('alpha').description_he, 'אלפא');
  assert.equal(ff2.isEnabled('beta', { role: 'admin' }), true);
});

test('importState is non-destructive (never deletes existing flags)', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'keep-me', default: true });
  ff.importState({ flags: [{ name: 'new-one', default: false, version: 1 }] });
  // Existing flag still present
  assert.ok(ff.getFlag('keep-me'));
  assert.ok(ff.getFlag('new-one'));
});

// ──────────────────────────────────────────────────────────────
// 10. Express middleware
// ──────────────────────────────────────────────────────────────
test('express() middleware attaches req.flags with working helpers', () => {
  const ff = makeFF();
  ff.defineFlag({ name: 'mw-boolean', default: true });
  ff.defineFlag({
    name: 'mw-admin',
    rules: { attr: 'role', op: 'eq', val: 'admin' },
  });
  const mw = ff.express();

  const req = {
    user: { id: 'u-1', role: 'admin' },
    query: {},
    headers: {},
  };
  let called = false;
  mw(req, {}, () => { called = true; });
  assert.ok(called, 'next() was called');
  assert.ok(req.flags, 'req.flags attached');
  assert.equal(req.flags.isEnabled('mw-boolean'), true);
  assert.equal(req.flags.isEnabled('mw-admin'),   true);

  const ev = req.flags.evaluate('mw-admin', true);
  assert.equal(ev.enabled, true);
  assert.equal(ev.reason, 'rules-pass');
  assert.ok(Array.isArray(ev.traces));
});

test('express() middleware denies when user role mismatches', () => {
  const ff = makeFF();
  ff.defineFlag({
    name: 'admin-only',
    rules: { attr: 'role', op: 'eq', val: 'admin' },
  });
  const mw = ff.express();
  const req = { user: { id: 'u-2', role: 'user' }, query: {}, headers: {} };
  mw(req, {}, () => {});
  assert.equal(req.flags.isEnabled('admin-only'), false);
});

// ──────────────────────────────────────────────────────────────
// 11. evaluate() trace output
// ──────────────────────────────────────────────────────────────
test('evaluate() returns traces when trace=true', () => {
  const ff = makeFF();
  ff.defineFlag({
    name: 'traced',
    rules: { all: [
      { attr: 'role', op: 'eq', val: 'admin' },
      { attr: 'tier', op: 'gte', val: 2 },
    ] },
  });
  const ev = ff.evaluate('traced', { role: 'admin', tier: 5 }, true);
  assert.equal(ev.enabled, true);
  assert.ok(Array.isArray(ev.traces));
  assert.ok(ev.traces.length >= 2, 'both conditions should be traced');
});

// ──────────────────────────────────────────────────────────────
// 12. evalRule direct API
// ──────────────────────────────────────────────────────────────
test('evalRule handles empty all/any correctly', () => {
  assert.equal(evalRule({ all: [] }, {}), true,  'empty AND → true');
  assert.equal(evalRule({ any: [] }, {}), true,  'empty OR on zero children → true (vacuous)');
  assert.equal(evalRule(null, {}),       true,  'null rule → true');
});
