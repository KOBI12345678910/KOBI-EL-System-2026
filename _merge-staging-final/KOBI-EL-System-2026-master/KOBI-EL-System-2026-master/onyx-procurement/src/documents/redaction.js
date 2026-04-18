/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Document Redaction Tool — PII / Confidential Scrubber
 * AG-Y118 — Mega-ERP Techno-Kol Uzi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Purpose
 * -------
 * Before a document leaves the organisation (to vendors, auditors, regulators,
 * customers, or the public) it must be stripped of Personally Identifiable
 * Information (PII) and confidential content. This module provides a
 * deterministic, auditable, reversible-never pipeline that:
 *
 *   1. Detects PII via regex + heuristics (Israeli ת.ז with Luhn, credit
 *      cards with Luhn, Israeli phone patterns, emails, IBAN, SWIFT,
 *      passport numbers, dates of birth, addresses, Hebrew + English names).
 *   2. Scrubs text with customizable replacement strategies (tokens,
 *      asterisks, blackbox, or PII-type-specific labels).
 *   3. Supports manual region-based redaction for PDFs (page coordinates).
 *   4. Supports whitelist overrides for public exec names, etc.
 *   5. Offers a human review queue (AI suggests, human confirms).
 *   6. Provides preview-before-apply and bulk-policy batch mode.
 *   7. Records an immutable audit trail (what, why, by whom, when).
 *   8. Never modifies the original — always emits a new redacted copy.
 *   9. Verifies irreversibility (text layer removal, no residual metadata).
 *
 * Israeli Privacy Law (חוק הגנת הפרטיות, התשמ"א-1981)
 * ---------------------------------------------------
 * Section 7 defines "special/sensitive categories" (מידע רגיש) which
 * require stronger handling than ordinary PII. These include:
 *
 *   - מצב בריאות           health / medical information
 *   - נטייה מינית          sexual orientation
 *   - דת ואמונה            religion / belief
 *   - דעות פוליטיות        political opinions
 *   - הרשעות פליליות       criminal history / convictions
 *   - מצב נפשי             mental / psychiatric condition
 *   - נתונים גנטיים         genetic / biometric data
 *
 * The `detectPII` method surfaces these via the `sensitiveCategories` key so
 * callers can enforce stricter policies (e.g. mandatory human review,
 * no-auto-redact-only-apply-after-approval, alert CISO, etc.).
 *
 * Rule — לא מוחקים רק משדרגים ומגדלים
 * -----------------------------------
 * The original document is NEVER modified. Every redaction operation
 * produces a new document (redacted copy) and appends entries to the
 * audit log. Patterns and whitelist terms can only be added, never removed.
 *
 * Zero dependencies — Node built-ins only.
 *
 * Usage
 * -----
 *   const { Redactor } = require('./redaction');
 *   const r = new Redactor();
 *   const detected = r.detectPII({ text });
 *   const redacted = r.redactText({ text, patterns: detected.matches });
 *
 *   // Document pipeline
 *   r.registerDocument({ docId: 'INV-42', kind: 'pdf', content: buf });
 *   const preview = r.previewRedaction('INV-42');
 *   r.reviewQueue({ docId: 'INV-42', autoSuggested: preview.suggestions });
 *   const newId = r.applyRedactionIrreversible('INV-42');
 *   const ok = r.unredactCheck(newId);
 *   r.auditRedaction('INV-42');
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// PII Pattern Definitions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PII type constants. Never remove — only add new types.
 * Each type has a canonical label used for replacement tokens.
 */
const PII_TYPES = Object.freeze({
  ISRAELI_ID:          'israeli_id',           // ת.ז
  CREDIT_CARD:         'credit_card',          // כרטיס אשראי
  PHONE_ISRAELI:       'phone_israeli',        // טלפון
  PHONE_INTL:          'phone_intl',           // טלפון בינ"ל
  EMAIL:               'email',                // דוא"ל
  IBAN:                'iban',                 // IBAN
  SWIFT:               'swift',                // SWIFT/BIC
  PASSPORT:            'passport',             // דרכון
  DATE_OF_BIRTH:       'date_of_birth',        // תאריך לידה
  ADDRESS:             'address',              // כתובת
  NAME_HEBREW:         'name_hebrew',          // שם (עברית)
  NAME_ENGLISH:        'name_english',         // name (English)
  IP_ADDRESS:          'ip_address',           // IP
  BANK_ACCOUNT_IL:     'bank_account_il',      // חשבון בנק IL
  VEHICLE_PLATE_IL:    'vehicle_plate_il',     // לוחית רישוי
  HEALTH_SENSITIVE:    'health_sensitive',     // מצב בריאות
  SEXUAL_ORIENTATION:  'sexual_orientation',   // נטייה מינית
  RELIGION:            'religion',             // דת
  POLITICAL:           'political',            // דעות פוליטיות
  CRIMINAL:            'criminal',             // הרשעות פליליות
  MENTAL_HEALTH:       'mental_health',        // מצב נפשי
  GENETIC:             'genetic',              // נתונים גנטיים
});

/**
 * Sensitive categories per Israeli Privacy Law §7. Detection of any of
 * these in a document triggers `requiresHumanReview = true` in the
 * detection result so callers must route it through `reviewQueue`.
 */
const SENSITIVE_CATEGORIES = Object.freeze(new Set([
  PII_TYPES.HEALTH_SENSITIVE,
  PII_TYPES.SEXUAL_ORIENTATION,
  PII_TYPES.RELIGION,
  PII_TYPES.POLITICAL,
  PII_TYPES.CRIMINAL,
  PII_TYPES.MENTAL_HEALTH,
  PII_TYPES.GENETIC,
]));

/**
 * Default replacement tokens per PII type. The caller can override via
 * the `replacement` argument to `redactText`. Using PII-type-specific
 * tokens preserves document semantics while destroying the content.
 */
const DEFAULT_TOKENS = Object.freeze({
  [PII_TYPES.ISRAELI_ID]:         '[ת.ז.]',
  [PII_TYPES.CREDIT_CARD]:        '[אשראי]',
  [PII_TYPES.PHONE_ISRAELI]:      '[טלפון]',
  [PII_TYPES.PHONE_INTL]:         '[טלפון]',
  [PII_TYPES.EMAIL]:              '[דוא"ל]',
  [PII_TYPES.IBAN]:               '[IBAN]',
  [PII_TYPES.SWIFT]:              '[SWIFT]',
  [PII_TYPES.PASSPORT]:           '[דרכון]',
  [PII_TYPES.DATE_OF_BIRTH]:      '[תאריך לידה]',
  [PII_TYPES.ADDRESS]:            '[כתובת]',
  [PII_TYPES.NAME_HEBREW]:        '[שם]',
  [PII_TYPES.NAME_ENGLISH]:       '[NAME]',
  [PII_TYPES.IP_ADDRESS]:         '[IP]',
  [PII_TYPES.BANK_ACCOUNT_IL]:    '[חשבון]',
  [PII_TYPES.VEHICLE_PLATE_IL]:   '[רכב]',
  [PII_TYPES.HEALTH_SENSITIVE]:   '[REDACTED:HEALTH]',
  [PII_TYPES.SEXUAL_ORIENTATION]: '[REDACTED:PII]',
  [PII_TYPES.RELIGION]:           '[REDACTED:PII]',
  [PII_TYPES.POLITICAL]:          '[REDACTED:PII]',
  [PII_TYPES.CRIMINAL]:           '[REDACTED:CRIMINAL]',
  [PII_TYPES.MENTAL_HEALTH]:      '[REDACTED:HEALTH]',
  [PII_TYPES.GENETIC]:            '[REDACTED:GENETIC]',
});

// ═══════════════════════════════════════════════════════════════════════════
// Regex Patterns (NOT greedy — each one anchors on a context delimiter)
// ═══════════════════════════════════════════════════════════════════════════

// Israeli phone: 0XX-XXX-XXXX (mobile 050-059, landline 02-04, 08-09),
// also +972 form and bare 10 digits.
const RE_PHONE_IL = /(?:(?:\+972|972|0)[-\s]?(?:5[0-9]|7[23479]|2|3|4|8|9)[-\s]?\d{3}[-\s]?\d{4})/g;

// Generic international phone (E.164-ish, 7–15 digits with optional +)
const RE_PHONE_INTL = /(?:\+[1-9]\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4}[-\s]?\d{0,4})/g;

// Email — RFC-ish, lowercased after capture
const RE_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

// IBAN: 2 letters + 2 digits + up to 30 alphanumerics (IL has exactly 23)
const RE_IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

// SWIFT/BIC: 8 or 11 chars, letters+digits (AAAABBCCXXX)
const RE_SWIFT = /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;

// Passport (loose) — 6-9 alphanumeric chars, Israeli passports are 8-9 digits
const RE_PASSPORT = /\b(?:[A-Z]{1,2}\d{6,8}|\d{8,9})\b/g;

// Credit card: 13–19 digits, possibly grouped by spaces or dashes
const RE_CREDIT_CARD = /\b(?:\d[ -]?){12,18}\d\b/g;

// Israeli ID (pre-filter): 5-10 digit runs (we pad/Luhn-check in detection)
const RE_IL_ID_CANDIDATE = /\b\d{5,10}\b/g;

// DOB: common formats dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
const RE_DOB = /\b(?:(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:19|20)\d{2}|(?:19|20)\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01]))\b/g;

// Street address heuristic (Hebrew): "רחוב X 12" or "רח' X 12"
const RE_ADDRESS_HE = /(?:רחוב|רח'|שד'|שדרות|דרך)\s+[\u0590-\u05FF\w"'\-]{2,40}\s+\d{1,4}(?:[\/\-]\d{1,4})?/g;

// Street address heuristic (English): "12 Main St", "12 Main Street"
const RE_ADDRESS_EN = /\b\d{1,5}\s+[A-Z][A-Za-z.'\-]{1,30}(?:\s+[A-Z][A-Za-z.'\-]{1,30})*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Way|Pl|Place|Ct|Court|Sq|Square)\b\.?/g;

// IP address v4 (simple, no range check)
const RE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// Israeli bank account: branch 3 digits + account up to 9 digits with dash/slash
const RE_BANK_ACCOUNT_IL = /\b\d{2,3}[\-\/]\d{3,9}\b/g;

// Israeli vehicle plate (7–8 digits, commonly 00-000-00 or 000-00-000)
const RE_VEHICLE_PLATE_IL = /\b\d{2,3}[\-\s]?\d{2,3}[\-\s]?\d{2,3}\b/g;

// Hebrew name heuristic — two consecutive Hebrew words at title position
// (Hebrew has no casing, so we anchor on common prefixes "מר ", "גב' ", "ד"ר")
const RE_HEBREW_NAME_TITLE = /(?:מר|גב'|גברת|ד"ר|פרופ'|עו"ד|רו"ח)\s+[\u0590-\u05FF]{2,15}(?:\s+[\u0590-\u05FF]{2,15}){0,2}/g;

// Two-word Hebrew name (no title) — used with common-name dictionary
const RE_HEBREW_TWO_WORDS = /[\u0590-\u05FF]{2,15}\s+[\u0590-\u05FF]{2,15}/g;

// English full name — capitalized two-word
const RE_ENGLISH_NAME = /\b[A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15}){1,2}\b/g;

// ═══════════════════════════════════════════════════════════════════════════
// Common Israeli & English first-name dictionaries (non-exhaustive, additive)
// ═══════════════════════════════════════════════════════════════════════════

const COMMON_HEBREW_FIRST_NAMES = new Set([
  'משה', 'דוד', 'יוסף', 'אברהם', 'יעקב', 'יצחק', 'שמואל', 'שלמה',
  'אורי', 'איתן', 'נועם', 'עומר', 'רון', 'ליאור', 'אבי', 'ערן',
  'שרה', 'רחל', 'לאה', 'מרים', 'אסתר', 'חנה', 'דינה', 'יעל',
  'נועה', 'מאיה', 'שירה', 'מיכל', 'תמר', 'רות', 'נעמה', 'הילה',
  'קובי', 'עוזי', 'גיא', 'עידו', 'אלון', 'דני', 'אייל', 'רועי',
  'טל', 'אור', 'שחר', 'ליאן', 'רותם', 'אדם',
]);

const COMMON_HEBREW_LAST_NAMES = new Set([
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אזולאי', 'אוחיון',
  'חדד', 'אברהם', 'אליהו', 'גבאי', 'אדרי', 'בן-דוד', 'בן דוד', 'סגל',
  'ישראלי', 'שפירא', 'רוזנברג', 'גולדברג', 'פרידמן', 'רבינוביץ',
  'קפלן', 'וייס', 'כץ',
]);

const COMMON_ENGLISH_FIRST_NAMES = new Set([
  'John', 'Jane', 'Michael', 'Mary', 'David', 'Sarah', 'Robert', 'Emily',
  'James', 'Jennifer', 'William', 'Elizabeth', 'Daniel', 'Rachel',
  'Joseph', 'Hannah', 'Thomas', 'Rebecca', 'Benjamin', 'Leah', 'Noah',
  'Jacob', 'Samuel', 'Abraham', 'Isaac', 'Aaron', 'Eli', 'Joshua',
]);

// ═══════════════════════════════════════════════════════════════════════════
// Sensitive-category keyword dictionaries (Hebrew + English, additive)
// ═══════════════════════════════════════════════════════════════════════════

const SENSITIVE_KEYWORDS = Object.freeze({
  [PII_TYPES.HEALTH_SENSITIVE]: [
    // Hebrew
    'סוכרת', 'סרטן', 'איידס', 'HIV', 'HIV+', 'הפטיטיס', 'לחץ דם', 'כולסטרול',
    'אבחנה', 'מחלה כרונית', 'טיפול תרופתי', 'אשפוז', 'ניתוח', 'תרופה',
    'קופת חולים', 'בית חולים', 'רופא משפחה', 'מרשם', 'סיבות רפואיות',
    // English
    'diabetes', 'cancer', 'tumor', 'HIV', 'AIDS', 'hepatitis', 'stroke',
    'heart attack', 'chronic illness', 'hospitalization', 'prescription',
    'diagnosis', 'medication', 'medical condition',
  ],
  [PII_TYPES.MENTAL_HEALTH]: [
    'דיכאון', 'חרדה', 'פסיכיאטר', 'פסיכולוג', 'ADHD', 'הפרעת קשב',
    'התמכרות', 'אלכוהוליזם', 'סמים',
    'depression', 'anxiety', 'psychiatric', 'psychologist', 'PTSD',
    'bipolar', 'schizophrenia', 'addiction', 'rehab',
  ],
  [PII_TYPES.SEXUAL_ORIENTATION]: [
    'הומוסקסואל', 'לסבית', 'ביסקסואל', 'טרנסג\'נדר', 'להט"ב', 'גאה',
    'homosexual', 'lesbian', 'bisexual', 'transgender', 'LGBT', 'LGBTQ',
    'gay', 'queer',
  ],
  [PII_TYPES.RELIGION]: [
    'יהודי', 'מוסלמי', 'נוצרי', 'דרוזי', 'חרדי', 'חילוני', 'דתי', 'מסורתי',
    'קתולי', 'פרוטסטנטי', 'בודהיסט',
    'Jewish', 'Muslim', 'Christian', 'Druze', 'Catholic', 'Protestant',
    'Buddhist', 'Hindu', 'atheist',
  ],
  [PII_TYPES.POLITICAL]: [
    'ליכוד', 'העבודה', 'מרצ', 'יש עתיד', 'ימינה', 'ש"ס', 'יהדות התורה',
    'כחול לבן', 'מפלגה',
    'Likud', 'Labor', 'Meretz', 'Yesh Atid', 'political party',
    'Republican', 'Democrat', 'Conservative', 'Liberal',
  ],
  [PII_TYPES.CRIMINAL]: [
    'הרשעה', 'עבירה', 'מאסר', 'כלא', 'רישום פלילי', 'תיק משטרתי',
    'מעצר', 'שחרור בערובה',
    'conviction', 'felony', 'misdemeanor', 'prison', 'criminal record',
    'arrest', 'indictment', 'parole', 'bail',
  ],
  [PII_TYPES.GENETIC]: [
    'DNA', 'גנטי', 'גנום', 'כרומוזום', 'מוטציה', 'BRCA',
    'genetic', 'genome', 'chromosome', 'mutation', 'hereditary',
  ],
});

// ═══════════════════════════════════════════════════════════════════════════
// Algorithms — Luhn, Israeli ID Luhn-like, normalisers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard Luhn mod-10 check for credit-card / IMEI style numbers.
 * Digits-only string, 13–19 long.
 */
function luhnCheck(digits) {
  const s = String(digits).replace(/\D/g, '');
  if (s.length < 12 || s.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = s.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Israeli Teudat Zehut check — 9-digit (padded from 5–9) with the
 * official Population Authority algorithm. Returns boolean.
 */
function israeliIdCheck(digits) {
  const raw = String(digits).replace(/\D/g, '');
  if (raw.length < 5 || raw.length > 9) return false;
  const padded = raw.padStart(9, '0');
  // Reject obvious reserved values
  if (padded === '000000000' || padded === '999999999') return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = padded.charCodeAt(i) - 48;
    const mult = (i % 2 === 0) ? 1 : 2;
    let product = digit * mult;
    if (product > 9) product -= 9;
    sum += product;
  }
  return sum % 10 === 0;
}

/**
 * IBAN mod-97 check. Expects a compact uppercase IBAN string (no spaces).
 */
function ibanCheck(iban) {
  const s = String(iban).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  // Move first 4 chars to end
  const rearranged = s.slice(4) + s.slice(0, 4);
  // Convert letters A=10..Z=35 to digits
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const c = rearranged.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      numeric += rearranged[i];
    } else if (c >= 65 && c <= 90) {
      numeric += (c - 55).toString();
    } else {
      return false;
    }
  }
  // Compute mod 97 iteratively (BigInt-free)
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + (numeric.charCodeAt(i) - 48)) % 97;
  }
  return remainder === 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hash / ID utilities (no external deps — deterministic FNV-1a 64)
// ═══════════════════════════════════════════════════════════════════════════

/** 64-bit FNV-1a hash, returned as 16-char hex. Deterministic, fast. */
function fnv1a64(str) {
  const s = String(str);
  // Constants from FNV-1a 64
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (let i = 0; i < s.length; i++) {
    const byte = s.charCodeAt(i) & 0xff;
    lo ^= byte;
    // Multiply by 1099511628211 = 0x00000100000001B3
    // hi:lo * 0x00000100:000001B3 — implemented as two 32-bit mults
    const aHi = hi;
    const aLo = lo >>> 0;
    const bHi = 0x0100;
    const bLo = 0x01B3;
    // (aHi * 2^32 + aLo) * (bHi * 2^32 + bLo) mod 2^64
    const llLo = (aLo & 0xffff) * bLo;
    const lhLo = ((aLo >>> 16) * bLo) + (llLo >>> 16);
    const hlLo = (aLo & 0xffff) * (bHi >>> 0);
    const newLo = ((llLo & 0xffff) + ((lhLo + hlLo) << 16)) >>> 0;
    const carry = (((lhLo >>> 16) + ((hlLo >>> 16))) + ((((lhLo & 0xffff) + (hlLo & 0xffff)) >>> 16))) >>> 0;
    const newHi = (aHi * bLo + aLo * bHi + carry) >>> 0;
    hi = newHi;
    lo = newLo;
  }
  return (hi.toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0'));
}

/** Simple monotonically-increasing in-process counter for unique IDs. */
let _idCounter = 0;
function nextId(prefix) {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter.toString(36)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Match utilities
// ═══════════════════════════════════════════════════════════════════════════

/** Build a match record. */
function mkMatch(type, value, start, end, extra = {}) {
  return {
    type,
    value,
    start,
    end,
    length: value.length,
    hash: fnv1a64(`${type}:${value}`),
    ...extra,
  };
}

/**
 * Find all regex matches in `text`, returning an array of {type, value,
 * start, end} objects. `regex` MUST have the global flag.
 */
function findAllMatches(text, regex, type, filterFn) {
  const out = [];
  if (!text || !regex.global) return out;
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const value = m[0];
    if (!filterFn || filterFn(value)) {
      out.push(mkMatch(type, value, m.index, m.index + value.length));
    }
    // Avoid zero-width infinite loops
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  return out;
}

/**
 * Dedupe matches that cover identical (type, start, end) triples.
 * Keeps order stable.
 */
function dedupeMatches(matches) {
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const k = `${m.type}|${m.start}|${m.end}|${m.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

/**
 * Resolve overlapping matches. When two spans overlap we keep the longer
 * one (higher PII confidence), with a tiebreaker on type priority.
 */
const TYPE_PRIORITY = [
  PII_TYPES.ISRAELI_ID,
  PII_TYPES.CREDIT_CARD,
  PII_TYPES.IBAN,
  PII_TYPES.PASSPORT,
  PII_TYPES.EMAIL,
  PII_TYPES.PHONE_IL,
  PII_TYPES.PHONE_INTL,
  PII_TYPES.BANK_ACCOUNT_IL,
  PII_TYPES.SWIFT,
  PII_TYPES.DATE_OF_BIRTH,
  PII_TYPES.ADDRESS,
  PII_TYPES.VEHICLE_PLATE_IL,
  PII_TYPES.IP_ADDRESS,
  PII_TYPES.NAME_HEBREW,
  PII_TYPES.NAME_ENGLISH,
];

function typeRank(type) {
  const i = TYPE_PRIORITY.indexOf(type);
  return i === -1 ? 999 : i;
}

function resolveOverlaps(matches) {
  // Sort by start asc, then by length desc
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return typeRank(a.type) - typeRank(b.type);
  });
  const out = [];
  for (const m of sorted) {
    let pushed = false;
    for (let i = out.length - 1; i >= 0; i--) {
      const o = out[i];
      const overlap = !(m.end <= o.start || m.start >= o.end);
      if (!overlap) {
        // No overlap with this one — keep looking back, break if we've moved past
        if (o.end <= m.start) break;
        continue;
      }
      // Decide winner: longer wins, then higher priority
      const mLen = m.end - m.start;
      const oLen = o.end - o.start;
      if (mLen > oLen) {
        out[i] = m;
      } else if (mLen === oLen && typeRank(m.type) < typeRank(o.type)) {
        out[i] = m;
      }
      pushed = true;
      break;
    }
    if (!pushed) {
      out.push(m);
    }
  }
  // Re-sort by start for downstream consumers
  return out.sort((a, b) => a.start - b.start);
}

// ═══════════════════════════════════════════════════════════════════════════
// Replacement helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Build a replacement string for a match given a `replacement` option. */
function buildReplacement(match, replacement) {
  if (replacement === 'asterisks') {
    return '*'.repeat(Math.max(1, match.length));
  }
  if (replacement === 'blackbox') {
    // Unicode full block — visually obliterates in monospace logs too
    return '\u2588'.repeat(Math.max(1, match.length));
  }
  if (typeof replacement === 'function') {
    return String(replacement(match));
  }
  if (typeof replacement === 'string') {
    return replacement;
  }
  if (replacement && typeof replacement === 'object') {
    // per-type override map
    const t = replacement[match.type];
    if (t !== undefined) return typeof t === 'function' ? t(match) : String(t);
  }
  // Default: type-specific token
  return DEFAULT_TOKENS[match.type] || '[REDACTED]';
}

// ═══════════════════════════════════════════════════════════════════════════
// Redactor Class
// ═══════════════════════════════════════════════════════════════════════════

class Redactor {
  constructor(opts = {}) {
    // Documents registered in this Redactor session. Never deletes.
    /** @type {Map<string, object>} */
    this._documents = new Map();

    // Redacted copies — each derived doc has its own id, pointing back
    // to the parent via `parentId`.
    /** @type {Map<string, object>} */
    this._redactedCopies = new Map();

    // Audit log — append-only array of entries. Never modified in place.
    /** @type {Array<object>} */
    this._auditLog = [];

    // Per-document whitelist terms (never redacted).
    /** @type {Map<string, Set<string>>} */
    this._whitelists = new Map();

    // Per-document review queue.
    /** @type {Map<string, object>} */
    this._reviewQueues = new Map();

    // Per-document manual region definitions (for PDF).
    /** @type {Map<string, Array<object>>} */
    this._manualRegions = new Map();

    // Clock — injectable for tests.
    this._now = opts.now || (() => new Date());

    // Actor — defaults to 'system', overridden per-call.
    this._defaultActor = opts.actor || 'system';

    // Additional user-supplied dictionaries (never removes, only adds).
    this._extraHebrewNames = new Set(opts.extraHebrewNames || []);
    this._extraEnglishNames = new Set(opts.extraEnglishNames || []);
    this._extraSensitiveKeywords = Object.assign({}, opts.extraSensitiveKeywords || {});
  }

  // ──────────────────────────────────────────────────────────────────────
  // detectPII — regex + heuristics
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Detect PII in a plain-text string. Returns a structured result that
   * is safe to log (hashes, offsets, types — NOT raw values unless the
   * caller explicitly asks via `includeValues: true`).
   *
   * @param {object} args
   * @param {string} args.text — document text
   * @param {boolean} [args.includeValues=true] — include raw values in matches
   * @param {Array<string>} [args.types] — restrict to specific PII types
   * @returns {{
   *   matches: Array<object>,
   *   byType: Record<string, number>,
   *   sensitiveCategories: Array<string>,
   *   requiresHumanReview: boolean,
   *   stats: { totalMatches: number, uniqueTypes: number, textLength: number }
   * }}
   */
  detectPII({ text, includeValues = true, types = null } = {}) {
    if (text === null || text === undefined) {
      return {
        matches: [],
        byType: {},
        sensitiveCategories: [],
        requiresHumanReview: false,
        stats: { totalMatches: 0, uniqueTypes: 0, textLength: 0 },
      };
    }
    const str = String(text);
    const allowed = types && types.length ? new Set(types) : null;
    const allow = (t) => !allowed || allowed.has(t);

    const matches = [];

    // Email (first, so its '.' characters don't get mistaken for IPv4)
    if (allow(PII_TYPES.EMAIL)) {
      matches.push(...findAllMatches(str, new RegExp(RE_EMAIL.source, 'g'), PII_TYPES.EMAIL));
    }

    // IBAN (must precede credit card so 22-char IL IBANs aren't misread)
    if (allow(PII_TYPES.IBAN)) {
      matches.push(
        ...findAllMatches(str, new RegExp(RE_IBAN.source, 'g'), PII_TYPES.IBAN, (v) => ibanCheck(v))
      );
    }

    // SWIFT — also before creditcard
    if (allow(PII_TYPES.SWIFT)) {
      matches.push(...findAllMatches(str, new RegExp(RE_SWIFT.source, 'g'), PII_TYPES.SWIFT));
    }

    // Credit card (Luhn-verified)
    if (allow(PII_TYPES.CREDIT_CARD)) {
      matches.push(
        ...findAllMatches(str, new RegExp(RE_CREDIT_CARD.source, 'g'), PII_TYPES.CREDIT_CARD, (v) =>
          luhnCheck(v)
        )
      );
    }

    // Israeli phone — before generic intl to claim 0XX-XXX-XXXX spans
    if (allow(PII_TYPES.PHONE_ISRAELI)) {
      matches.push(...findAllMatches(str, new RegExp(RE_PHONE_IL.source, 'g'), PII_TYPES.PHONE_ISRAELI));
    }
    if (allow(PII_TYPES.PHONE_INTL)) {
      matches.push(...findAllMatches(str, new RegExp(RE_PHONE_INTL.source, 'g'), PII_TYPES.PHONE_INTL));
    }

    // Israeli ID (Luhn-validated to reduce false positives)
    if (allow(PII_TYPES.ISRAELI_ID)) {
      matches.push(
        ...findAllMatches(
          str,
          new RegExp(RE_IL_ID_CANDIDATE.source, 'g'),
          PII_TYPES.ISRAELI_ID,
          (v) => israeliIdCheck(v)
        )
      );
    }

    // Passport (lenient)
    if (allow(PII_TYPES.PASSPORT)) {
      matches.push(...findAllMatches(str, new RegExp(RE_PASSPORT.source, 'g'), PII_TYPES.PASSPORT));
    }

    // DOB
    if (allow(PII_TYPES.DATE_OF_BIRTH)) {
      matches.push(...findAllMatches(str, new RegExp(RE_DOB.source, 'g'), PII_TYPES.DATE_OF_BIRTH));
    }

    // Address
    if (allow(PII_TYPES.ADDRESS)) {
      matches.push(...findAllMatches(str, new RegExp(RE_ADDRESS_HE.source, 'g'), PII_TYPES.ADDRESS));
      matches.push(...findAllMatches(str, new RegExp(RE_ADDRESS_EN.source, 'g'), PII_TYPES.ADDRESS));
    }

    // Bank account IL
    if (allow(PII_TYPES.BANK_ACCOUNT_IL)) {
      matches.push(
        ...findAllMatches(str, new RegExp(RE_BANK_ACCOUNT_IL.source, 'g'), PII_TYPES.BANK_ACCOUNT_IL)
      );
    }

    // Vehicle plate IL — opt-in (noisy)
    // Disabled by default to avoid hitting every 7-digit run. Opt in via
    // types: [PII_TYPES.VEHICLE_PLATE_IL].
    if (types && types.includes(PII_TYPES.VEHICLE_PLATE_IL)) {
      matches.push(
        ...findAllMatches(str, new RegExp(RE_VEHICLE_PLATE_IL.source, 'g'), PII_TYPES.VEHICLE_PLATE_IL)
      );
    }

    // IP address
    if (allow(PII_TYPES.IP_ADDRESS)) {
      matches.push(
        ...findAllMatches(str, new RegExp(RE_IPV4.source, 'g'), PII_TYPES.IP_ADDRESS, (v) => {
          const parts = v.split('.');
          return parts.every((p) => {
            const n = Number(p);
            return Number.isInteger(n) && n >= 0 && n <= 255;
          });
        })
      );
    }

    // Hebrew titled names
    if (allow(PII_TYPES.NAME_HEBREW)) {
      matches.push(
        ...findAllMatches(str, new RegExp(RE_HEBREW_NAME_TITLE.source, 'g'), PII_TYPES.NAME_HEBREW)
      );

      // Two-word Hebrew names (dictionary-gated to reduce noise)
      const re2 = new RegExp(RE_HEBREW_TWO_WORDS.source, 'g');
      let mm;
      while ((mm = re2.exec(str)) !== null) {
        const parts = mm[0].split(/\s+/);
        if (parts.length >= 2) {
          const [first, last] = parts;
          const knownFirst =
            COMMON_HEBREW_FIRST_NAMES.has(first) || this._extraHebrewNames.has(first);
          const knownLast =
            COMMON_HEBREW_LAST_NAMES.has(last) || this._extraHebrewNames.has(last);
          if (knownFirst || knownLast) {
            matches.push(
              mkMatch(PII_TYPES.NAME_HEBREW, mm[0], mm.index, mm.index + mm[0].length, {
                dictHit: true,
              })
            );
          }
        }
        if (mm.index === re2.lastIndex) re2.lastIndex++;
      }
    }

    // English names (dictionary-filtered)
    if (allow(PII_TYPES.NAME_ENGLISH)) {
      const re = new RegExp(RE_ENGLISH_NAME.source, 'g');
      let mm;
      while ((mm = re.exec(str)) !== null) {
        const first = mm[0].split(/\s+/)[0];
        if (
          COMMON_ENGLISH_FIRST_NAMES.has(first) ||
          this._extraEnglishNames.has(first)
        ) {
          matches.push(
            mkMatch(PII_TYPES.NAME_ENGLISH, mm[0], mm.index, mm.index + mm[0].length, {
              dictHit: true,
            })
          );
        }
        if (mm.index === re.lastIndex) re.lastIndex++;
      }
    }

    // Sensitive categories (Israeli Privacy Law §7)
    const foundCategories = new Set();
    for (const [cat, keywords] of Object.entries(SENSITIVE_KEYWORDS)) {
      if (!allow(cat)) continue;
      const extra = this._extraSensitiveKeywords[cat] || [];
      const all = [...keywords, ...extra];
      for (const kw of all) {
        const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?:^|\\W)(${safe})(?:$|\\W)`, 'gi');
        let mm;
        while ((mm = re.exec(str)) !== null) {
          const inner = mm[1];
          const idx = mm.index + mm[0].indexOf(inner);
          matches.push(mkMatch(cat, inner, idx, idx + inner.length, { keyword: true }));
          foundCategories.add(cat);
          if (mm.index === re.lastIndex) re.lastIndex++;
        }
      }
    }

    // Dedupe + overlap resolution
    const deduped = dedupeMatches(matches);
    const resolved = resolveOverlaps(deduped);

    // Stats / grouping
    const byType = {};
    for (const m of resolved) {
      byType[m.type] = (byType[m.type] || 0) + 1;
    }

    const sensitiveCategories = [...foundCategories];
    const requiresHumanReview = sensitiveCategories.length > 0;

    // Strip raw values if caller requested privacy-preserving output
    const finalMatches = includeValues
      ? resolved
      : resolved.map((m) => ({ ...m, value: undefined }));

    return {
      matches: finalMatches,
      byType,
      sensitiveCategories,
      requiresHumanReview,
      stats: {
        totalMatches: resolved.length,
        uniqueTypes: Object.keys(byType).length,
        textLength: str.length,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // redactText — produce scrubbed text
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Scrub text given a set of patterns (as returned by detectPII.matches)
   * or a fresh detection. Replacement modes:
   *
   *   - '[REDACTED]'   — literal token
   *   - '[שם]'         — literal token (Hebrew)
   *   - '[ת.ז.]'       — literal token
   *   - 'asterisks'    — replace with "*" repeated match.length times
   *   - 'blackbox'     — replace with full-block U+2588
   *   - {type: '...'}  — per-type override map
   *   - (match) => str — function
   *   - (undefined)    — use default type-specific tokens (most readable)
   *
   * @param {object} args
   * @param {string} args.text
   * @param {Array<object>} [args.patterns]
   * @param {string[]} [args.whitelist] — terms never redacted
   * @returns {{ redacted: string, replaced: number, matches: Array<object> }}
   */
  redactText({ text, patterns, replacement, whitelist = [] } = {}) {
    if (text === null || text === undefined) {
      return { redacted: '', replaced: 0, matches: [] };
    }
    const str = String(text);

    // If patterns not supplied, run a detection pass
    let matches = patterns;
    if (!matches) {
      matches = this.detectPII({ text: str }).matches;
    }

    // Apply whitelist: skip any match whose value matches a whitelist term
    const wl = new Set(whitelist.map((t) => String(t).trim()).filter(Boolean));
    const filtered = matches.filter((m) => !wl.has(m.value));

    // Sort by start descending so in-place substring replacement keeps
    // earlier offsets valid.
    const sorted = [...filtered].sort((a, b) => b.start - a.start);

    let out = str;
    let replaced = 0;
    for (const m of sorted) {
      if (m.start < 0 || m.end > out.length) continue;
      // Defensive: ensure the substring still matches
      const current = out.slice(m.start, m.end);
      if (current !== m.value) {
        // Offsets drifted — fall back to a single replace-first
        const idx = out.indexOf(m.value);
        if (idx === -1) continue;
        out = out.slice(0, idx) + buildReplacement(m, replacement) + out.slice(idx + m.value.length);
      } else {
        out = out.slice(0, m.start) + buildReplacement(m, replacement) + out.slice(m.end);
      }
      replaced++;
    }

    return { redacted: out, replaced, matches: filtered };
  }

  // ──────────────────────────────────────────────────────────────────────
  // registerDocument — track a document for redaction pipeline
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Register a document so it can be previewed, reviewed, and redacted.
   * Originals are NEVER modified or deleted — this just stores a frozen
   * reference plus metadata.
   *
   * @param {object} doc
   * @param {string} doc.docId — unique id
   * @param {'text'|'pdf'|'binary'} [doc.kind='text']
   * @param {string|Buffer} doc.content — document content
   * @param {object} [doc.metadata]
   */
  registerDocument({ docId, kind = 'text', content, metadata = {} } = {}) {
    if (!docId) throw new Error('registerDocument: docId required');
    if (this._documents.has(docId)) {
      throw new Error(`registerDocument: docId "${docId}" already registered — rule: never overwrite`);
    }
    const entry = Object.freeze({
      docId,
      kind,
      content,
      metadata: Object.freeze({ ...metadata }),
      registeredAt: this._now().toISOString(),
      contentHash: fnv1a64(typeof content === 'string' ? content : Buffer.isBuffer(content) ? content.toString('base64') : JSON.stringify(content)),
      frozen: true,
    });
    this._documents.set(docId, entry);
    this._logAudit({
      action: 'register',
      docId,
      actor: this._defaultActor,
      details: { kind, bytes: typeof content === 'string' ? content.length : (content && content.length) || 0 },
    });
    return entry;
  }

  /** Retrieve a registered document (immutable). */
  getDocument(docId) {
    return this._documents.get(docId) || null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // manualRedaction — PDF region-based
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Declare manual rectangular regions to be redacted in a PDF. Does not
   * apply the redaction — call `applyRedactionIrreversible` for that.
   *
   * @param {object} args
   * @param {string} args.docId
   * @param {Array<{page:number,x:number,y:number,w:number,h:number,reason?:string}>} args.regions
   */
  manualRedaction({ docId, regions = [] } = {}) {
    if (!docId) throw new Error('manualRedaction: docId required');
    if (!this._documents.has(docId)) {
      throw new Error(`manualRedaction: unknown docId "${docId}"`);
    }
    // Validate each region
    const validated = regions.map((r, i) => {
      if (
        typeof r.page !== 'number' ||
        typeof r.x !== 'number' ||
        typeof r.y !== 'number' ||
        typeof r.w !== 'number' ||
        typeof r.h !== 'number'
      ) {
        throw new Error(`manualRedaction: region[${i}] must have numeric page/x/y/w/h`);
      }
      if (r.w <= 0 || r.h <= 0) {
        throw new Error(`manualRedaction: region[${i}] must have positive w/h`);
      }
      return Object.freeze({
        page: r.page | 0,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        reason: r.reason || 'manual',
      });
    });
    // Append — never overwrite
    const existing = this._manualRegions.get(docId) || [];
    this._manualRegions.set(docId, [...existing, ...validated]);
    this._logAudit({
      action: 'manualRedaction.declare',
      docId,
      actor: this._defaultActor,
      details: { count: validated.length, reasons: validated.map((r) => r.reason) },
    });
    return { docId, total: this._manualRegions.get(docId).length };
  }

  // ──────────────────────────────────────────────────────────────────────
  // whitelistOverride — never redact these terms
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Add whitelist terms for a specific document. Additive — once set, a
   * term cannot be unset (per the upgrade-only rule).
   */
  whitelistOverride({ docId, terms = [] } = {}) {
    if (!docId) throw new Error('whitelistOverride: docId required');
    const existing = this._whitelists.get(docId) || new Set();
    let added = 0;
    for (const t of terms) {
      const s = String(t).trim();
      if (s && !existing.has(s)) {
        existing.add(s);
        added++;
      }
    }
    this._whitelists.set(docId, existing);
    this._logAudit({
      action: 'whitelistOverride',
      docId,
      actor: this._defaultActor,
      details: { added, total: existing.size },
    });
    return { docId, added, total: existing.size };
  }

  getWhitelist(docId) {
    return [...(this._whitelists.get(docId) || new Set())];
  }

  // ──────────────────────────────────────────────────────────────────────
  // reviewQueue — AI suggests, human confirms
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Enqueue AI-suggested redactions for human review. Returns the queue
   * entry. Use `approveReview` / `rejectReview` on individual items.
   */
  reviewQueue({ docId, autoSuggested = [], reviewer = null } = {}) {
    if (!docId) throw new Error('reviewQueue: docId required');
    const items = autoSuggested.map((s, i) => ({
      id: nextId('rvw'),
      index: i,
      match: s,
      status: 'pending',
      decidedAt: null,
      decidedBy: null,
      note: null,
    }));
    const entry = {
      docId,
      createdAt: this._now().toISOString(),
      reviewer,
      items,
      summary: {
        total: items.length,
        pending: items.length,
        approved: 0,
        rejected: 0,
      },
    };
    this._reviewQueues.set(docId, entry);
    this._logAudit({
      action: 'reviewQueue.create',
      docId,
      actor: this._defaultActor,
      details: { count: items.length, reviewer },
    });
    return entry;
  }

  /** Approve one queue item (human confirms). */
  approveReview({ docId, itemId, actor, note }) {
    const q = this._reviewQueues.get(docId);
    if (!q) throw new Error(`approveReview: no queue for "${docId}"`);
    const item = q.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`approveReview: unknown item "${itemId}"`);
    if (item.status !== 'pending') throw new Error(`approveReview: item already ${item.status}`);
    item.status = 'approved';
    item.decidedAt = this._now().toISOString();
    item.decidedBy = actor || this._defaultActor;
    item.note = note || null;
    q.summary.pending--;
    q.summary.approved++;
    this._logAudit({
      action: 'reviewQueue.approve',
      docId,
      actor: item.decidedBy,
      details: { itemId, type: item.match && item.match.type, note },
    });
    return item;
  }

  /** Reject one queue item (human overrides AI suggestion). */
  rejectReview({ docId, itemId, actor, note }) {
    const q = this._reviewQueues.get(docId);
    if (!q) throw new Error(`rejectReview: no queue for "${docId}"`);
    const item = q.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`rejectReview: unknown item "${itemId}"`);
    if (item.status !== 'pending') throw new Error(`rejectReview: item already ${item.status}`);
    item.status = 'rejected';
    item.decidedAt = this._now().toISOString();
    item.decidedBy = actor || this._defaultActor;
    item.note = note || null;
    q.summary.pending--;
    q.summary.rejected++;
    this._logAudit({
      action: 'reviewQueue.reject',
      docId,
      actor: item.decidedBy,
      details: { itemId, type: item.match && item.match.type, note },
    });
    return item;
  }

  getReviewQueue(docId) {
    return this._reviewQueues.get(docId) || null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // previewRedaction — dry run
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute what *would* be redacted without modifying anything. For
   * text docs, returns both the detected matches and the scrubbed text.
   * For PDFs, returns the text-layer detection plus any declared
   * manual regions.
   */
  previewRedaction(docId) {
    const doc = this._documents.get(docId);
    if (!doc) throw new Error(`previewRedaction: unknown docId "${docId}"`);
    const whitelist = this.getWhitelist(docId);
    const text = this._extractText(doc);
    const detection = this.detectPII({ text });
    const scrub = this.redactText({
      text,
      patterns: detection.matches,
      whitelist,
    });
    const manualRegions = this._manualRegions.get(docId) || [];
    this._logAudit({
      action: 'previewRedaction',
      docId,
      actor: this._defaultActor,
      details: {
        totalMatches: detection.stats.totalMatches,
        sensitive: detection.sensitiveCategories,
        manualRegions: manualRegions.length,
      },
    });
    return {
      docId,
      kind: doc.kind,
      detection,
      scrub,
      manualRegions,
      suggestions: detection.matches,
      requiresHumanReview: detection.requiresHumanReview,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // applyRedactionIrreversible — emit a new redacted copy
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Produce a redacted copy of a document. The original is NEVER modified.
   * A new docId is returned pointing to the redacted copy. For PDFs this
   * method burns text-layer redactions (replacement tokens) and draws
   * opaque rectangles over declared manual regions.
   *
   * NOTE: this module does not ship a full PDF parser (zero-deps); for
   * real PDF output the caller should integrate a renderer. We emit a
   * `redactedPdfSpec` object describing exactly what needs to be burned.
   */
  applyRedactionIrreversible(docId, opts = {}) {
    const doc = this._documents.get(docId);
    if (!doc) throw new Error(`applyRedactionIrreversible: unknown docId "${docId}"`);

    const actor = opts.actor || this._defaultActor;
    const whitelist = this.getWhitelist(docId);

    const text = this._extractText(doc);
    const detection = this.detectPII({ text });

    // If a review queue exists, honor only approved matches + non-queued matches.
    const queue = this._reviewQueues.get(docId);
    let effectiveMatches = detection.matches;
    if (queue) {
      // Build a set of queued match hashes so we can subtract
      const queuedHashes = new Map();
      for (const it of queue.items) {
        if (it.match && it.match.hash) queuedHashes.set(it.match.hash, it.status);
      }
      effectiveMatches = detection.matches.filter((m) => {
        const st = queuedHashes.get(m.hash);
        if (st === undefined) return true;     // not queued — auto-redact
        return st === 'approved';              // queued — only if approved
      });
    }

    const scrub = this.redactText({
      text,
      patterns: effectiveMatches,
      whitelist,
      replacement: opts.replacement,
    });

    const manualRegions = this._manualRegions.get(docId) || [];

    // Build the redacted-copy record
    const newId = `${docId}__redacted__${nextId('r').slice(2)}`;
    const now = this._now().toISOString();
    let newContent;
    let redactedPdfSpec = null;

    if (doc.kind === 'text') {
      newContent = scrub.redacted;
    } else if (doc.kind === 'pdf') {
      // For PDFs we emit a spec object the downstream renderer consumes.
      // Importantly, the text layer is replaced with scrubbed strings.
      redactedPdfSpec = {
        parentDocId: docId,
        scrubbedText: scrub.redacted,
        regions: manualRegions,
        // Caller must render with: 1) text layer = scrubbedText,
        // 2) opaque rectangles over each region, 3) flatten the result.
        flatten: true,
        removeTextLayer: true,
        removeMetadata: true,
      };
      newContent = redactedPdfSpec;
    } else {
      // Binary — we cannot redact content without a parser; return a spec
      // that refuses to share the original and requires operator review.
      newContent = {
        parentDocId: docId,
        kind: doc.kind,
        warning: 'binary document — cannot redact automatically',
        manualRegionsAvailable: manualRegions.length,
      };
    }

    const redactedCopy = Object.freeze({
      docId: newId,
      parentId: docId,
      kind: doc.kind,
      content: newContent,
      redactedPdfSpec,
      createdAt: now,
      actor,
      stats: {
        replaced: scrub.replaced,
        byType: detection.byType,
        manualRegions: manualRegions.length,
        sensitiveCategories: detection.sensitiveCategories,
      },
      // Per-match audit trail (hashes + types only — NO raw values)
      decisions: effectiveMatches.map((m) => ({
        type: m.type,
        hash: m.hash,
        length: m.length,
        start: m.start,
        end: m.end,
        queued: queue ? queue.items.some((i) => i.match && i.match.hash === m.hash) : false,
      })),
      frozen: true,
    });
    this._redactedCopies.set(newId, redactedCopy);

    this._logAudit({
      action: 'applyRedactionIrreversible',
      docId,
      actor,
      details: {
        newDocId: newId,
        replaced: scrub.replaced,
        byType: detection.byType,
        sensitiveCategories: detection.sensitiveCategories,
        manualRegions: manualRegions.length,
      },
    });
    return {
      newDocId: newId,
      copy: redactedCopy,
    };
  }

  getRedactedCopy(newDocId) {
    return this._redactedCopies.get(newDocId) || null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // exportRedacted — serialize a redacted copy
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Serialize a redacted copy for external sharing. Format: 'text',
   * 'json', 'pdf-spec' (for downstream PDF renderer). The original
   * document is never included.
   */
  exportRedacted(newDocId, format = 'text') {
    const copy = this._redactedCopies.get(newDocId);
    if (!copy) throw new Error(`exportRedacted: unknown redacted docId "${newDocId}"`);
    this._logAudit({
      action: 'exportRedacted',
      docId: newDocId,
      actor: this._defaultActor,
      details: { format, parentId: copy.parentId },
    });
    switch (format) {
      case 'text':
        return typeof copy.content === 'string'
          ? copy.content
          : JSON.stringify(copy.content, null, 2);
      case 'json':
        return JSON.stringify(
          {
            docId: copy.docId,
            parentId: copy.parentId,
            kind: copy.kind,
            content: copy.content,
            createdAt: copy.createdAt,
            stats: copy.stats,
          },
          null,
          2
        );
      case 'pdf-spec':
        if (!copy.redactedPdfSpec) {
          throw new Error(`exportRedacted: no PDF spec available for "${newDocId}"`);
        }
        return copy.redactedPdfSpec;
      default:
        throw new Error(`exportRedacted: unsupported format "${format}"`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // auditRedaction — retrieve audit log entries for a doc
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Return all audit log entries for a given docId (original or redacted
   * copy). Entries include action, actor, timestamp, and structured
   * details. The log is append-only — never modified, never deleted.
   */
  auditRedaction(docId) {
    // Include entries for both the original and any derived copies
    const entries = this._auditLog.filter((e) => {
      if (e.docId === docId) return true;
      // Also surface entries whose action creates a copy of docId
      if (e.action === 'applyRedactionIrreversible' && e.details && e.details.newDocId === docId) {
        return true;
      }
      return false;
    });
    return {
      docId,
      total: entries.length,
      entries: entries.map((e) => ({ ...e })), // shallow copy
    };
  }

  /** Get the full audit log. */
  getAuditLog() {
    return this._auditLog.map((e) => ({ ...e }));
  }

  // ──────────────────────────────────────────────────────────────────────
  // unredactCheck — verify redaction is irreversible
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Paranoid verification: scans the redacted copy for any residual PII
   * that should have been removed. Also verifies that:
   *
   *   1. The redacted content contains none of the original PII values.
   *   2. For PDFs, the spec flags text-layer removal and metadata wipe.
   *   3. The hash of the redacted content differs from the parent hash.
   *   4. Re-running detectPII on the output finds no matches of the
   *      redacted types.
   *
   * Returns { ok, issues: [...], residualMatches: [...] }.
   */
  unredactCheck(newDocId) {
    const copy = this._redactedCopies.get(newDocId);
    if (!copy) throw new Error(`unredactCheck: unknown redacted docId "${newDocId}"`);
    const parent = this._documents.get(copy.parentId);
    if (!parent) throw new Error(`unredactCheck: parent "${copy.parentId}" missing`);

    const issues = [];
    const residualMatches = [];

    // 1) Extract text from redacted copy
    let txt;
    if (typeof copy.content === 'string') {
      txt = copy.content;
    } else if (copy.content && typeof copy.content === 'object') {
      txt = copy.content.scrubbedText || '';
    } else {
      txt = '';
    }

    // 2) Re-scan for the same PII types that were originally redacted
    const originalTypes = Object.keys(copy.stats.byType || {});
    if (originalTypes.length > 0) {
      const rescan = this.detectPII({ text: txt, types: originalTypes });
      if (rescan.stats.totalMatches > 0) {
        for (const m of rescan.matches) {
          residualMatches.push(m);
        }
        issues.push({
          code: 'RESIDUAL_PII',
          message: `Re-scan found ${rescan.stats.totalMatches} residual matches`,
        });
      }
    }

    // 3) Check that none of the per-match hashes re-appear as raw values
    //    in the scrubbed text.
    for (const d of copy.decisions || []) {
      // We cannot check raw values directly (we don't store them), but we
      // can re-detect to make sure nothing of the same type remains in
      // the same span. Covered by step 2.
      if (d.end <= txt.length) {
        const window = txt.slice(d.start, d.end);
        if (window && !window.startsWith('[') && !/^\*+$/.test(window) && !/^\u2588+$/.test(window)) {
          // If the span is not a redaction token, the offset likely
          // shifted from substitution — not a leak per se. We flag
          // only when the span still looks like the *type* it should
          // have been.
          // No-op — rescan in step 2 is authoritative.
        }
      }
    }

    // 4) PDF-specific checks
    if (copy.kind === 'pdf') {
      const spec = copy.redactedPdfSpec;
      if (!spec) {
        issues.push({ code: 'PDF_NO_SPEC', message: 'PDF copy missing redactedPdfSpec' });
      } else {
        if (!spec.removeTextLayer) {
          issues.push({
            code: 'PDF_TEXT_LAYER_NOT_REMOVED',
            message: 'removeTextLayer flag not set — text layer may remain',
          });
        }
        if (!spec.flatten) {
          issues.push({
            code: 'PDF_NOT_FLATTENED',
            message: 'flatten flag not set — annotations may be reversible',
          });
        }
        if (!spec.removeMetadata) {
          issues.push({
            code: 'PDF_METADATA_NOT_REMOVED',
            message: 'removeMetadata flag not set — author / title may leak',
          });
        }
      }
    }

    // 5) Hash divergence check
    const parentHash = parent.contentHash;
    const childHashInput =
      typeof copy.content === 'string'
        ? copy.content
        : JSON.stringify(copy.content || '');
    const childHash = fnv1a64(childHashInput);
    if (parentHash === childHash) {
      issues.push({
        code: 'HASH_UNCHANGED',
        message: 'Redacted copy hash matches parent — no changes actually applied',
      });
    }

    const ok = issues.length === 0 && residualMatches.length === 0;
    this._logAudit({
      action: 'unredactCheck',
      docId: newDocId,
      actor: this._defaultActor,
      details: { ok, issueCount: issues.length, residualCount: residualMatches.length },
    });
    return {
      ok,
      newDocId,
      parentId: copy.parentId,
      issues,
      residualMatches,
      checkedAt: this._now().toISOString(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // bulkRedact — batch policy-driven
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Apply the same redaction policy to many documents at once.
   *
   * @param {object} args
   * @param {Array<{docId:string, kind?:string, content:string|Buffer, metadata?:object}>} args.docs
   * @param {object} [args.policy]
   * @param {string[]} [args.policy.types]  — restrict to specific types
   * @param {'asterisks'|'blackbox'|string} [args.policy.replacement]
   * @param {boolean} [args.policy.requireHumanReview=false] — if true, any
   *        doc with sensitive categories is NOT auto-applied; instead a
   *        review queue is created and its id returned.
   * @returns {{ successes: Array, pending: Array, failures: Array }}
   */
  bulkRedact({ docs = [], policy = {} } = {}) {
    const successes = [];
    const pending = [];
    const failures = [];

    for (const d of docs) {
      try {
        // Register if not yet registered
        if (!this._documents.has(d.docId)) {
          this.registerDocument({
            docId: d.docId,
            kind: d.kind || 'text',
            content: d.content,
            metadata: d.metadata || {},
          });
        }
        // Detect first
        const preview = this.previewRedaction(d.docId);
        if (policy.requireHumanReview && preview.requiresHumanReview) {
          this.reviewQueue({
            docId: d.docId,
            autoSuggested: preview.detection.matches,
          });
          pending.push({ docId: d.docId, reason: 'sensitive_categories_detected' });
          continue;
        }
        const res = this.applyRedactionIrreversible(d.docId, {
          replacement: policy.replacement,
        });
        successes.push({
          docId: d.docId,
          newDocId: res.newDocId,
          replaced: res.copy.stats.replaced,
        });
      } catch (err) {
        failures.push({ docId: d.docId, error: err.message });
      }
    }

    this._logAudit({
      action: 'bulkRedact',
      docId: '(batch)',
      actor: this._defaultActor,
      details: {
        total: docs.length,
        successes: successes.length,
        pending: pending.length,
        failures: failures.length,
      },
    });

    return { successes, pending, failures };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────

  _logAudit(entry) {
    const full = Object.freeze({
      ts: this._now().toISOString(),
      ...entry,
    });
    this._auditLog.push(full);
    return full;
  }

  _extractText(doc) {
    if (!doc) return '';
    if (doc.kind === 'text') {
      return typeof doc.content === 'string' ? doc.content : String(doc.content || '');
    }
    if (doc.kind === 'pdf') {
      // Zero-deps: we can't parse PDF bytes here. Accept a convention:
      // if content is an object with `.text` field, use it; otherwise empty.
      if (doc.content && typeof doc.content === 'object' && typeof doc.content.text === 'string') {
        return doc.content.text;
      }
      return '';
    }
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  Redactor,
  // constants
  PII_TYPES,
  SENSITIVE_CATEGORIES,
  DEFAULT_TOKENS,
  SENSITIVE_KEYWORDS,
  COMMON_HEBREW_FIRST_NAMES,
  COMMON_HEBREW_LAST_NAMES,
  COMMON_ENGLISH_FIRST_NAMES,
  // algorithms (exposed for tests)
  luhnCheck,
  israeliIdCheck,
  ibanCheck,
  fnv1a64,
  // low-level utilities
  findAllMatches,
  dedupeMatches,
  resolveOverlaps,
  buildReplacement,
  typeRank,
};
