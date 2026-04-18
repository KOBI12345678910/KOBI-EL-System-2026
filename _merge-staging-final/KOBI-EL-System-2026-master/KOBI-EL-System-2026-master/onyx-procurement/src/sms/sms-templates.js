/**
 * ONYX PROCUREMENT — SMS Templates (Hebrew)
 * ──────────────────────────────────────────
 * Agent-75 — SMS notification subsystem
 *
 * Purpose:
 *   A tiny, dependency-free template registry for short Hebrew SMS
 *   messages. Every template is designed to fit inside ONE Unicode SMS
 *   segment (70 characters / 140 bytes UCS-2) where possible, and never
 *   exceed the 160-char Unicode cap (which is multi-segment territory
 *   for Hebrew, but still the hard upper limit we enforce).
 *
 * Design principles:
 *   1. Pure functions. No I/O, no global state — safe for unit tests
 *      and for being imported by the queue/worker hot path.
 *   2. Hebrew-first. All templates are authored in Hebrew, with the
 *      understanding that most Israeli carriers bill per Unicode
 *      segment (70 chars). We emit warnings when a rendered message
 *      crosses the single-segment boundary so callers can tighten copy.
 *   3. No `delete`. This module never removes templates; additions only.
 *   4. Escaping-free placeholders. Placeholders look like {{name}} and
 *      only substitute whitelisted keys — any unknown key is left
 *      verbatim so bugs surface loudly instead of silently.
 *   5. Opt-out footer is OPTIONAL and added by the caller (send-sms.js)
 *      to stay under 160 chars. Templates here are the raw body.
 *
 * Exports:
 *   TEMPLATES         — frozen map of templateId → template definition
 *   renderTemplate    — (id, vars) → { body, segments, unicode, warnings }
 *   listTemplates     — () → array of { id, description, maxVars }
 *   estimateSegments  — (text) → { chars, segments, unicode }
 *   validateTemplate  — (id, vars) → { ok, missing, unknown, errors }
 *
 * Unicode / segment math:
 *   • GSM-7 single segment: 160 chars
 *   • GSM-7 concat segment: 153 chars per part
 *   • Unicode single segment: 70 chars
 *   • Unicode concat segment: 67 chars per part
 *   Any Hebrew character forces Unicode mode, so every template here
 *   is expected to be billed at the Unicode rate.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// Hard limits
// ─────────────────────────────────────────────────────────────────────

const UNICODE_SINGLE_SEGMENT = 70;
const UNICODE_CONCAT_SEGMENT = 67;
const GSM7_SINGLE_SEGMENT    = 160;
const GSM7_CONCAT_SEGMENT    = 153;
const MAX_UNICODE_LENGTH     = 160; // hard cap — caller MUST split above this

// ─────────────────────────────────────────────────────────────────────
// GSM-7 detection
// ─────────────────────────────────────────────────────────────────────
//
// GSM-7 default alphabet (3GPP TS 23.038). If every char in the string
// is inside this set (plus the extended set), we can bill at GSM-7 rates.
// Hebrew is NOT in GSM-7, so any Hebrew payload falls through to Unicode.

const GSM7_BASIC = new Set([
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r',
  'Å', 'å', 'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ',
  ' ', '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-',
  '.', '/', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';',
  '<', '=', '>', '?', '¡', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
  'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W',
  'X', 'Y', 'Z', 'Ä', 'Ö', 'Ñ', 'Ü', '§', '¿',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
  'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  'ä', 'ö', 'ñ', 'ü', 'à',
]);

const GSM7_EXTENDED = new Set([
  '\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€',
]);

function isGsm7(text) {
  for (const ch of text) {
    if (!GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Segment estimator
// ─────────────────────────────────────────────────────────────────────

function estimateSegments(text) {
  if (typeof text !== 'string') {
    throw new TypeError('estimateSegments: text must be a string');
  }

  // Extended GSM-7 chars (^{}\\[~]|€) count double under GSM-7 packing.
  let gsm7Chars = 0;
  for (const ch of text) {
    if (GSM7_EXTENDED.has(ch)) gsm7Chars += 2;
    else gsm7Chars += 1;
  }

  const unicode = !isGsm7(text);
  const chars = [...text].length; // code-point length, not UTF-16 units

  let segments;
  if (unicode) {
    if (chars <= UNICODE_SINGLE_SEGMENT) segments = chars === 0 ? 0 : 1;
    else segments = Math.ceil(chars / UNICODE_CONCAT_SEGMENT);
  } else {
    if (gsm7Chars <= GSM7_SINGLE_SEGMENT) segments = gsm7Chars === 0 ? 0 : 1;
    else segments = Math.ceil(gsm7Chars / GSM7_CONCAT_SEGMENT);
  }

  return { chars, gsm7Chars, segments, unicode };
}

// ─────────────────────────────────────────────────────────────────────
// Template registry
// ─────────────────────────────────────────────────────────────────────
//
// Each template declares:
//   id          stable kebab-case identifier (used by send-sms.js)
//   description short human description (appears in audit log & docs)
//   body        raw template with {{placeholder}} tokens
//   vars        ordered list of required placeholders
//   maxVars     optional max-length hints per var for pre-truncation
//   category    'otp' | 'transactional' | 'reminder' | 'marketing' | 'alert'
//
// NOTE: The request mandates six templates. Additional templates may be
// added freely — this module is append-only.

const TEMPLATES = Object.freeze({
  'otp-code': Object.freeze({
    id: 'otp-code',
    description: 'One-time password / verification code',
    body: 'קוד האימות שלך: {{code}}. בתוקף ל-5 דקות.',
    vars: Object.freeze(['code']),
    maxVars: Object.freeze({ code: 8 }),
    category: 'otp',
    // OTPs MUST NOT be concatenated with an opt-out footer (RFC TCR / TCPA).
    allowOptOutFooter: false,
  }),

  'wage-slip-ready': Object.freeze({
    id: 'wage-slip-ready',
    description: 'Payroll wage slip ready for download',
    body: 'תלוש השכר לחודש {{month}} מוכן. היכנסו ל-{{url}}',
    vars: Object.freeze(['month', 'url']),
    maxVars: Object.freeze({ month: 12, url: 60 }),
    category: 'transactional',
    allowOptOutFooter: true,
  }),

  'payment-received': Object.freeze({
    id: 'payment-received',
    description: 'Payment acknowledgment',
    body: 'תודה! קיבלנו תשלום של \u20AA{{amount}}',
    vars: Object.freeze(['amount']),
    maxVars: Object.freeze({ amount: 14 }),
    category: 'transactional',
    allowOptOutFooter: true,
  }),

  'appointment-reminder': Object.freeze({
    id: 'appointment-reminder',
    description: 'Appointment reminder for next-day meeting',
    body: 'תזכורת: פגישה מחר ב-{{time}} - {{subject}}',
    vars: Object.freeze(['time', 'subject']),
    maxVars: Object.freeze({ time: 8, subject: 40 }),
    category: 'reminder',
    allowOptOutFooter: true,
  }),

  'alert': Object.freeze({
    id: 'alert',
    description: 'System alert / incident notification',
    body: '\u26A0\uFE0F התראה: {{message}}',
    vars: Object.freeze(['message']),
    maxVars: Object.freeze({ message: 140 }),
    category: 'alert',
    allowOptOutFooter: false,
  }),

  'password-reset': Object.freeze({
    id: 'password-reset',
    description: 'Password reset link',
    body: 'לאיפוס סיסמה: {{link}} (בתוקף לשעה)',
    vars: Object.freeze(['link']),
    maxVars: Object.freeze({ link: 80 }),
    category: 'transactional',
    allowOptOutFooter: false,
  }),
});

// ─────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────

function validateTemplate(id, vars) {
  const errors = [];
  const missing = [];
  const unknown = [];

  const tpl = TEMPLATES[id];
  if (!tpl) {
    errors.push(`unknown template id: ${id}`);
    return { ok: false, missing, unknown, errors };
  }

  const providedKeys = Object.keys(vars || {});
  for (const key of tpl.vars) {
    if (vars == null || vars[key] == null || vars[key] === '') {
      missing.push(key);
    }
  }
  for (const key of providedKeys) {
    if (!tpl.vars.includes(key)) unknown.push(key);
  }
  if (missing.length) errors.push(`missing required vars: ${missing.join(', ')}`);

  return { ok: errors.length === 0, missing, unknown, errors };
}

// ─────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────

function escapeReplacementPattern(key) {
  // Build a matcher for "{{key}}" with optional whitespace.
  return new RegExp(`\\{\\{\\s*${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\}\\}`, 'g');
}

function coerceVar(value, maxLen) {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (typeof maxLen === 'number' && maxLen > 0 && [...str].length > maxLen) {
    // Truncate by code points, not UTF-16 units, to avoid splitting
    // surrogate pairs. Hebrew is BMP-only but emoji flags are not.
    const codePoints = [...str];
    return codePoints.slice(0, maxLen).join('');
  }
  return str;
}

function renderTemplate(id, vars = {}) {
  const validation = validateTemplate(id, vars);
  if (!validation.ok) {
    const err = new Error(`renderTemplate: ${validation.errors.join('; ')}`);
    err.code = 'SMS_TEMPLATE_INVALID';
    err.missing = validation.missing;
    err.unknown = validation.unknown;
    throw err;
  }

  const tpl = TEMPLATES[id];
  let body = tpl.body;

  for (const key of tpl.vars) {
    const maxLen = tpl.maxVars && tpl.maxVars[key];
    const val = coerceVar(vars[key], maxLen);
    body = body.replace(escapeReplacementPattern(key), val);
  }

  const { chars, segments, unicode, gsm7Chars } = estimateSegments(body);
  const warnings = [];

  if (chars > MAX_UNICODE_LENGTH) {
    warnings.push(
      `rendered body is ${chars} chars, exceeds 160-char Unicode cap — caller MUST split`,
    );
  }
  if (unicode && chars > UNICODE_SINGLE_SEGMENT) {
    warnings.push(
      `rendered body spans ${segments} Unicode segments (${chars} chars > ${UNICODE_SINGLE_SEGMENT})`,
    );
  }

  return {
    id,
    body,
    chars,
    gsm7Chars,
    segments,
    unicode,
    warnings,
    category: tpl.category,
    allowOptOutFooter: tpl.allowOptOutFooter !== false,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Listing
// ─────────────────────────────────────────────────────────────────────

function listTemplates() {
  return Object.values(TEMPLATES).map((tpl) => ({
    id: tpl.id,
    description: tpl.description,
    vars: [...tpl.vars],
    category: tpl.category,
    allowOptOutFooter: tpl.allowOptOutFooter !== false,
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  TEMPLATES,
  renderTemplate,
  listTemplates,
  estimateSegments,
  validateTemplate,
  isGsm7,
  constants: Object.freeze({
    UNICODE_SINGLE_SEGMENT,
    UNICODE_CONCAT_SEGMENT,
    GSM7_SINGLE_SEGMENT,
    GSM7_CONCAT_SEGMENT,
    MAX_UNICODE_LENGTH,
  }),
};
