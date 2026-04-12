/**
 * TenantConfigMerger unit tests — Agent Y-199 (Techno-Kol Uzi mega-ERP)
 * מבחני יחידה למַמזג תצורה רב-ארגוני
 *
 * Run:  node --test test/wiring/tenant-config.test.js
 *
 * Coverage:
 *   - layer precedence (global < org < user)
 *   - locked-field enforcement (two declaration styles)
 *   - schema validation (type / min / max / enum / pattern / required)
 *   - type coercion (number, integer, boolean, date, array, object)
 *   - bilingual audit trail
 *   - diff view (added / removed / changed / unchanged)
 *   - snapshot id stability
 *   - strict mode throwing behaviour
 *   - append-only history across multiple merges
 *   - deep / nested merging
 *   - unknown-key warnings
 *   - schema defaults
 *   - input validation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TenantConfigMerger,
  LAYERS,
  LAYER_PRECEDENCE,
  ACTIONS,
  _internals,
} = require('../../src/wiring/tenant-config.js');

// ─── helpers ────────────────────────────────────────────────────────────────

function mkMerger(schema = {}, opts = {}) {
  return new TenantConfigMerger({
    schema,
    now: () => 1_700_000_000_000,
    ...opts,
  });
}

const baseSchema = {
  'theme':             { type: 'string', enum: ['light', 'dark', 'system'], default: 'light' },
  'language':          { type: 'string', enum: ['he', 'en', 'ar', 'ru'], default: 'he' },
  'server.port':       { type: 'integer', required: true, min: 1, max: 65535 },
  'server.host':       { type: 'string', default: '0.0.0.0' },
  'features.beta':     { type: 'boolean', default: false },
  'features.maxUsers': { type: 'integer', min: 1, max: 10000 },
  'timezone':          { type: 'string', default: 'Asia/Jerusalem' },
};

// ─── tests ──────────────────────────────────────────────────────────────────

test('01. merge: precedence user > org > global for scalar values', () => {
  const merger = mkMerger();
  const global = { theme: 'light', language: 'he' };
  const org    = { theme: 'dark' };
  const user   = { language: 'en' };
  const { effective } = merger.merge(global, org, user);
  assert.equal(effective.theme, 'dark', 'org wins over global');
  assert.equal(effective.language, 'en', 'user wins over global');
});

test('02. merge: user overrides org for non-locked fields', () => {
  const merger = mkMerger();
  const global = { theme: 'light' };
  const org    = { theme: 'dark' };
  const user   = { theme: 'system' };
  const { effective, audit } = merger.merge(global, org, user);
  assert.equal(effective.theme, 'system', 'user must win when not locked');
  const userOverride = audit.find(
    (e) => e.path === 'theme' && e.layer === LAYERS.USER && e.action === ACTIONS.OVERRIDE,
  );
  assert.ok(userOverride, 'user override entry recorded');
});

test('03. merge: org __locked__ array prevents user override', () => {
  const merger = mkMerger();
  const global = { theme: 'light' };
  const org    = { theme: 'dark', __locked__: ['theme'] };
  const user   = { theme: 'system' };
  const { effective, locked, audit, warnings } = merger.merge(global, org, user);
  assert.equal(effective.theme, 'dark', 'locked org value must stand');
  assert.deepEqual(locked, ['theme']);
  const rejected = audit.find((e) => e.action === ACTIONS.LOCK_REJECTED);
  assert.ok(rejected, 'lock-rejected entry present');
  assert.equal(rejected.newValue, 'system', 'rejected value captured for UI display');
  assert.ok(warnings.some((w) => w.action === ACTIONS.LOCK_REJECTED));
});

test('04. merge: {value, locked:true} convenience lock prevents override', () => {
  const merger = mkMerger();
  const global = { timezone: 'UTC' };
  const org    = { timezone: { value: 'Asia/Jerusalem', locked: true } };
  const user   = { timezone: 'America/New_York' };
  const { effective, locked } = merger.merge(global, org, user);
  assert.equal(effective.timezone, 'Asia/Jerusalem');
  assert.ok(locked.includes('timezone'));
});

test('05. merge: deep nested paths honour precedence and locks', () => {
  const merger = mkMerger();
  const global = { server: { port: 3000, host: '0.0.0.0' } };
  const org    = { server: { port: 3100, __locked__: ['port'] } };
  const user   = { server: { port: 9999, host: '127.0.0.1' } };
  const { effective, locked } = merger.merge(global, org, user);
  assert.equal(effective.server.port, 3100, 'org-locked port survives user override');
  assert.equal(effective.server.host, '127.0.0.1', 'unlocked host picks up user value');
  assert.ok(locked.includes('server.port'));
});

test('06. schema validation: required field missing produces error', () => {
  const merger = mkMerger(baseSchema);
  const { errors } = merger.merge({}, {}, {});
  const portErr = errors.find((e) => e.path === 'server.port');
  assert.ok(portErr, 'missing required server.port flagged');
  assert.ok(portErr.error.he.includes('חובה'));
  assert.ok(portErr.error.en.includes('Required'));
});

test('07. schema validation: enum violation flagged bilingually', () => {
  const merger = mkMerger(baseSchema);
  const { errors } = merger.merge({ theme: 'rainbow', 'server': { port: 3100 } }, {}, {});
  const themeErr = errors.find((e) => e.path === 'theme');
  assert.ok(themeErr);
  assert.ok(themeErr.error.he.includes('רשימה'));
  assert.ok(themeErr.error.en.includes('enum'));
});

test('08. schema validation: min/max bounds on integer', () => {
  const merger = mkMerger(baseSchema);
  const tooHigh = merger.merge({ server: { port: 99999 } }, {}, {});
  const tooLow  = merger.merge({ server: { port: 0 } }, {}, {});
  assert.ok(tooHigh.errors.some((e) => e.path === 'server.port' && e.error.en.includes('maximum')));
  assert.ok(tooLow.errors.some((e) => e.path === 'server.port' && e.error.en.includes('minimum')));
});

test('09. coercion: string "42" becomes integer when schema says integer', () => {
  const merger = mkMerger(baseSchema);
  const { effective, audit } = merger.merge({ server: { port: '42' } }, {}, {});
  assert.strictEqual(effective.server.port, 42);
  const coerced = audit.find((e) => e.action === ACTIONS.COERCED && e.path === 'server.port');
  assert.ok(coerced, 'coercion recorded in audit');
});

test('10. coercion: string "true"/"false" becomes boolean', () => {
  const merger = mkMerger(baseSchema);
  const yes = merger.merge({ features: { beta: 'true' } }, {}, {});
  const no  = merger.merge({ features: { beta: 'no' } }, {}, {});
  assert.strictEqual(yes.effective.features.beta, true);
  assert.strictEqual(no.effective.features.beta, false);
});

test('11. coercion: Hebrew boolean "כן"/"לא" handled', () => {
  const merger = mkMerger(baseSchema);
  const yes = merger.merge({ features: { beta: 'כן' } }, {}, {});
  const no  = merger.merge({ features: { beta: 'לא' } }, {}, {});
  assert.strictEqual(yes.effective.features.beta, true);
  assert.strictEqual(no.effective.features.beta, false);
});

test('12. coercion: failed coercion preserves original and records entry', () => {
  const merger = mkMerger({ 'x.n': { type: 'number' } });
  const { effective, audit } = merger.merge({ x: { n: 'not-a-number' } }, {}, {});
  assert.strictEqual(effective.x.n, 'not-a-number', 'original value preserved');
  const failed = audit.find((e) => e.action === ACTIONS.COERCE_FAILED && e.path === 'x.n');
  assert.ok(failed, 'coerce-failed entry recorded');
});

test('13. audit trail: every entry has bilingual note (he + en)', () => {
  const merger = mkMerger();
  const { audit } = merger.merge(
    { theme: 'light' },
    { theme: 'dark' },
    { theme: 'system' },
  );
  assert.ok(audit.length >= 3);
  for (const entry of audit) {
    assert.ok(entry.note && typeof entry.note.he === 'string' && entry.note.he.length > 0);
    assert.ok(entry.note && typeof entry.note.en === 'string' && entry.note.en.length > 0);
  }
});

test('14. diff view: vsGlobal reports added/changed when higher layers differ', () => {
  const merger = mkMerger();
  const global = { theme: 'light', language: 'he' };
  const org    = { theme: 'dark' };
  const user   = { newField: 42 };
  const { diff } = merger.merge(global, org, user);
  assert.ok('newField' in diff.vsGlobal.added, 'new user field shows as added vs global');
  assert.ok('theme' in diff.vsGlobal.changed, 'theme shows as changed vs global');
  assert.equal(diff.vsGlobal.changed.theme.from, 'light');
  assert.equal(diff.vsGlobal.changed.theme.to, 'dark');
});

test('15. snapshotId: identical merges produce identical snapshot ids', () => {
  const merger1 = mkMerger();
  const merger2 = mkMerger();
  const inputs = [{ a: 1, b: { c: 2 } }, { b: { c: 3 } }, { d: 4 }];
  const r1 = merger1.merge(...inputs);
  const r2 = merger2.merge(...inputs);
  assert.equal(r1.snapshotId, r2.snapshotId, 'deterministic hash');
  assert.equal(r1.snapshotId.length, 16);
});

test('16. snapshotId: different inputs produce different snapshots', () => {
  const merger = mkMerger();
  const a = merger.merge({ x: 1 }, {}, {}).snapshotId;
  const b = merger.merge({ x: 2 }, {}, {}).snapshotId;
  assert.notEqual(a, b);
});

test('17. strict mode: throws on validation errors', () => {
  const merger = mkMerger(baseSchema, { strict: true });
  assert.throws(
    () => merger.merge({}, {}, {}),
    /schema error/,
  );
});

test('18. non-strict mode: errors returned but merge completes', () => {
  const merger = mkMerger(baseSchema);
  const result = merger.merge({}, {}, {});
  assert.ok(result.errors.length > 0);
  assert.ok(result.effective, 'effective config still returned');
  // schema defaults still applied
  assert.equal(result.effective.theme, 'light');
  assert.equal(result.effective.language, 'he');
});

test('19. schema defaults fill in missing keys', () => {
  const merger = mkMerger(baseSchema);
  const { effective, audit } = merger.merge({ server: { port: 3100 } }, {}, {});
  assert.equal(effective.timezone, 'Asia/Jerusalem', 'default applied');
  assert.equal(effective.server.host, '0.0.0.0', 'nested default applied');
  assert.ok(audit.some((e) => e.action === ACTIONS.SCHEMA_DEFAULT && e.path === 'timezone'));
});

test('20. unknown keys preserved and flagged (never deleted)', () => {
  const merger = mkMerger({ 'known': { type: 'string' } });
  const { effective, audit, warnings } = merger.merge(
    { known: 'ok', extra: 'surprise' },
    {},
    { anotherExtra: 99 },
  );
  assert.equal(effective.extra, 'surprise', 'extra kept — never deleted');
  assert.equal(effective.anotherExtra, 99);
  const extraWarn = audit.find((e) => e.action === ACTIONS.UNKNOWN_KEY && e.path === 'extra');
  assert.ok(extraWarn);
  assert.ok(warnings.length >= 2);
});

test('21. append-only history accumulates across multiple merges', () => {
  const merger = mkMerger();
  merger.merge({ a: 1 }, {}, {});
  merger.merge({ b: 2 }, {}, {});
  merger.merge({ c: 3 }, {}, {});
  const hist = merger.history();
  assert.ok(hist.length >= 3, 'history grows across merges');
  // history should be a copy — mutating it must not affect internal state
  hist.push({ fake: true });
  assert.notEqual(merger.history().length, hist.length);
});

test('22. input validation: non-object layer throws', () => {
  const merger = mkMerger();
  assert.throws(() => merger.merge('nope', {}, {}), /layer global/);
  assert.throws(() => merger.merge({}, 42, {}), /layer org/);
  assert.throws(() => merger.merge({}, {}, [1, 2]), /layer user/);
});

test('23. standalone diff API works on arbitrary inputs', () => {
  const merger = mkMerger();
  const a = { x: 1, y: 2, z: 3 };
  const b = { x: 1, y: 99, w: 4 };
  const d = merger.diff(a, b);
  assert.deepEqual(d.unchanged, { x: 1 });
  assert.deepEqual(d.changed, { y: { from: 2, to: 99 } });
  assert.deepEqual(d.added, { w: 4 });
  assert.deepEqual(d.removed, { z: 3 });
});

test('24. standalone validate API reports errors against schema', () => {
  const merger = mkMerger(baseSchema);
  const good = merger.validate({ server: { port: 3100 }, theme: 'dark', language: 'he' });
  assert.equal(good.ok, true);
  assert.equal(good.errors.length, 0);
  const bad = merger.validate({ server: { port: 99999 }, theme: 'rainbow' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 2);
});

test('25. winnerLayer records which layer wrote each effective value', () => {
  const merger = mkMerger();
  const { winnerLayer } = merger.merge(
    { a: 1, b: 2, c: 3 },
    { b: 20 },
    { c: 300 },
  );
  assert.equal(winnerLayer.a, LAYERS.GLOBAL);
  assert.equal(winnerLayer.b, LAYERS.ORG);
  assert.equal(winnerLayer.c, LAYERS.USER);
});

test('26. pattern validation: string pattern enforced', () => {
  const merger = mkMerger({
    'email': { type: 'string', pattern: /^[a-z]+@[a-z]+\.[a-z]+$/ },
  });
  const ok = merger.merge({ email: 'alice@test.il' }, {}, {});
  const bad = merger.merge({ email: 'not-an-email' }, {}, {});
  assert.equal(ok.errors.length, 0);
  assert.ok(bad.errors.some((e) => e.path === 'email'));
});

test('27. array coercion: CSV string becomes array for array schema', () => {
  const merger = mkMerger({ 'tags': { type: 'array' } });
  const { effective } = merger.merge({ tags: 'red, green, blue' }, {}, {});
  assert.deepEqual(effective.tags, ['red', 'green', 'blue']);
});

test('28. LAYER_PRECEDENCE exported and ordered global→user', () => {
  assert.deepEqual(LAYER_PRECEDENCE, ['global', 'org', 'user']);
  assert.deepEqual(Object.keys(LAYERS).length, 3);
});

test('29. internals: normaliseLayer unwraps {value, locked} wrappers', () => {
  const out = _internals.normaliseLayer({
    theme: { value: 'dark', locked: true },
    plain: 'x',
    nested: { inner: { value: 42, locked: true } },
    __locked__: ['theme'],
  });
  assert.equal(out.theme, 'dark');
  assert.equal(out.plain, 'x');
  assert.equal(out.nested.inner, 42);
  assert.ok(!('__locked__' in out), '__locked__ stripped from normalised tree');
});

test('30. internals: extractLocks discovers both styles at any depth', () => {
  const set = _internals.extractLocks({
    a: { value: 1, locked: true },
    b: 2,
    deep: {
      __locked__: ['x', 'y.z'],
      x: 10,
      y: { z: 20 },
    },
  });
  assert.ok(set.has('a'));
  assert.ok(set.has('deep.x'));
  assert.ok(set.has('deep.y.z'));
  assert.equal(set.size, 3);
});

test('31. no-delete guarantee: user cannot clear an org-set key', () => {
  const merger = mkMerger();
  const global = {};
  const org    = { required: 'must-stay' };
  const user   = {}; // user provides nothing
  const { effective } = merger.merge(global, org, user);
  assert.equal(effective.required, 'must-stay', 'org value survives empty user layer');
});

test('32. audit trail order reflects merge precedence (global → org → user)', () => {
  const merger = mkMerger();
  const { audit } = merger.merge({ k: 1 }, { k: 2 }, { k: 3 });
  const kEntries = audit.filter((e) => e.path === 'k');
  assert.equal(kEntries[0].layer, LAYERS.GLOBAL);
  assert.equal(kEntries[1].layer, LAYERS.ORG);
  assert.equal(kEntries[2].layer, LAYERS.USER);
});

test('33. coercion: date string becomes Date object', () => {
  const merger = mkMerger({ 'startAt': { type: 'date' } });
  const { effective } = merger.merge({ startAt: '2026-04-11T00:00:00Z' }, {}, {});
  assert.ok(effective.startAt instanceof Date);
  assert.equal(effective.startAt.toISOString(), '2026-04-11T00:00:00.000Z');
});

test('34. lock-applied entry recorded even when user does not attempt override', () => {
  const merger = mkMerger();
  const { audit } = merger.merge(
    { k: 'g' },
    { k: 'o', __locked__: ['k'] },
    {},
  );
  assert.ok(audit.some((e) => e.action === ACTIONS.LOCK_APPLIED && e.path === 'k'));
});
