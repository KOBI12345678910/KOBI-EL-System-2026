/*
 * techno-kol-ops / src/auth/jwt-helper.test.js
 * --------------------------------------------
 * Self-contained test runner for jwt-helper.js.
 *
 * Runs with plain `node src/auth/jwt-helper.test.js` — no jest, no mocha, no
 * new dependencies required. Exits with code 0 on success, 1 on failure.
 *
 * Covers:
 *   1. Sign and verify round-trip.
 *   2. Expired token -> rejected.
 *   3. Tampered token -> rejected.
 *   4. Weak / missing secret -> throws on init.
 *   5. Missing / invalid payload -> validation error.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const HELPER_PATH = path.join(__dirname, 'jwt-helper.js');

// A cryptographically random 64-char secret for happy-path tests.
const STRONG_SECRET =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

function freshRequire() {
  // Clear the module cache so each test gets a clean secret-validation state.
  delete require.cache[require.resolve(HELPER_PATH)];
  // eslint-disable-next-line global-require
  return require(HELPER_PATH);
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// --------------------------------------------------------------------------
// 1. Sign and verify round-trip
// --------------------------------------------------------------------------
test('sign + verify round-trip preserves claims', () => {
  process.env.JWT_SECRET = STRONG_SECRET;
  delete process.env.JWT_EXPIRES_IN;
  const { signToken, verifyToken } = freshRequire();

  const token = signToken(
    { id: 'u-123', username: 'kobi', role: 'admin' },
    { expiresIn: '1h' }
  );
  assert.strictEqual(typeof token, 'string', 'token should be a string');
  assert.strictEqual(token.split('.').length, 3, 'token should have 3 parts');

  const decoded = verifyToken(token);
  assert.strictEqual(decoded.id, 'u-123');
  assert.strictEqual(decoded.username, 'kobi');
  assert.strictEqual(decoded.role, 'admin');
  assert.ok(typeof decoded.exp === 'number', 'exp claim should be set');
  assert.ok(typeof decoded.iat === 'number', 'iat claim should be set');
});

// --------------------------------------------------------------------------
// 2. Expired token -> rejected
// --------------------------------------------------------------------------
test('expired token is rejected', () => {
  process.env.JWT_SECRET = STRONG_SECRET;
  const { signToken, verifyToken } = freshRequire();

  // 1 second lifetime, then wait 1.2s.
  const token = signToken({ id: 'u-1' }, { expiresIn: '1s' });

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        let threw = false;
        try {
          verifyToken(token);
        } catch (err) {
          threw = true;
          assert.ok(
            /expired/i.test(err.message) || err.name === 'TokenExpiredError',
            `expected expiry error, got: ${err.name}: ${err.message}`
          );
        }
        assert.ok(threw, 'verifyToken should have thrown on expired token');
        resolve();
      } catch (e) {
        reject(e);
      }
    }, 1200);
  });
});

// --------------------------------------------------------------------------
// 3. Tampered token -> rejected
// --------------------------------------------------------------------------
test('tampered token is rejected', () => {
  process.env.JWT_SECRET = STRONG_SECRET;
  const { signToken, verifyToken } = freshRequire();

  const token = signToken(
    { id: 'u-2', role: 'viewer' },
    { expiresIn: '1h' }
  );
  const parts = token.split('.');

  // Flip a char in the payload segment to corrupt it without changing length.
  const payload = parts[1];
  const flipped =
    payload.slice(0, -1) + (payload.slice(-1) === 'A' ? 'B' : 'A');
  const tampered = `${parts[0]}.${flipped}.${parts[2]}`;

  let threw = false;
  try {
    verifyToken(tampered);
  } catch (err) {
    threw = true;
    assert.ok(
      /invalid|signature|malformed/i.test(err.message),
      `expected signature error, got: ${err.message}`
    );
  }
  assert.ok(threw, 'verifyToken should have thrown on tampered token');
});

// --------------------------------------------------------------------------
// 4a. Weak secret -> throws on init
// --------------------------------------------------------------------------
test('weak / placeholder secret throws on init', () => {
  process.env.JWT_SECRET = 'techno_kol_secret_2026_palantir'; // committed placeholder
  const helper = freshRequire();

  assert.throws(
    () => helper.assertSecretOnStartup(),
    /weak|placeholder/i,
    'assertSecretOnStartup should reject the committed placeholder'
  );
});

// --------------------------------------------------------------------------
// 4b. Too-short secret -> throws on init
// --------------------------------------------------------------------------
test('too-short secret throws on init', () => {
  process.env.JWT_SECRET = 'short';
  const helper = freshRequire();

  assert.throws(
    () => helper.assertSecretOnStartup(),
    /too short|minimum/i,
    'assertSecretOnStartup should reject a sub-32-char secret'
  );
});

// --------------------------------------------------------------------------
// 4c. Missing secret -> throws on init
// --------------------------------------------------------------------------
test('missing secret throws on init', () => {
  delete process.env.JWT_SECRET;
  const helper = freshRequire();

  assert.throws(
    () => helper.assertSecretOnStartup(),
    /missing/i,
    'assertSecretOnStartup should reject a missing JWT_SECRET'
  );
});

// --------------------------------------------------------------------------
// 5a. Missing payload -> validation error
// --------------------------------------------------------------------------
test('missing payload throws a validation error', () => {
  process.env.JWT_SECRET = STRONG_SECRET;
  const { signToken } = freshRequire();

  assert.throws(() => signToken(null), /payload must be a non-null object/);
  assert.throws(
    () => signToken(undefined),
    /payload must be a non-null object/
  );
  assert.throws(() => signToken([]), /payload must be a non-null object/);
  assert.throws(() => signToken('nope'), /payload must be a non-null object/);
});

// --------------------------------------------------------------------------
// 5b. Empty-object payload -> validation error
// --------------------------------------------------------------------------
test('empty-object payload throws a validation error', () => {
  process.env.JWT_SECRET = STRONG_SECRET;
  const { signToken } = freshRequire();

  assert.throws(() => signToken({}), /at least one claim/);
});

// --------------------------------------------------------------------------
// Runner
// --------------------------------------------------------------------------
(async function run() {
  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const t of tests) {
    try {
      const maybePromise = t.fn();
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
      }
      // eslint-disable-next-line no-console
      console.log(`  ok  ${t.name}`);
      pass += 1;
    } catch (err) {
      fail += 1;
      failures.push({ name: t.name, err });
      // eslint-disable-next-line no-console
      console.log(`  FAIL ${t.name}`);
      // eslint-disable-next-line no-console
      console.log(`       ${err && err.stack ? err.stack : err}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n${pass} passed, ${fail} failed (${tests.length} total)`);
  if (fail > 0) {
    process.exit(1);
  }
})();
