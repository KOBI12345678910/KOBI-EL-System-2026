/**
 * Israeli Tax File Validator — תיק ניכויים / תיק מע"מ / תיק מס הכנסה
 * ─────────────────────────────────────────────────────────────────
 * Agent 95 — 2026-04-11
 * Techno-Kol Uzi mega-ERP / onyx-procurement
 *
 * This module validates Israeli tax registry file numbers:
 *
 *   - תיק ניכויים (Withholding file)      — 9 digits, separate registry from ח.פ,
 *                                            issued by פקיד שומה for employers
 *   - תיק מע"מ    (VAT file)               — 9 digits, issued by מע"מ (ת.ז based
 *                                            for עוסק יחיד, company-linked for ח.פ)
 *   - תיק מס הכנסה (Income-tax file)      — 9 digits, issued by פקיד שומה
 *   - עוסק מורשה  (Authorized dealer)      — 9 digits (identical to VAT file for
 *                                            most tax-authority purposes)
 *
 * Design rules (Agent 95):
 *   - NEVER delete anything. This module is read-only / pure.
 *   - Hebrew bilingual: every user-facing reason code is emitted in both
 *     Hebrew and English (`reason_he` / `reason_en`) plus a machine code.
 *   - Israeli compliance: the check-digit algorithm mirrors the canonical
 *     Teudat-Zehut (ת.ז.) Luhn-style check used by רשות המסים for all 9-digit
 *     registry numbers. This is the same algorithm the Tax Authority's own
 *     Shaam validators use, and is what is accepted in Form 102 / Form 126 /
 *     PCN-836 / Shaam-Uniform exports that this repo generates.
 *   - ZERO dependencies. Pure vanilla JavaScript, runs under Node ≥ 18.
 *   - Stub hook for future רשות המסים online status API integration
 *     (`checkActiveStatus`) — currently returns `{status:"unknown"}` so that
 *     downstream code never crashes while the online registry is unavailable.
 *
 * Public exports:
 *   - validateTaxFile(id, type)           — generic validator with typed result
 *   - validateWithholdingFile(id)         — shortcut for תיק ניכויים
 *   - validateVatFile(id)                 — shortcut for תיק מע"מ
 *   - validateIncomeTaxFile(id)           — shortcut for תיק מס הכנסה
 *   - validateOsekMorsheFile(id)          — shortcut for עוסק מורשה
 *   - crossReference(entityId, taxFile)   — sanity check: same base number
 *   - checkActiveStatus(id, type, opts)   — async stub for future API hook
 *   - TAX_FILE_TYPES                      — frozen enum of supported types
 *   - normalize(id)                       — strip dashes/spaces, pad to 9
 *   - luhnIsraeliCheck(id)                — low-level check-digit test
 *   - formatDisplay(id, type)             — canonical display form (xxx-xxx-xxx)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

/**
 * Enumeration of supported Israeli tax file types.
 *
 * Every value here corresponds to a real registry at רשות המסים בישראל.
 * The string value is the `type` you pass into validateTaxFile().
 */
const TAX_FILE_TYPES = Object.freeze({
  WITHHOLDING: 'withholding',   // תיק ניכויים
  VAT:         'vat',           // תיק מע"מ
  INCOME_TAX:  'income_tax',    // תיק מס הכנסה
  OSEK_MORSHE: 'osek_morshe',   // עוסק מורשה (ת.ז. based for individuals)
});

/**
 * Bilingual labels for each type. Used in display strings and error reasons.
 */
const TYPE_LABELS = Object.freeze({
  [TAX_FILE_TYPES.WITHHOLDING]: { he: 'תיק ניכויים',    en: 'Withholding file'  },
  [TAX_FILE_TYPES.VAT]:         { he: 'תיק מע"מ',       en: 'VAT file'          },
  [TAX_FILE_TYPES.INCOME_TAX]:  { he: 'תיק מס הכנסה',   en: 'Income-tax file'   },
  [TAX_FILE_TYPES.OSEK_MORSHE]: { he: 'עוסק מורשה',     en: 'Authorized dealer' },
});

/**
 * Machine reason codes used in validation results. Downstream code that
 * wants to branch on a specific failure should `switch` on these.
 */
const REASON_CODES = Object.freeze({
  EMPTY:            'empty',
  NOT_STRING:       'not_string',
  NON_NUMERIC:      'non_numeric',
  WRONG_LENGTH:     'wrong_length',
  ALL_ZEROS:        'all_zeros',
  CHECK_DIGIT:      'check_digit',
  UNKNOWN_TYPE:     'unknown_type',
  RESERVED_PREFIX:  'reserved_prefix',
});

/**
 * Bilingual messages for every reason code. The validator always
 * returns both Hebrew and English so a UI layer can pick whichever
 * language is appropriate without re-translating.
 */
const REASON_MESSAGES = Object.freeze({
  [REASON_CODES.EMPTY]: {
    he: 'מספר תיק ריק או חסר',
    en: 'Tax file number is empty or missing',
  },
  [REASON_CODES.NOT_STRING]: {
    he: 'הקלט חייב להיות מחרוזת או מספר',
    en: 'Input must be a string or a number',
  },
  [REASON_CODES.NON_NUMERIC]: {
    he: 'מספר תיק חייב להכיל ספרות בלבד',
    en: 'Tax file must contain digits only',
  },
  [REASON_CODES.WRONG_LENGTH]: {
    he: 'אורך מספר התיק חייב להיות 9 ספרות',
    en: 'Tax file must be exactly 9 digits',
  },
  [REASON_CODES.ALL_ZEROS]: {
    he: 'מספר תיק 000000000 אינו חוקי',
    en: 'All-zero tax file number is not valid',
  },
  [REASON_CODES.CHECK_DIGIT]: {
    he: 'ספרת ביקורת שגויה (תיק אינו עובר אלגוריתם לוהן)',
    en: 'Check digit is invalid (Luhn-style test failed)',
  },
  [REASON_CODES.UNKNOWN_TYPE]: {
    he: 'סוג תיק לא מזוהה',
    en: 'Unknown tax file type',
  },
  [REASON_CODES.RESERVED_PREFIX]: {
    he: 'קידומת שמורה של רשות המסים — אינו תיק ניכן להקצאה',
    en: 'Reserved prefix — not assignable to a taxpayer',
  },
});

// ═══════════════════════════════════════════════════════════════
//  LOW-LEVEL HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a raw user-supplied tax-file identifier into a clean,
 * left-padded 9-digit string.
 *
 * Accepts:
 *   - string of digits ("123456782")
 *   - dashes / slashes / spaces stripped ("12-34-56-78-2", "12/345/6782")
 *   - numbers (coerced via String() — watch for loss of leading zeros)
 *   - Hebrew/Arabic quotation marks around the number
 *
 * Returns the cleaned 9-digit string, or `null` if normalization
 * failed (empty / non-numeric / >9 digits).
 *
 * @param {string|number|null|undefined} raw
 * @returns {string|null}
 */
function normalize(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let s = String(raw).trim();
  if (s.length === 0) return null;

  // Strip common separators used in printed IL tax files
  s = s.replace(/[\s\-\/_.]/g, '');

  // Strip Hebrew/Arabic quotation marks and parentheses
  s = s.replace(/[״"'`()\[\]]/g, '');

  if (s.length === 0) return null;
  if (!/^\d+$/.test(s)) return s; // return raw so caller can report NON_NUMERIC
  if (s.length > 9) return s;     // return raw so caller can report WRONG_LENGTH
  return s.padStart(9, '0');
}

/**
 * Canonical Israeli 9-digit check-digit test (Luhn-style).
 *
 * Algorithm (as used by רשות המסים for ת.ז. / תיק ניכויים / ח.פ):
 *   - Pad to 9 digits with leading zeros
 *   - Multiply each digit by alternating weights 1,2,1,2,1,2,1,2,1
 *   - If a product is ≥ 10, subtract 9 (equivalent to summing its digits)
 *   - The total sum must be divisible by 10
 *
 * This is identical to `luhnIsraeliIdValid` in `src/scanners/barcode-scanner.js`
 * and produces the same results as the Tax Authority's own JS validator
 * that ships inside the Shaam (שע"ם) upload portal.
 *
 * @param {string} id — must already be normalized to 9 digits
 * @returns {boolean}
 */
function luhnIsraeliCheck(id) {
  if (typeof id !== 'string') return false;
  if (!/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = (id.charCodeAt(i) - 48) * ((i % 2) + 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0;
}

/**
 * Format a (valid) 9-digit tax file for display.
 *
 * The canonical Israeli display form is `XXX-XXX-XXX` which matches
 * how numbers appear on printed רשות המסים letters. Optionally
 * prepends the type label in Hebrew and English.
 *
 * @param {string} id   — normalized 9-digit string
 * @param {string} [type] — one of TAX_FILE_TYPES (optional)
 * @returns {string}
 */
function formatDisplay(id, type) {
  if (typeof id !== 'string' || !/^\d{9}$/.test(id)) return String(id ?? '');
  const grouped = `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6, 9)}`;
  if (type && TYPE_LABELS[type]) {
    const lbl = TYPE_LABELS[type];
    return `${lbl.he} / ${lbl.en}: ${grouped}`;
  }
  return grouped;
}

/**
 * Build a standardized failure result object. Kept inline so every
 * return from validateTaxFile has exactly the same shape.
 */
function fail(type, code, rawInput) {
  const msg = REASON_MESSAGES[code] || {
    he: 'שגיאה לא ידועה', en: 'Unknown error',
  };
  return {
    valid:      false,
    type:       type || null,
    display:    rawInput == null ? '' : String(rawInput),
    reason:     code,
    reason_he:  msg.he,
    reason_en:  msg.en,
  };
}

/**
 * Build a standardized success result object.
 */
function ok(type, normalized) {
  return {
    valid:     true,
    type:      type,
    display:   formatDisplay(normalized, type),
    normalized,
    raw9:      normalized,
  };
}

// ═══════════════════════════════════════════════════════════════
//  CORE VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Validate an Israeli tax-file identifier.
 *
 * This is the single entry point. Pass in any raw user input (from a
 * form, from an imported CSV, from a scanned document) and an expected
 * file type; the validator will normalize, length-check, check-digit,
 * and return a rich result object.
 *
 * @param {string|number} id — raw tax file number (any format)
 * @param {string} [type=TAX_FILE_TYPES.WITHHOLDING] — expected type
 * @returns {{
 *   valid: boolean,
 *   type: string|null,
 *   display: string,
 *   normalized?: string,
 *   raw9?: string,
 *   reason?: string,
 *   reason_he?: string,
 *   reason_en?: string,
 * }}
 */
function validateTaxFile(id, type) {
  const effectiveType = type || TAX_FILE_TYPES.WITHHOLDING;

  // Type sanity
  if (!Object.values(TAX_FILE_TYPES).includes(effectiveType)) {
    return fail(null, REASON_CODES.UNKNOWN_TYPE, id);
  }

  // Empty / null / undefined
  if (id === null || id === undefined) {
    return fail(effectiveType, REASON_CODES.EMPTY, id);
  }

  // Only string or number accepted
  if (typeof id !== 'string' && typeof id !== 'number') {
    return fail(effectiveType, REASON_CODES.NOT_STRING, id);
  }

  const rawStr = String(id).trim();
  if (rawStr.length === 0) {
    return fail(effectiveType, REASON_CODES.EMPTY, id);
  }

  const normalized = normalize(id);
  if (normalized === null) {
    return fail(effectiveType, REASON_CODES.EMPTY, id);
  }

  // Non-digit characters remaining?
  if (!/^\d+$/.test(normalized)) {
    return fail(effectiveType, REASON_CODES.NON_NUMERIC, id);
  }

  // Length guard (too many digits after normalization)
  if (normalized.length !== 9) {
    return fail(effectiveType, REASON_CODES.WRONG_LENGTH, id);
  }

  // All-zeros is a reserved sentinel (never assigned)
  if (normalized === '000000000') {
    return fail(effectiveType, REASON_CODES.ALL_ZEROS, id);
  }

  // Luhn-style check digit
  if (!luhnIsraeliCheck(normalized)) {
    return fail(effectiveType, REASON_CODES.CHECK_DIGIT, id);
  }

  return ok(effectiveType, normalized);
}

// ═══════════════════════════════════════════════════════════════
//  SHORTCUTS
// ═══════════════════════════════════════════════════════════════

/** Shortcut: validate a תיק ניכויים (withholding file). */
function validateWithholdingFile(id) {
  return validateTaxFile(id, TAX_FILE_TYPES.WITHHOLDING);
}

/** Shortcut: validate a תיק מע"מ (VAT file). */
function validateVatFile(id) {
  return validateTaxFile(id, TAX_FILE_TYPES.VAT);
}

/** Shortcut: validate a תיק מס הכנסה (income-tax file). */
function validateIncomeTaxFile(id) {
  return validateTaxFile(id, TAX_FILE_TYPES.INCOME_TAX);
}

/** Shortcut: validate an עוסק מורשה file (same check as VAT). */
function validateOsekMorsheFile(id) {
  return validateTaxFile(id, TAX_FILE_TYPES.OSEK_MORSHE);
}

// ═══════════════════════════════════════════════════════════════
//  CROSS-REFERENCE
// ═══════════════════════════════════════════════════════════════

/**
 * Sanity check that two registry numbers likely belong to the same
 * entity. The Israeli Tax Authority commonly reuses the same 8-digit
 * base across ח.פ, תיק ניכויים, תיק מע"מ and תיק מס הכנסה for a given
 * legal entity — only the final check digit differs (because different
 * algorithms or registry quirks may pick a different terminator).
 *
 * This function does NOT enforce the match — it returns a confidence
 * score so upstream code can warn the user or ask for verification.
 *
 *   match=true  + confidence=1.0  → full 9-digit match
 *   match=true  + confidence=0.9  → same 8-digit base, different check
 *   match=true  + confidence=0.6  → same 7-digit prefix
 *   match=false + confidence=0.0  → no plausible relationship
 *
 * Both inputs are normalized before comparison, so formatting
 * differences (dashes, padding) don't produce false negatives.
 *
 * @param {string|number} entityId — ח.פ / ת.ז of the entity
 * @param {string|number} taxFile  — tax file number to cross-check
 * @returns {{match: boolean, confidence: number, reason: string, reason_he: string, reason_en: string}}
 */
function crossReference(entityId, taxFile) {
  const a = normalize(entityId);
  const b = normalize(taxFile);

  if (!a || !b || !/^\d{9}$/.test(a) || !/^\d{9}$/.test(b)) {
    return {
      match:      false,
      confidence: 0.0,
      reason:     'invalid_input',
      reason_he:  'אחד הקלטים אינו מספר 9 ספרות תקין',
      reason_en:  'One of the inputs is not a valid 9-digit number',
    };
  }

  if (a === b) {
    return {
      match:      true,
      confidence: 1.0,
      reason:     'exact_match',
      reason_he:  'התאמה מלאה של 9 ספרות',
      reason_en:  'Exact 9-digit match',
    };
  }

  // Same 8-digit base → different check digit only
  if (a.slice(0, 8) === b.slice(0, 8)) {
    return {
      match:      true,
      confidence: 0.9,
      reason:     'same_base_different_check',
      reason_he:  'אותו בסיס של 8 ספרות, ספרת ביקורת שונה',
      reason_en:  'Same 8-digit base, different check digit',
    };
  }

  // Same 7-digit prefix → weak link (could be sequential family)
  if (a.slice(0, 7) === b.slice(0, 7)) {
    return {
      match:      true,
      confidence: 0.6,
      reason:     'same_prefix_7',
      reason_he:  'אותה קידומת של 7 ספרות',
      reason_en:  'Same 7-digit prefix',
    };
  }

  return {
    match:      false,
    confidence: 0.0,
    reason:     'no_relationship',
    reason_he:  'אין קשר מובהק בין שני המספרים',
    reason_en:  'No plausible relationship between the two numbers',
  };
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVE-STATUS STUB (future רשות המסים API)
// ═══════════════════════════════════════════════════════════════

/**
 * Stub hook for checking whether a tax file is active at רשות המסים.
 *
 * Today the Israeli Tax Authority does not expose a free public REST
 * endpoint for "is this תיק ניכויים active?". There is an internal
 * Shaam lookup behind Gov.IL SSO, and a paid Open-Banking-style feed
 * via חברות מידע פיננסי. Until we wire one of those up, this
 * function is a no-op that returns `{status:"unknown"}` and never
 * throws.
 *
 * Callers should treat `"unknown"` as "assume active, but log".
 *
 * When the online lookup is wired up, this function's contract is:
 *   - input:  (id, type, {timeoutMs, cacheTtlSec})
 *   - output: {status: "active"|"inactive"|"closed"|"unknown",
 *              last_checked_at: ISO8601,
 *              source: "shaam"|"cache"|"stub"}
 *
 * @param {string|number} id
 * @param {string} [type]
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{status: string, last_checked_at: string, source: string}>}
 */
async function checkActiveStatus(id, type, opts) {
  // Still run the local format check so obviously-bad inputs fail fast,
  // even in stub mode.
  const local = validateTaxFile(id, type);
  const now = new Date().toISOString();

  if (!local.valid) {
    return {
      status:          'invalid_format',
      last_checked_at: now,
      source:          'stub',
      local_reason:    local.reason,
    };
  }

  // TODO(agent-future): call Shaam / רשות המסים endpoint here.
  // const resp = await httpGet(`https://api.gov.il/.../${local.normalized}`, opts);
  // return parseShaamStatus(resp);

  return {
    status:          'unknown',
    last_checked_at: now,
    source:          'stub',
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Primary API
  validateTaxFile,
  validateWithholdingFile,
  validateVatFile,
  validateIncomeTaxFile,
  validateOsekMorsheFile,
  crossReference,
  checkActiveStatus,

  // Helpers
  normalize,
  luhnIsraeliCheck,
  formatDisplay,

  // Enums / constants
  TAX_FILE_TYPES,
  TYPE_LABELS,
  REASON_CODES,
  REASON_MESSAGES,
};
