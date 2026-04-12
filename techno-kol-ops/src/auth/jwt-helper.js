/*
 * techno-kol-ops / src/auth/jwt-helper.js
 * ----------------------------------------
 * Centralized JWT sign / verify for TECHNO-KOL OPS.
 *
 * Delivered by Agent-25 as part of the AUTH_AUDIT hardening pass.
 *
 * DESIGN RULES
 *   - signToken(payload, { expiresIn }) -> string
 *   - verifyToken(token)                -> decoded payload (throws on failure)
 *   - JWT_SECRET must be >= 32 chars; module throws at first use if it is not
 *     (or if it is missing / matches the committed placeholder).
 *   - expiresIn defaults to process.env.JWT_EXPIRES_IN or '8h'.
 *
 * TODO / FALLBACK NOTE
 *   If jsonwebtoken is installed (it IS in techno-kol-ops/package.json as
 *   ^9.0.2) we use it. If it is NOT resolvable at runtime (missing
 *   node_modules, a stripped build, or a sibling service that hasn't installed
 *   it yet) this module transparently falls back to a pure-Node crypto HS256
 *   implementation so the helper stays usable across the Mega ERP.
 *
 *   WARNING: the fallback is intentionally minimal. It does HS256 only, honors
 *   `exp` (seconds since epoch), and rejects tampered signatures with
 *   timingSafeEqual. It does NOT support nbf/iat/aud/iss claim validation,
 *   key rotation, or algorithm negotiation. For production, ensure
 *   jsonwebtoken is installed and the fallback path is never hit.
 */

'use strict';

const crypto = require('crypto');

// --------------------------------------------------------------------------
// 1. Try to load jsonwebtoken. Fall back to crypto-based HS256 if missing.
// --------------------------------------------------------------------------
let jwtLib = null;
let usingFallback = false;
try {
  // eslint-disable-next-line global-require
  jwtLib = require('jsonwebtoken');
} catch (err) {
  usingFallback = true;
  // Warn once, loudly. Operators must see this in logs.
  // eslint-disable-next-line no-console
  console.warn(
    '[jwt-helper] WARNING: jsonwebtoken not installed — falling back to ' +
      'crypto-based HS256 implementation. This fallback is for dev only. ' +
      'Install jsonwebtoken for production.'
  );
}

// --------------------------------------------------------------------------
// 2. Secret validation. Run the first time the helper is asked to do work.
// --------------------------------------------------------------------------
const MIN_SECRET_LENGTH = 32;
const KNOWN_WEAK_SECRETS = new Set([
  'techno_kol_secret_2026_palantir', // the value shipped in .env.example
  'change_me',
  'secret',
  'changeme',
  'CHANGE_ME',
  'CHANGE_ME_MIN_32_CHARS',
]);

let secretValidated = false;
function getValidatedSecret() {
  const secret = process.env.JWT_SECRET;
  if (secretValidated) return secret;

  if (!secret || typeof secret !== 'string') {
    throw new Error(
      '[jwt-helper] JWT_SECRET is missing. Refusing to sign/verify tokens. ' +
        'Set JWT_SECRET in your environment (min 32 chars, high entropy).'
    );
  }
  // Known-weak check must run BEFORE the length check, because some
  // committed placeholders happen to be under 32 chars — we want those
  // reported as "placeholder / weak", not "too short".
  if (KNOWN_WEAK_SECRETS.has(secret)) {
    throw new Error(
      '[jwt-helper] JWT_SECRET matches a known weak / placeholder value. ' +
        'Rotate it immediately. Generate with: openssl rand -hex 32'
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[jwt-helper] JWT_SECRET is too short (${secret.length} chars). ` +
        `Minimum is ${MIN_SECRET_LENGTH} chars. Generate with: openssl rand -hex 32`
    );
  }

  secretValidated = true;
  return secret;
}

/**
 * Eagerly validate JWT_SECRET at startup.
 * Call this from src/index.ts bootstrap BEFORE `app.listen` so the service
 * refuses to come up with a bad secret.
 */
function assertSecretOnStartup() {
  // Force validation by clearing the memo and re-running.
  secretValidated = false;
  getValidatedSecret();
}

// --------------------------------------------------------------------------
// 3. Fallback HS256 implementation (used only if jsonwebtoken isn't loaded).
// --------------------------------------------------------------------------
function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function parseExpiresIn(expiresIn) {
  // Accept number (seconds) or strings like '15m', '8h', '7d', '30s'.
  if (typeof expiresIn === 'number') return Math.floor(expiresIn);
  if (typeof expiresIn !== 'string') {
    throw new Error('[jwt-helper] expiresIn must be a number or string');
  }
  const m = expiresIn.trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) {
    throw new Error(`[jwt-helper] invalid expiresIn format: ${expiresIn}`);
  }
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return n * mult;
}

function fallbackSign(payload, secret, expiresInSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(body));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${h}.${p}`)
    .digest();
  return `${h}.${p}.${b64urlEncode(sig)}`;
}

function fallbackVerify(token, secret) {
  if (typeof token !== 'string') {
    const e = new Error('jwt must be a string');
    e.name = 'JsonWebTokenError';
    throw e;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    const e = new Error('jwt malformed');
    e.name = 'JsonWebTokenError';
    throw e;
  }
  const [h, p, s] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${h}.${p}`)
    .digest();
  const actual = b64urlDecode(s);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    const e = new Error('invalid signature');
    e.name = 'JsonWebTokenError';
    throw e;
  }
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(p).toString('utf8'));
  } catch {
    const e = new Error('jwt payload is not valid JSON');
    e.name = 'JsonWebTokenError';
    throw e;
  }
  if (payload && typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) {
      const e = new Error('jwt expired');
      e.name = 'TokenExpiredError';
      e.expiredAt = new Date(payload.exp * 1000);
      throw e;
    }
  }
  return payload;
}

// --------------------------------------------------------------------------
// 4. Public API
// --------------------------------------------------------------------------

/**
 * Sign a JWT for the given payload.
 *
 * @param {object} payload - The claims to embed. MUST be a non-null object
 *                           and MUST have at least one own property.
 * @param {object} [opts]
 * @param {string|number} [opts.expiresIn] - Lifetime (default:
 *                           process.env.JWT_EXPIRES_IN || '8h').
 * @returns {string} signed JWT
 */
function signToken(payload, opts = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('[jwt-helper] payload must be a non-null object');
  }
  if (Object.keys(payload).length === 0) {
    throw new TypeError('[jwt-helper] payload must have at least one claim');
  }
  const secret = getValidatedSecret();
  const expiresIn = opts.expiresIn || process.env.JWT_EXPIRES_IN || '8h';

  if (usingFallback) {
    const sec = parseExpiresIn(expiresIn);
    return fallbackSign(payload, secret, sec);
  }
  return jwtLib.sign(payload, secret, { expiresIn, algorithm: 'HS256' });
}

/**
 * Verify a JWT and return its decoded payload.
 *
 * @param {string} token
 * @returns {object} decoded payload
 * @throws if the token is missing, malformed, tampered, or expired
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new TypeError('[jwt-helper] token must be a non-empty string');
  }
  const secret = getValidatedSecret();
  if (usingFallback) {
    return fallbackVerify(token, secret);
  }
  return jwtLib.verify(token, secret, { algorithms: ['HS256'] });
}

module.exports = {
  signToken,
  verifyToken,
  assertSecretOnStartup,
  // exported for tests only:
  _internal: {
    MIN_SECRET_LENGTH,
    KNOWN_WEAK_SECRETS,
    parseExpiresIn,
    resetSecretValidationForTests() {
      secretValidated = false;
    },
    isUsingFallback() {
      return usingFallback;
    },
  },
};
