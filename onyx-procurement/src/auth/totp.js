/**
 * TOTP — Time-based One-Time Password (RFC 6238) / אימות דו-שלבי
 * Agent 96 — 2026-04-11
 *
 * Zero-dependency implementation of RFC 6238 Time-based One-Time
 * Passwords, built on RFC 4226 HOTP. Compatible with:
 *   • Google Authenticator
 *   • Microsoft Authenticator
 *   • Authy
 *   • 1Password / Bitwarden / any RFC-6238 client
 *
 * Design principles:
 *   1. ZERO external deps — only node:crypto (built-in).
 *   2. Constant-time comparison for every secret / code check.
 *   3. Base32 (RFC 4648) encode/decode without padding (GA-compatible).
 *   4. Backup codes hashed with scrypt — not reversible, constant-time
 *      verification via crypto.timingSafeEqual.
 *   5. Every public function is documented in English + Hebrew.
 *
 * Public API:
 *   generateSecret(length?)         → base32 string
 *   generateToken(secret, ts?, step?, digits?) → "NNNNNN"
 *   verifyToken(secret, token, window?) → boolean
 *   getProvisioningUri(secret, label, issuer) → otpauth:// URI
 *   generateBackupCodes(count?)     → string[]
 *   hashBackupCode(code)            → "scrypt$N$r$p$salt$hash"
 *   verifyBackupCode(code, hash)    → boolean
 *
 * Run self-tests:   node --test test/payroll/totp.test.js
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════

/** Default TOTP step in seconds (RFC 6238 §4 recommends 30s). */
const DEFAULT_STEP = 30;

/** Default code length (Google Authenticator uses 6). */
const DEFAULT_DIGITS = 6;

/** Default clock-skew tolerance, in steps (±1 step = ±30s). */
const DEFAULT_WINDOW = 1;

/** Default secret length in bytes (RFC 4226 §4 recommends ≥160 bits). */
const DEFAULT_SECRET_BYTES = 20;

/** RFC 4648 §6 Base32 alphabet (no padding for GA compatibility). */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** scrypt params for backup-code hashing (bcrypt-like cost). */
const SCRYPT_N = 16384;   // CPU/memory cost (2^14)
const SCRYPT_R = 8;       // block size
const SCRYPT_P = 1;       // parallelization
const SCRYPT_KEYLEN = 32; // 256-bit key
const SCRYPT_SALTLEN = 16;

// ═══════════════════════════════════════════════════════════════════════
//  Base32 helpers (RFC 4648 §6) / קידוד Base32
// ═══════════════════════════════════════════════════════════════════════

/**
 * Encode a Buffer as a Base32 string (no padding).
 * קידוד Buffer למחרוזת Base32 ללא padding.
 *
 * @param {Buffer} buf  raw bytes
 * @returns {string}    uppercase Base32, no '=' padding
 */
function base32Encode(buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('base32Encode: expected Buffer');
  }
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

/**
 * Decode a Base32 string to a Buffer.
 * פענוח מחרוזת Base32 ל-Buffer.
 *
 * Accepts lowercase/uppercase and ignores spaces and '=' padding.
 * The commonly confused "0/O" and "1/I/L" are translated per GA convention.
 *
 * @param {string} str  Base32 input
 * @returns {Buffer}    raw bytes
 */
function base32Decode(str) {
  if (typeof str !== 'string') {
    throw new TypeError('base32Decode: expected string');
  }
  // Normalize: uppercase, strip padding, whitespace, and hyphens.
  // (We deliberately do NOT attempt lookalike-character repair — it
  // would silently corrupt legitimate secrets that already use the
  // canonical alphabet.)
  const cleaned = str
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/=+$/, '');

  if (cleaned.length === 0) {
    return Buffer.alloc(0);
  }

  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error(`base32Decode: invalid character '${ch}'`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ═══════════════════════════════════════════════════════════════════════
//  Secret generation / ייצור מפתח סודי
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a cryptographically-secure random secret and return it
 * Base32-encoded, ready to paste into an authenticator app.
 * ייצור מפתח סודי אקראי מקודד Base32.
 *
 * @param {number} [length=20]  raw secret length in bytes (≥16 recommended)
 * @returns {string}            Base32-encoded secret
 */
function generateSecret(length = DEFAULT_SECRET_BYTES) {
  if (!Number.isInteger(length) || length < 10 || length > 128) {
    throw new RangeError('generateSecret: length must be 10..128 bytes');
  }
  return base32Encode(crypto.randomBytes(length));
}

// ═══════════════════════════════════════════════════════════════════════
//  HOTP core (RFC 4226 §5.3) / ליבת HOTP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert a 64-bit unsigned integer counter to an 8-byte big-endian Buffer.
 * Uses two 32-bit halves because Number loses precision above 2^53.
 *
 * @param {number} counter  non-negative integer
 * @returns {Buffer}        8 bytes, big-endian
 */
function counterToBuffer(counter) {
  if (!Number.isInteger(counter) || counter < 0) {
    throw new RangeError('counterToBuffer: counter must be a non-negative integer');
  }
  const buf = Buffer.alloc(8);
  // High 32 bits
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0; // force unsigned 32-bit
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);
  return buf;
}

/**
 * Compute the HOTP value for a given secret and counter.
 * Implements RFC 4226 §5.3 "Dynamic Truncation".
 *
 * @param {Buffer} rawSecret  decoded secret bytes
 * @param {number} counter    64-bit counter
 * @param {number} digits     code length (6..10)
 * @returns {string}          zero-padded decimal string
 */
function hotp(rawSecret, counter, digits) {
  const hmac = crypto.createHmac('sha1', rawSecret);
  hmac.update(counterToBuffer(counter));
  const digest = hmac.digest(); // 20 bytes

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = digest[19] & 0x0f;
  const binCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const modulus = Math.pow(10, digits);
  const code = binCode % modulus;
  return String(code).padStart(digits, '0');
}

// ═══════════════════════════════════════════════════════════════════════
//  TOTP — time-based wrapper (RFC 6238 §4) / TOTP לפי זמן
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a TOTP token for the given secret.
 * ייצור קוד TOTP עבור מפתח סודי נתון.
 *
 * @param {string|Buffer} secret    Base32 string OR raw Buffer
 * @param {number} [timestamp=Date.now()]  Unix time in ms
 * @param {number} [step=30]        time step in seconds
 * @param {number} [digits=6]       code length
 * @returns {string}                zero-padded decimal token
 */
function generateToken(
  secret,
  timestamp = Date.now(),
  step = DEFAULT_STEP,
  digits = DEFAULT_DIGITS
) {
  if (typeof step !== 'number' || step <= 0) {
    throw new RangeError('generateToken: step must be a positive number');
  }
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) {
    throw new RangeError('generateToken: digits must be 6..10');
  }
  const rawSecret = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  if (rawSecret.length === 0) {
    throw new Error('generateToken: empty secret');
  }
  const counter = Math.floor(timestamp / 1000 / step);
  return hotp(rawSecret, counter, digits);
}

/**
 * Verify a user-submitted TOTP token with a ±window clock-skew tolerance.
 * אימות קוד TOTP עם סבילות להסטת שעון של ±window צעדים.
 *
 * Constant-time comparison is used for every candidate to avoid
 * leaking timing information.
 *
 * @param {string|Buffer} secret  Base32 secret OR raw Buffer
 * @param {string} token          code entered by the user
 * @param {number} [window=1]     number of steps of tolerance each side
 * @param {number} [timestamp]    override current time (ms)
 * @param {number} [step=30]      seconds per step
 * @param {number} [digits=6]     code length
 * @returns {boolean}             true if any step in the window matches
 */
function verifyToken(
  secret,
  token,
  window = DEFAULT_WINDOW,
  timestamp = Date.now(),
  step = DEFAULT_STEP,
  digits = DEFAULT_DIGITS
) {
  if (typeof token !== 'string') return false;
  if (!/^\d+$/.test(token)) return false;
  if (token.length !== digits) return false;
  if (!Number.isInteger(window) || window < 0 || window > 10) {
    throw new RangeError('verifyToken: window must be 0..10');
  }
  const rawSecret = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  if (rawSecret.length === 0) return false;

  const centerCounter = Math.floor(timestamp / 1000 / step);
  let matched = false;

  // Walk the full window even after a hit, to keep timing uniform.
  for (let offset = -window; offset <= window; offset++) {
    const counter = centerCounter + offset;
    if (counter < 0) continue;
    const candidate = hotp(rawSecret, counter, digits);
    // Constant-time compare
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(token, 'utf8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      matched = true;
    }
  }
  return matched;
}

// ═══════════════════════════════════════════════════════════════════════
//  Provisioning URI / ייצור URI עבור קוד QR
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build an otpauth:// URI that an authenticator app can scan.
 * ייצור URI של otpauth עבור סריקה באפליקציית מאמת.
 *
 * Format (Google Authenticator key-uri-format):
 *   otpauth://totp/Issuer:user@x?secret=BASE32&issuer=Issuer&algorithm=SHA1&digits=6&period=30
 *
 * @param {string|Buffer} secret  Base32 or raw secret
 * @param {string} label          account label, e.g. "user@techno-kol.co.il"
 * @param {string} issuer         issuer name, e.g. "Techno-Kol ERP"
 * @param {object} [opts]         optional {digits, period, algorithm}
 * @returns {string}              otpauth:// URI
 */
function getProvisioningUri(secret, label, issuer, opts = {}) {
  if (typeof label !== 'string' || label.length === 0) {
    throw new TypeError('getProvisioningUri: label must be a non-empty string');
  }
  if (typeof issuer !== 'string' || issuer.length === 0) {
    throw new TypeError('getProvisioningUri: issuer must be a non-empty string');
  }
  const base32Secret = Buffer.isBuffer(secret) ? base32Encode(secret) : secret;
  if (typeof base32Secret !== 'string' || base32Secret.length === 0) {
    throw new TypeError('getProvisioningUri: invalid secret');
  }

  const digits = opts.digits || DEFAULT_DIGITS;
  const period = opts.period || DEFAULT_STEP;
  const algorithm = (opts.algorithm || 'SHA1').toUpperCase();

  // Per GA URI spec: label is "Issuer:Account" percent-encoded.
  const labelPath = `${issuer}:${label}`;
  const encodedLabel = encodeURIComponent(labelPath)
    // GA clients accept unencoded ':' inside the path segment, but
    // encodeURIComponent encodes it to %3A — normalize back.
    .replace(/%3A/g, ':');

  const params = new URLSearchParams();
  params.set('secret', base32Secret);
  params.set('issuer', issuer);
  params.set('algorithm', algorithm);
  params.set('digits', String(digits));
  params.set('period', String(period));

  return `otpauth://totp/${encodedLabel}?${params.toString()}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  Backup / recovery codes / קודי גיבוי חד-פעמיים
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate human-friendly one-time recovery codes.
 * ייצור קודי שחזור חד-פעמיים בפורמט ידידותי.
 *
 * Each code is 10 characters from an unambiguous alphabet, formatted
 * "XXXXX-XXXXX" for readability. Entropy per code ≈ 50 bits.
 *
 * @param {number} [count=10]  number of codes
 * @returns {string[]}         array of codes
 */
function generateBackupCodes(count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new RangeError('generateBackupCodes: count must be 1..50');
  }
  // Crockford-ish alphabet — no 0/O/1/I/L to prevent transcription errors.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const codes = new Set();
  while (codes.size < count) {
    const bytes = crypto.randomBytes(10);
    let raw = '';
    for (let i = 0; i < 10; i++) {
      raw += alphabet[bytes[i] % alphabet.length];
    }
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return Array.from(codes);
}

/**
 * Hash a backup code using scrypt (PBKDF-style, memory-hard).
 * גיבוב קוד גיבוי באמצעות scrypt.
 *
 * Output format: "scrypt$N$r$p$base64salt$base64hash"
 * — self-describing so verifyBackupCode can parse it back without
 * needing a config lookup.
 *
 * @param {string} code  plaintext backup code
 * @returns {string}     encoded scrypt hash
 */
function hashBackupCode(code) {
  if (typeof code !== 'string' || code.length === 0) {
    throw new TypeError('hashBackupCode: code must be a non-empty string');
  }
  // Normalize — strip whitespace, uppercase, drop hyphens to be
  // resilient to how the user typed the code.
  const normalized = code.replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
  const salt = crypto.randomBytes(SCRYPT_SALTLEN);
  const hash = crypto.scryptSync(normalized, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // scrypt requires maxmem ≥ 128 * N * r; bump it explicitly.
    maxmem: 128 * SCRYPT_N * SCRYPT_R * 2,
  });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/**
 * Verify a backup code against a stored scrypt hash in constant time.
 * אימות קוד גיבוי מול גיבוב scrypt בזמן קבוע.
 *
 * @param {string} code  plaintext backup code entered by the user
 * @param {string} hash  output of hashBackupCode()
 * @returns {boolean}    true if the code matches
 */
function verifyBackupCode(code, hash) {
  if (typeof code !== 'string' || typeof hash !== 'string') return false;
  const parts = hash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch (_err) {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const normalized = code.replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
  let actual;
  try {
    actual = crypto.scryptSync(normalized, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch (_err) {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// ═══════════════════════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // primary API
  generateSecret,
  generateToken,
  verifyToken,
  getProvisioningUri,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,

  // exposed helpers (for tests + advanced callers)
  base32Encode,
  base32Decode,
  hotp,
  counterToBuffer,

  // constants
  DEFAULT_STEP,
  DEFAULT_DIGITS,
  DEFAULT_WINDOW,
};
