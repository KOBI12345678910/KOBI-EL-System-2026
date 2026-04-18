/*
 * techno-kol-ops / src/auth/password-helper.js
 * ---------------------------------------------
 * Centralized password hashing / verification for TECHNO-KOL OPS.
 *
 * Delivered by Agent-25 as part of the AUTH_AUDIT hardening pass.
 *
 * DESIGN RULES
 *   - hashPassword(plain)          -> Promise<string>  (bcrypt cost 12)
 *   - verifyPassword(plain, hash)  -> Promise<boolean> (constant-time)
 *   - constantTimeEqual(a, b)      -> boolean          (exported util)
 *
 * TODO / FALLBACK NOTE
 *   The project declares bcryptjs@2.4.3 in package.json, so normally we use
 *   it. If bcryptjs (or the native `bcrypt`) is NOT resolvable at runtime
 *   (missing node_modules, stripped build, sibling Mega-ERP service that
 *   didn't install it yet) this module falls back to Node's built-in
 *   crypto.scrypt with cost parameters chosen to match bcrypt-12 strength.
 *
 *   The fallback format is `scrypt$N=16384,r=8,p=1$<saltB64>$<hashB64>` so it
 *   cannot be confused with a bcrypt hash (`$2a$...`) and can be
 *   re-hashed transparently when real bcrypt becomes available.
 *
 *   WARNING: if you see `scrypt$` hashes in production, install bcryptjs and
 *   re-hash on next successful login.
 */

'use strict';

const crypto = require('crypto');

const BCRYPT_COST = 12;

// --------------------------------------------------------------------------
// 1. Try to load a bcrypt implementation. Prefer native, fall back to bcryptjs.
// --------------------------------------------------------------------------
let bcryptLib = null;
let usingFallback = false;
try {
  // eslint-disable-next-line global-require
  bcryptLib = require('bcrypt');
} catch (_) {
  try {
    // eslint-disable-next-line global-require
    bcryptLib = require('bcryptjs');
  } catch (_e) {
    usingFallback = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[password-helper] WARNING: neither bcrypt nor bcryptjs is installed — ' +
        'falling back to crypto.scrypt. This fallback is for dev only. ' +
        'Install bcryptjs and re-hash passwords in production.'
    );
  }
}

// --------------------------------------------------------------------------
// 2. Scrypt fallback
// --------------------------------------------------------------------------
const SCRYPT_N = 16384; // 2^14
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALTLEN = 16;
const SCRYPT_PREFIX = 'scrypt$';

function scryptHash(plain) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SCRYPT_SALTLEN);
    crypto.scrypt(
      plain,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derived) => {
        if (err) return reject(err);
        const saltB64 = salt.toString('base64');
        const hashB64 = derived.toString('base64');
        resolve(
          `${SCRYPT_PREFIX}N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${saltB64}$${hashB64}`
        );
      }
    );
  });
}

function scryptVerify(plain, stored) {
  return new Promise((resolve) => {
    if (typeof stored !== 'string' || !stored.startsWith(SCRYPT_PREFIX)) {
      return resolve(false);
    }
    const parts = stored.split('$');
    // scrypt$N=..,r=..,p=..$salt$hash  => ['scrypt','N=..,r=..,p=..','salt','hash']
    if (parts.length !== 4) return resolve(false);
    const [, params, saltB64, hashB64] = parts;
    const paramMap = Object.fromEntries(
      params.split(',').map((kv) => kv.split('='))
    );
    const N = parseInt(paramMap.N, 10);
    const r = parseInt(paramMap.r, 10);
    const p = parseInt(paramMap.p, 10);
    if (!N || !r || !p) return resolve(false);

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    crypto.scrypt(plain, salt, expected.length, { N, r, p }, (err, derived) => {
      if (err) return resolve(false);
      resolve(constantTimeEqual(expected, derived));
    });
  });
}

// --------------------------------------------------------------------------
// 3. Constant-time compare — exported for callers who need to compare
//    reset tokens, API keys, HMAC signatures, etc.
// --------------------------------------------------------------------------
function constantTimeEqual(a, b) {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(String(a), 'utf8');
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    // Still do a dummy compare so we don't leak timing on the length check.
    const pad = Buffer.alloc(bufA.length);
    crypto.timingSafeEqual(bufA, pad);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// --------------------------------------------------------------------------
// 4. Public API
// --------------------------------------------------------------------------

/**
 * Hash a plain-text password using bcrypt cost 12.
 *
 * @param {string} plain
 * @returns {Promise<string>} hash (bcrypt `$2b$12$...` or scrypt fallback)
 */
async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new TypeError('[password-helper] password must be a non-empty string');
  }
  if (usingFallback) {
    return scryptHash(plain);
  }
  return bcryptLib.hash(plain, BCRYPT_COST);
}

/**
 * Verify a plain-text password against a stored hash.
 *
 * Transparently handles:
 *   - bcrypt hashes ($2a / $2b / $2y)
 *   - scrypt fallback hashes (scrypt$...)
 *
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || typeof hash !== 'string') {
    return false;
  }
  // Route scrypt fallback hashes regardless of whether bcrypt is loaded,
  // so we can migrate smoothly when bcrypt is added back.
  if (hash.startsWith(SCRYPT_PREFIX)) {
    return scryptVerify(plain, hash);
  }
  if (usingFallback) {
    // bcrypt hash but no bcrypt lib — we cannot verify it.
    // eslint-disable-next-line no-console
    console.warn(
      '[password-helper] stored hash is bcrypt but bcryptjs is not installed — cannot verify'
    );
    return false;
  }
  try {
    return await bcryptLib.compare(plain, hash);
  } catch (_err) {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  constantTimeEqual,
  BCRYPT_COST,
  _internal: {
    isUsingFallback() {
      return usingFallback;
    },
    SCRYPT_PREFIX,
  },
};
