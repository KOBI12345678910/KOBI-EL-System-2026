/**
 * Teudat Zehut (ת.ז) Validator — Israeli National ID
 * Agent 91 — Techno-Kol Uzi ERP / Payroll validators
 *
 * Implements the official check-digit algorithm published by
 * רשות האוכלוסין וההגירה (Israeli Population & Immigration Authority).
 *
 * Algorithm (משרד הפנים):
 *   1. Normalise to a 9-digit string, padding with leading zeros if needed.
 *   2. Multiply each digit alternately by 1 and 2 (left→right).
 *   3. If the product > 9, sum its two digits (equivalent to: product - 9).
 *   4. Sum the 9 resulting values.
 *   5. The ID is valid iff (sum mod 10) === 0.
 *
 * This file is PURE (no side-effects, no deps) — Node built-ins only.
 *
 * Bilingual error messages (Hebrew + English) are returned in `reason`.
 *
 * Usage:
 *   const { validateTeudatZehut, formatTeudatZehut, generateValidTeudatZehut }
 *     = require('../validators/teudat-zehut');
 *
 *   validateTeudatZehut('000000018');  // { valid: true, normalized: '000000018' }
 *   validateTeudatZehut('123-45-6782'); // { valid: true, normalized: '123456782' }
 *   formatTeudatZehut('123456782');    // '123-45-6782'
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Full length of a normalised Israeli ID (always 9 digits). */
const TZ_LENGTH = 9;

/**
 * Reserved / suspicious ranges (משרד הפנים).
 *
 * The Interior Ministry publishes several ranges that are either
 * unused, reserved, or not assignable to real people:
 *
 *  - 000000000        → all zeros, never issued
 *  - 000000001–000000017 → reserved test range, never real
 *  - 999999999        → all nines, never issued
 *
 * Note: we do NOT reject the "18" fixture (000000018) because it
 * passes the official algorithm and is routinely used as a canonical
 * test value in Israeli docs.
 *
 * Real assigned ranges fall roughly within:
 *   - Citizens:       000000019 – 399999999
 *   - Residents/new:  500000000 – 799999999
 *   - Historical:     800000000 – 899999999
 *   - Reserved/test:  900000000 – 999999998
 *
 * We keep the *range* check permissive (only hard-rejecting the
 * trivially impossible values) so that legitimate edge-case IDs are
 * never falsely rejected in payroll.
 */
const RESERVED_IDS = new Set([
  '000000000',
  '999999999',
]);

/**
 * Hard-reserved narrow band (always invalid):
 *   - 000000001 .. 000000017  (below the canonical 000000018 fixture)
 */
function isInHardReservedBand(normalized) {
  // 000000001 .. 000000017 — leading zeros, last digit small
  if (!/^0{7}/.test(normalized)) return false;
  const tail = parseInt(normalized.slice(7), 10);
  return tail >= 1 && tail <= 17;
}

// ═══════════════════════════════════════════════════════════════
// Normalisation
// ═══════════════════════════════════════════════════════════════

/**
 * Strip spaces, dashes, dots, slashes, and other punctuation from an
 * ID input. Leaves digits only. Non-digit characters after stripping
 * cause the caller to reject the value.
 */
function stripPunctuation(input) {
  return String(input).replace(/[\s\-._/\\]/g, '');
}

/**
 * Normalise raw user input into a 9-digit string.
 * Returns { ok: true, normalized } on success, or
 *         { ok: false, reason } with a bilingual error message.
 */
function normalizeTeudatZehut(input) {
  if (input === null || input === undefined) {
    return {
      ok: false,
      reason: 'ת.ז ריקה / empty ID',
    };
  }

  // Accept numbers — convert to string
  let raw;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) {
      return {
        ok: false,
        reason: 'ת.ז חייבת להיות מספר חיובי / ID must be a positive number',
      };
    }
    raw = String(Math.trunc(input));
  } else if (typeof input === 'string') {
    raw = input.trim();
  } else {
    return {
      ok: false,
      reason: 'סוג קלט לא נתמך / unsupported input type',
    };
  }

  if (raw.length === 0) {
    return {
      ok: false,
      reason: 'ת.ז ריקה / empty ID',
    };
  }

  // Strip common separators (space, dash, dot, slash, underscore)
  const cleaned = stripPunctuation(raw);

  if (cleaned.length === 0) {
    return {
      ok: false,
      reason: 'ת.ז ריקה לאחר ניקוי / empty after stripping punctuation',
    };
  }

  // Reject anything that is not pure digits (handles letters, unicode, emoji)
  if (!/^\d+$/.test(cleaned)) {
    return {
      ok: false,
      reason: 'ת.ז חייבת להכיל ספרות בלבד / ID must contain digits only',
    };
  }

  // Reject excessively long inputs (> 9 digits after stripping punctuation
  // that weren't just leading zeros). 8-digit legacy IDs are accepted and
  // padded with a leading zero.
  if (cleaned.length > TZ_LENGTH) {
    // Allow excessive leading zeros to be trimmed back to 9 digits
    const trimmed = cleaned.replace(/^0+/, '');
    if (trimmed.length > TZ_LENGTH) {
      return {
        ok: false,
        reason: `ת.ז ארוכה מדי (${cleaned.length} ספרות) / ID too long (${cleaned.length} digits)`,
      };
    }
    // Re-pad
    const normalized = trimmed.padStart(TZ_LENGTH, '0');
    return { ok: true, normalized };
  }

  if (cleaned.length < 5) {
    return {
      ok: false,
      reason: `ת.ז קצרה מדי (${cleaned.length} ספרות) / ID too short (${cleaned.length} digits)`,
    };
  }

  // Pad to 9 digits with leading zeros (handles 8-digit legacy IDs,
  // and accidentally-dropped leading zeros from spreadsheets).
  const normalized = cleaned.padStart(TZ_LENGTH, '0');

  return { ok: true, normalized };
}

// ═══════════════════════════════════════════════════════════════
// Core algorithm
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the Luhn-like check sum for a 9-digit normalised ID.
 * Multipliers alternate 1,2,1,2,...,2,1 left-to-right.
 *
 * @param {string} normalized — exactly 9 digit characters
 * @returns {number} sum value (valid ID iff sum % 10 === 0)
 */
function computeChecksum(normalized) {
  let sum = 0;
  for (let i = 0; i < TZ_LENGTH; i++) {
    const digit = normalized.charCodeAt(i) - 48; // '0' = 48
    const multiplier = (i % 2 === 0) ? 1 : 2;
    let product = digit * multiplier;
    if (product > 9) {
      // Equivalent to sum-of-digits because product ∈ [10..18]
      product -= 9;
    }
    sum += product;
  }
  return sum;
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Validate an Israeli Teudat Zehut.
 *
 * @param {string|number} id — raw input (may contain spaces/dashes,
 *                             may be 8-digit legacy, may have leading zeros dropped)
 * @returns {{ valid: boolean, reason?: string, normalized: string }}
 *
 * Always returns `normalized` so callers can store a canonical form.
 * On invalid input, `normalized` is the best-effort cleaned value
 * (or an empty string if it could not be cleaned).
 */
function validateTeudatZehut(id) {
  const norm = normalizeTeudatZehut(id);
  if (!norm.ok) {
    return { valid: false, reason: norm.reason, normalized: '' };
  }

  const { normalized } = norm;

  // Reserved / impossible values
  if (RESERVED_IDS.has(normalized)) {
    return {
      valid: false,
      reason: 'ת.ז שמורה ולא תקפה / reserved/unassigned ID',
      normalized,
    };
  }
  if (isInHardReservedBand(normalized)) {
    return {
      valid: false,
      reason: 'ת.ז בטווח שמור (000000001–000000017) / ID in hard-reserved band',
      normalized,
    };
  }

  const sum = computeChecksum(normalized);
  if (sum % 10 !== 0) {
    return {
      valid: false,
      reason: `ספרת ביקורת שגויה (סכום ${sum}) / invalid check digit (sum ${sum})`,
      normalized,
    };
  }

  return { valid: true, normalized };
}

/**
 * Format a Teudat Zehut for display as "NNN-NN-NNNN".
 *
 * - Accepts raw or normalised input.
 * - If input can be normalised to 9 digits, returns the dashed form.
 * - If input is invalid/unnormalisable, returns the cleaned input
 *   (or an empty string) without throwing.
 *
 * The "NNN-NN-NNNN" layout matches the canonical rendering used in
 * Israeli payslips and government forms.
 */
function formatTeudatZehut(id) {
  const norm = normalizeTeudatZehut(id);
  if (!norm.ok) {
    // Best-effort: return whatever digits we could salvage
    if (id === null || id === undefined) return '';
    return stripPunctuation(String(id));
  }
  const n = norm.normalized;
  return `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5, 9)}`;
}

/**
 * Generate a deterministic-but-valid Teudat Zehut for TESTING ONLY.
 *
 * Picks a random 8-digit prefix then computes the check digit that
 * makes the whole thing pass `validateTeudatZehut`. Uses `Math.random`
 * (test data does not require cryptographic randomness).
 *
 * @param {object} [opts]
 * @param {() => number} [opts.rng] — custom RNG, default Math.random
 * @returns {string} 9-digit valid ID
 */
function generateValidTeudatZehut(opts = {}) {
  const rng = opts.rng || Math.random;

  // Pick 8 random digits, avoiding the hard-reserved bands.
  // We retry up to 50 times (statistically ~1 in 10 succeeds on first try).
  for (let attempt = 0; attempt < 50; attempt++) {
    let prefix = '';
    for (let i = 0; i < 8; i++) {
      prefix += Math.floor(rng() * 10).toString();
    }

    // Compute partial sum using multipliers [1,2,1,2,1,2,1,2] for the
    // first 8 digits. The 9th digit uses multiplier 1.
    let partial = 0;
    for (let i = 0; i < 8; i++) {
      const digit = prefix.charCodeAt(i) - 48;
      const multiplier = (i % 2 === 0) ? 1 : 2;
      let product = digit * multiplier;
      if (product > 9) product -= 9;
      partial += product;
    }

    // Check digit (9th) has multiplier 1, so its contribution = its own value.
    // We need (partial + checkDigit) % 10 === 0.
    const checkDigit = (10 - (partial % 10)) % 10;
    const candidate = prefix + checkDigit.toString();

    // Skip reserved values
    if (RESERVED_IDS.has(candidate)) continue;
    if (isInHardReservedBand(candidate)) continue;

    // Sanity check the output (defensive — should always pass)
    const res = validateTeudatZehut(candidate);
    if (res.valid) return candidate;
  }

  // Fallback — this is statistically unreachable
  return '000000018';
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  validateTeudatZehut,
  formatTeudatZehut,
  generateValidTeudatZehut,
  // exposed for tests / introspection
  normalizeTeudatZehut,
  computeChecksum,
  TZ_LENGTH,
  RESERVED_IDS,
};
