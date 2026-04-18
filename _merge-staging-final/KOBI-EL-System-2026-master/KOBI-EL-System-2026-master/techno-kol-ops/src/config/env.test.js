// ═══════════════════════════════════════════════════════════════════
// TECHNO-KOL OPS — env.js validation tests (Agent-23)
// ───────────────────────────────────────────────────────────────────
// Standalone runner — no test framework required. Run with:
//   node src/config/env.test.js
//
// Exits with code 1 if any assertion fails. Intended for CI smoke.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const assert = require('assert');
const path = require('path');

// Ensure we don't accidentally log during tests.
process.env.NODE_ENV = 'test';

// Load the module FRESH for each test so its side-effects don't leak.
function freshLoad(envOverrides) {
  // Snapshot + reset process.env.
  const snapshot = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, { NODE_ENV: 'test' }, envOverrides || {});

  // Clear require cache for env.js so the module re-runs.
  const modulePath = require.resolve('./env.js');
  delete require.cache[modulePath];

  let mod;
  let error;
  try {
    mod = require('./env.js');
  } catch (err) {
    error = err;
  }

  // Restore.
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, snapshot);
  delete require.cache[modulePath];

  return { mod, error };
}

// ───────────────────────────────────────────────────────────────────
// A minimal "all required vars present" baseline.
// ───────────────────────────────────────────────────────────────────
const VALID = {
  PORT: '5000',
  ALLOWED_ORIGINS: 'http://localhost:5000,http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'super-secret-anon-key',
};

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ───────────────────────────────────────────────────────────────────
// 1. Missing required var → throws with ALL missing listed
// ───────────────────────────────────────────────────────────────────
test('throws listing ALL missing required vars at once', () => {
  const { mod, error } = freshLoad({}); // nothing set
  assert.strictEqual(mod, undefined, 'module should not load on bad env');
  assert.ok(error, 'expected an error to be thrown');
  assert.strictEqual(error.name, 'EnvValidationError');

  // All required vars should appear in the error message — not first-error-wins.
  for (const required of ['PORT', 'ALLOWED_ORIGINS', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
    assert.ok(
      error.message.includes(required),
      `expected error message to list missing var ${required}, got:\n${error.message}`
    );
    assert.ok(
      Array.isArray(error.missing) && error.missing.includes(required),
      `expected error.missing array to include ${required}`
    );
  }
  assert.ok(error.missing.length >= 4, 'expected >=4 missing vars reported together');
});

test('throws when only ONE required var is missing (partial case)', () => {
  const partial = { ...VALID };
  delete partial.SUPABASE_ANON_KEY;
  const { mod, error } = freshLoad(partial);
  assert.strictEqual(mod, undefined);
  assert.ok(error);
  assert.deepStrictEqual(error.missing, ['SUPABASE_ANON_KEY']);
});

// ───────────────────────────────────────────────────────────────────
// 2. Defaults applied correctly
// ───────────────────────────────────────────────────────────────────
test('applies defaults for optional vars', () => {
  const { mod, error } = freshLoad(VALID);
  assert.ok(!error, `unexpected error: ${error && error.message}`);
  assert.strictEqual(mod.NODE_ENV, 'test'); // we set it
  assert.strictEqual(mod.APP_URL, 'http://localhost:5000');
  assert.strictEqual(mod.JWT_EXPIRES_IN, '24h');
  assert.strictEqual(mod.ONYX_PROCUREMENT_URL, 'http://localhost:3100');
  assert.strictEqual(mod.ONYX_AI_URL, 'http://localhost:3200');
  assert.strictEqual(mod.LOG_LEVEL, 'info');
});

test('coerces PORT to number', () => {
  const { mod, error } = freshLoad(VALID);
  assert.ok(!error);
  assert.strictEqual(typeof mod.PORT, 'number');
  assert.strictEqual(mod.PORT, 5000);
});

test('parses ALLOWED_ORIGINS as csv array', () => {
  const { mod, error } = freshLoad(VALID);
  assert.ok(!error);
  assert.ok(Array.isArray(mod.ALLOWED_ORIGINS));
  assert.deepStrictEqual(mod.ALLOWED_ORIGINS, [
    'http://localhost:5000',
    'http://localhost:5173',
  ]);
});

test('throws typed error when PORT is non-numeric', () => {
  const { error } = freshLoad({ ...VALID, PORT: 'abc' });
  assert.ok(error);
  assert.ok(error.message.includes('PORT'));
  assert.ok(Array.isArray(error.typeErrors) && error.typeErrors.length > 0);
});

// ───────────────────────────────────────────────────────────────────
// 3. Secrets redacted in the log summary
// ───────────────────────────────────────────────────────────────────
test('summary redacts secrets as ****', () => {
  const { mod, error } = freshLoad(VALID);
  assert.ok(!error);
  const summary = mod.__buildSummary(mod);

  // Secret fields → masked.
  assert.strictEqual(summary.SUPABASE_ANON_KEY, '****');
  assert.strictEqual(summary.JWT_SECRET, '****');

  // Non-secret fields → shown verbatim.
  assert.strictEqual(summary.NODE_ENV, 'test');
  assert.ok(String(summary.PORT).includes('5000'));

  // Actual secret value must NOT be in the rendered summary.
  const rendered = JSON.stringify(summary);
  assert.ok(
    !rendered.includes('super-secret-anon-key'),
    'secret value leaked into summary output'
  );
});

test('logSummary never prints the raw secret', () => {
  const { mod } = freshLoad(VALID);
  const captured = [];
  const fakeLogger = { log: (msg) => captured.push(String(msg)) };
  mod.__logSummary(mod, fakeLogger);
  const joined = captured.join('\n');
  assert.ok(!joined.includes('super-secret-anon-key'), 'secret leaked into logSummary');
  assert.ok(joined.includes('****'), 'expected redaction marker in log output');
  assert.ok(joined.includes('SUPABASE_ANON_KEY'));
});

// ───────────────────────────────────────────────────────────────────
// 4. Frozen — cannot be mutated
// ───────────────────────────────────────────────────────────────────
test('exported config is frozen (cannot mutate)', () => {
  const { mod, error } = freshLoad(VALID);
  assert.ok(!error);
  assert.ok(Object.isFrozen(mod), 'expected config to be frozen');

  // Strict mode throws on write-to-frozen.
  let threw = false;
  try {
    'use strict';
    mod.PORT = 9999;
  } catch (_e) {
    threw = true;
  }
  // Also assert the value didn't actually change (covers non-strict silent fail).
  assert.strictEqual(mod.PORT, 5000, 'frozen value should not have changed');
  assert.ok(threw || mod.PORT === 5000);
});

test('cannot add new keys to frozen config', () => {
  const { mod } = freshLoad(VALID);
  try {
    mod.HACKED = true;
  } catch (_e) { /* strict mode throws */ }
  assert.strictEqual(mod.HACKED, undefined);
});

// ───────────────────────────────────────────────────────────────────
// Runner
// ───────────────────────────────────────────────────────────────────
(function run() {
  let passed = 0;
  let failed = 0;
  const failures = [];
  for (const t of tests) {
    try {
      t.fn();
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      failed++;
      failures.push({ name: t.name, err });
      // eslint-disable-next-line no-console
      console.log(`  FAIL ${t.name}\n       ${err.message}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n[env.test] ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.error(`\n--- ${f.name} ---\n${f.err.stack || f.err.message}`);
    }
    process.exit(1);
  }
})();
