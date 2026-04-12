/**
 * Israeli Phone Number Validator & Carrier Detector
 * Techno-Kol Uzi — Onyx Procurement mega-ERP
 * Agent 93 — Kobi's payroll/compliance suite
 *
 * מאמת מספרי טלפון ישראליים + זיהוי מפעיל סלולרי
 *
 * Compliance:
 *   - Israeli Ministry of Communications (משרד התקשורת) numbering plan
 *   - ITU E.164 international format
 *   - Supports number portability (מספר נייד נייד) — carrier returned is
 *     historical prefix owner, marked with `portable: true`.
 *
 * ZERO runtime dependencies. Pure CommonJS. Node >= 14.
 *
 * Exports:
 *   - validateIsraeliPhone(input)
 *       → { valid, type, carrier?, e164, display_local, display_international, reason? }
 *   - parseIsraeliPhone(input) → structured breakdown
 *   - formatForDisplay(phone, mode?) → "050-123-4567" or "+972 50 123 4567"
 *   - CARRIERS, TYPES, MOBILE_PREFIXES, LANDLINE_AREA_CODES (const tables)
 *
 * NEVER DELETE — historical compliance code, referenced across modules.
 */

'use strict';

// ──────────────────────────────────────────────────────────────────────
// Constants — Israeli numbering plan (2026)
// ──────────────────────────────────────────────────────────────────────

/** Phone type enumeration */
const TYPES = Object.freeze({
  MOBILE:    'mobile',
  LANDLINE:  'landline',
  TOLL_FREE: 'toll_free',
  PREMIUM:   'premium',
  SPECIAL:   'special',
  VOIP:      'voip',
  UNKNOWN:   'unknown',
});

/** Mobile prefixes → primary carrier (historical allocation, pre-portability) */
const MOBILE_PREFIXES = Object.freeze({
  '050': { carriers: ['Pelephone'],                he: 'פלאפון' },
  '051': { carriers: ['Home Cellular'],            he: 'הום סלולר' },
  '052': { carriers: ['Cellcom', 'Pelephone'],     he: 'סלקום / פלאפון' },
  '053': { carriers: ['Hot Mobile', 'Partner'],    he: 'הוט מובייל / פרטנר' },
  '054': { carriers: ['Partner', 'Cellcom'],       he: 'פרטנר / סלקום' },
  '055': { carriers: ['Hot Mobile'],               he: 'הוט מובייל' },
  '056': { carriers: ['Palestinian Operator'],     he: 'מפעיל פלסטיני' },
  '057': { carriers: ['MVNO'],                     he: 'מפעיל וירטואלי' },
  '058': { carriers: ['Golan Telecom', 'Rami Levy'], he: 'גולן טלקום / רמי לוי' },
  '059': { carriers: ['Jawwal', 'Palestinian'],    he: 'ג׳ואל / פלסטיני' },
});

/** Landline area codes → region */
const LANDLINE_AREA_CODES = Object.freeze({
  '02': { region: 'Jerusalem',                   he: 'ירושלים' },
  '03': { region: 'Tel Aviv / Gush Dan',         he: 'תל אביב / גוש דן' },
  '04': { region: 'Haifa / North',               he: 'חיפה / הצפון' },
  '08': { region: 'Central South / Ashdod',      he: 'מרכז דרום / אשדוד / אשקלון' },
  '09': { region: 'Sharon',                      he: 'השרון' },
  // 07 is no longer allocated as a regional landline prefix in the modern
  // numbering plan (absorbed by mobile + Beer Sheva moved to 08), but we
  // accept historical records. Beer Sheva data uses 08 today.
  '07': { region: 'Beer Sheva (historical)',     he: 'באר שבע (היסטורי)' },
});

/** VOIP / non-geographic */
const VOIP_PREFIXES = Object.freeze({
  '077': { label: 'VOIP', he: 'VOIP' },
  '072': { label: 'VOIP', he: 'VOIP' },
  '073': { label: 'VOIP', he: 'VOIP' },
  '074': { label: 'VOIP', he: 'VOIP' },
  '076': { label: 'VOIP', he: 'VOIP' },
  '078': { label: 'VOIP', he: 'VOIP' },
});

/** Service number prefixes — begin with 1-, then area-code style */
const SERVICE_PREFIXES = Object.freeze({
  '1800': { type: TYPES.TOLL_FREE, label: 'Toll-Free',    he: 'חיוג חינם' },
  '1700': { type: TYPES.TOLL_FREE, label: 'Shared-Cost',  he: 'מספר ארצי' },
  '1599': { type: TYPES.TOLL_FREE, label: 'Shared-Cost',  he: 'מספר ארצי' },
  '1900': { type: TYPES.PREMIUM,   label: 'Premium Rate', he: 'שירות מיוחד בתשלום' },
  '1919': { type: TYPES.PREMIUM,   label: 'Premium Rate', he: 'שירות מיוחד בתשלום' },
});

/** Special (emergency / utility) short codes */
const SPECIAL_CODES = Object.freeze({
  '100': { label: 'Police',             he: 'משטרה' },
  '101': { label: 'Magen David Adom',   he: 'מגן דוד אדום' },
  '102': { label: 'Fire & Rescue',      he: 'כבאות והצלה' },
  '103': { label: 'Electric Company',   he: 'חברת חשמל' },
  '104': { label: 'Home Front Command', he: 'פיקוד העורף' },
  '105': { label: 'Child Online Safety',he: 'הגנה מקוונת לילדים' },
  '106': { label: 'Municipality',       he: 'עירייה' },
  '107': { label: 'Consumer Protection',he: 'הגנת הצרכן' },
  '110': { label: 'Bezeq Info',         he: 'בזק מידע' },
  '118': { label: 'Social Services',    he: 'רווחה' },
  '144': { label: 'Directory Assistance', he: 'מודיעין 144' },
});

/** Country: Israel */
const COUNTRY_CODE     = '972';
const COUNTRY_CODE_INT = '+972';

// ──────────────────────────────────────────────────────────────────────
// Core helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Strip everything except digits. Also handles an optional leading '+'
 * (preserved as a marker but then removed before digit extraction).
 *
 * @param {string} input raw user-supplied value
 * @returns {{ digits: string, hadPlus: boolean }}
 */
function stripToDigits(input) {
  if (input === null || input === undefined) return { digits: '', hadPlus: false };
  const s = String(input).trim();
  const hadPlus = s.startsWith('+') || s.startsWith('00');
  // Keep only 0-9 — strips spaces, hyphens, parens, dots, slashes, etc.
  const digits = s.replace(/[^0-9]/g, '');
  return { digits, hadPlus };
}

/**
 * Normalise a raw Israeli number to canonical NATIONAL form
 * (leading '0', NO country code).
 *
 *   +972501234567   → 0501234567
 *   972-50-1234567  → 0501234567
 *   00972501234567  → 0501234567
 *   050-1234567     → 0501234567
 *   (050) 1234567   → 0501234567
 *   0501234567      → 0501234567
 *
 * Returns '' if input is empty / unparseable at the syntactic level.
 *
 * @param {string} input
 * @returns {string} national digits with leading 0 (or '' if empty)
 */
function normalizeToNational(input) {
  const { digits, hadPlus } = stripToDigits(input);
  if (!digits) return '';

  let d = digits;

  // Strip international access prefixes: 00972... or 011972...
  if (d.startsWith('00972'))  d = d.slice(5);
  else if (d.startsWith('011972')) d = d.slice(6);
  // Strip plain 972 prefix (when caller used +972 or typed 972 directly)
  else if (hadPlus && d.startsWith('972')) d = d.slice(3);
  else if (d.startsWith('972') && (d.length === 11 || d.length === 12)) d = d.slice(3);

  // If we stripped the country code, the national number may be missing its
  // leading 0 — add it back.
  if (d && d[0] !== '0') d = '0' + d;

  return d;
}

// ──────────────────────────────────────────────────────────────────────
// Classification
// ──────────────────────────────────────────────────────────────────────

/**
 * Classify a *national-form* (leading-0) Israeli number.
 * Does not itself enforce final length — length is checked by caller.
 *
 * @param {string} national digits with leading 0
 * @returns {{
 *   type: string,
 *   prefix?: string,
 *   area_code?: string,
 *   carrier?: string,
 *   carriers?: string[],
 *   region?: string,
 *   region_he?: string,
 *   carrier_he?: string,
 *   label?: string,
 *   label_he?: string,
 *   portable?: boolean,
 *   expected_total_length?: number[],
 * }}
 */
function classify(national) {
  if (!national || national[0] !== '0') {
    return { type: TYPES.UNKNOWN };
  }

  // ── Special / emergency short codes (100, 101, 102, …)
  // These do NOT start with 0 in real-life dialling, but we allow the raw
  // 3-digit form as well because many DB imports store them without '0'.
  if (national.length === 3 && SPECIAL_CODES[national]) {
    const info = SPECIAL_CODES[national];
    return {
      type: TYPES.SPECIAL,
      prefix: national,
      label: info.label,
      label_he: info.he,
      expected_total_length: [3],
    };
  }

  // ── Service numbers 1-800 / 1-700 / 1-900 / 1-599 / 1-919
  //    Stored commonly as 1800XXXXXX (no leading 0). Because normalizeToNational
  //    prepends '0', they'll look like "01800XXXXXX" here.
  if (national.startsWith('01')) {
    const svcKey = national.slice(1, 5); // "1800"
    if (SERVICE_PREFIXES[svcKey]) {
      const svc = SERVICE_PREFIXES[svcKey];
      return {
        type: svc.type,
        prefix: svcKey,
        label: svc.label,
        label_he: svc.he,
        // 1-800-XXX-XXX → total 10 digits after the stripped leading 0
        expected_total_length: [10, 11],
      };
    }
  }

  // ── Mobile: 05X
  if (national.length >= 2 && national[0] === '0' && national[1] === '5') {
    const pfx = national.slice(0, 3); // "050" .. "059"
    const mob = MOBILE_PREFIXES[pfx];
    if (mob) {
      return {
        type: TYPES.MOBILE,
        prefix: pfx,
        carrier: mob.carriers[0],
        carriers: mob.carriers.slice(),
        carrier_he: mob.he,
        portable: true, // Israeli number portability — always assume possible
        expected_total_length: [10],
      };
    }
  }

  // ── VOIP: 07X (077, 072, 073, 074, 076, 078)
  if (national.length >= 3 && national[0] === '0' && national[1] === '7') {
    const pfx = national.slice(0, 3);
    if (VOIP_PREFIXES[pfx]) {
      return {
        type: TYPES.VOIP,
        prefix: pfx,
        label: VOIP_PREFIXES[pfx].label,
        label_he: VOIP_PREFIXES[pfx].he,
        expected_total_length: [10],
      };
    }
    // 07 standalone (historical Beer Sheva) handled below.
  }

  // ── Landline: 02, 03, 04, 08, 09 (and historical 07)
  if (national.length >= 2 && national[0] === '0') {
    const area = national.slice(0, 2);
    const land = LANDLINE_AREA_CODES[area];
    if (land) {
      return {
        type: TYPES.LANDLINE,
        area_code: area,
        region: land.region,
        region_he: land.he,
        expected_total_length: [9], // 0X-XXX-XXXX
      };
    }
  }

  return { type: TYPES.UNKNOWN };
}

// ──────────────────────────────────────────────────────────────────────
// Length validation per classification
// ──────────────────────────────────────────────────────────────────────

/**
 * Check whether the national-form length is acceptable for the classified
 * type. Returns null on success, or a reason string on failure.
 *
 * @param {string} national
 * @param {object} cls classify() result
 * @returns {string|null}
 */
function checkLength(national, cls) {
  const len = national.length;

  if (cls.type === TYPES.MOBILE) {
    // 05X-XXX-XXXX → 10 digits exactly
    if (len !== 10) return `mobile must be 10 digits, got ${len}`;
    return null;
  }

  if (cls.type === TYPES.LANDLINE) {
    // 0X-XXX-XXXX → 9 digits exactly (some legacy 02- numbers were 8)
    if (len !== 9) return `landline must be 9 digits, got ${len}`;
    return null;
  }

  if (cls.type === TYPES.VOIP) {
    if (len !== 10) return `VOIP must be 10 digits, got ${len}`;
    return null;
  }

  if (cls.type === TYPES.TOLL_FREE || cls.type === TYPES.PREMIUM) {
    // 01800XXXXXX (10) or 01800XXXXXXX (11) after our leading-0 prepend
    if (len !== 10 && len !== 11) return `service number must be 10–11 digits, got ${len}`;
    return null;
  }

  if (cls.type === TYPES.SPECIAL) {
    if (len !== 3) return `special code must be 3 digits, got ${len}`;
    return null;
  }

  return 'unknown number type';
}

// ──────────────────────────────────────────────────────────────────────
// Display formatting
// ──────────────────────────────────────────────────────────────────────

/**
 * Format a national-form number (leading 0) for local Israeli display.
 *
 *   0501234567 → "050-123-4567"
 *   031234567  → "03-123-4567"
 *   0771234567 → "077-123-4567"
 *   018001234  → "1-800-123-4"  (service numbers formatted differently)
 *   101        → "101"
 */
function formatLocal(national, cls) {
  if (!national) return '';

  if (cls.type === TYPES.SPECIAL) return national;

  if (cls.type === TYPES.TOLL_FREE || cls.type === TYPES.PREMIUM) {
    // drop our synthetic leading 0 for service numbers
    const s = national.slice(1); // "1800XXXXXX"
    return s.slice(0, 1) + '-' + s.slice(1, 4) + '-' + s.slice(4, 7) + '-' + s.slice(7);
  }

  if (cls.type === TYPES.MOBILE || cls.type === TYPES.VOIP) {
    // 0XX-XXX-XXXX
    return national.slice(0, 3) + '-' + national.slice(3, 6) + '-' + national.slice(6);
  }

  if (cls.type === TYPES.LANDLINE) {
    // 0X-XXX-XXXX
    return national.slice(0, 2) + '-' + national.slice(2, 5) + '-' + national.slice(5);
  }

  return national;
}

/**
 * Format a national number as international E.164 display with spaces.
 *
 *   0501234567 → "+972 50 123 4567"
 *   031234567  → "+972 3 123 4567"
 */
function formatInternational(national, cls) {
  if (!national || national[0] !== '0') return '';

  if (cls.type === TYPES.SPECIAL) return national; // not international-dialable

  // Drop leading 0 and prepend +972
  const trunk = national.slice(1);

  if (cls.type === TYPES.MOBILE || cls.type === TYPES.VOIP) {
    // +972 5X XXX XXXX  (2-digit trunk + 3 + 4)
    return COUNTRY_CODE_INT + ' ' + trunk.slice(0, 2) + ' ' + trunk.slice(2, 5) + ' ' + trunk.slice(5);
  }

  if (cls.type === TYPES.LANDLINE) {
    // +972 X XXX XXXX (1-digit trunk + 3 + 4)
    return COUNTRY_CODE_INT + ' ' + trunk.slice(0, 1) + ' ' + trunk.slice(1, 4) + ' ' + trunk.slice(4);
  }

  if (cls.type === TYPES.TOLL_FREE || cls.type === TYPES.PREMIUM) {
    // Toll-free numbers are NOT internationally dialable but we can still
    // render them uniformly for DB consistency.
    return COUNTRY_CODE_INT + ' ' + trunk;
  }

  return COUNTRY_CODE_INT + ' ' + trunk;
}

/**
 * Build the canonical E.164 string: "+972XXXXXXXXX", no spaces.
 */
function toE164(national, cls) {
  if (!national || national[0] !== '0') return '';
  if (cls.type === TYPES.SPECIAL) return national;
  return COUNTRY_CODE_INT + national.slice(1);
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Validate, classify and format an Israeli phone number.
 *
 * @param {string} input any accepted format (see module docstring)
 * @returns {{
 *   valid: boolean,
 *   type: string,
 *   carrier?: string,
 *   carriers?: string[],
 *   carrier_he?: string,
 *   region?: string,
 *   region_he?: string,
 *   portable?: boolean,
 *   e164: string,
 *   national: string,
 *   display_local: string,
 *   display_international: string,
 *   input: string,
 *   reason?: string
 * }}
 */
function validateIsraeliPhone(input) {
  const raw = input === null || input === undefined ? '' : String(input);

  // Guard: empty / non-string
  if (!raw.trim()) {
    return {
      valid: false,
      type: TYPES.UNKNOWN,
      e164: '',
      national: '',
      display_local: '',
      display_international: '',
      input: raw,
      reason: 'empty input',
    };
  }

  // ── Fast path: 3-digit emergency / special codes are never normalised
  //    (the normaliser would prepend '0', producing a false '01xx' match).
  {
    const { digits } = stripToDigits(raw);
    if (digits.length === 3 && SPECIAL_CODES[digits]) {
      const info = SPECIAL_CODES[digits];
      return {
        valid: true,
        type: TYPES.SPECIAL,
        e164: digits,
        national: digits,
        display_local: digits,
        display_international: digits,
        input: raw,
        label: info.label,
        label_he: info.he,
      };
    }
  }

  const national = normalizeToNational(raw);

  if (!national) {
    return {
      valid: false,
      type: TYPES.UNKNOWN,
      e164: '',
      national: '',
      display_local: '',
      display_international: '',
      input: raw,
      reason: 'no digits found',
    };
  }

  // Guard: any non-digit leftovers should be impossible after stripToDigits,
  // but double-check for sanity.
  if (!/^0[0-9]+$/.test(national) && !/^[0-9]{3}$/.test(national)) {
    return {
      valid: false,
      type: TYPES.UNKNOWN,
      e164: '',
      national,
      display_local: '',
      display_international: '',
      input: raw,
      reason: 'malformed digits',
    };
  }

  const cls = classify(national);

  if (cls.type === TYPES.UNKNOWN) {
    return {
      valid: false,
      type: TYPES.UNKNOWN,
      e164: '',
      national,
      display_local: '',
      display_international: '',
      input: raw,
      reason: 'unrecognised prefix / area code',
    };
  }

  const lenErr = checkLength(national, cls);
  if (lenErr) {
    return {
      valid: false,
      type: cls.type,
      carrier: cls.carrier,
      carriers: cls.carriers,
      carrier_he: cls.carrier_he,
      region: cls.region,
      region_he: cls.region_he,
      e164: '',
      national,
      display_local: '',
      display_international: '',
      input: raw,
      reason: lenErr,
    };
  }

  // ── Valid
  const result = {
    valid: true,
    type: cls.type,
    e164: toE164(national, cls),
    national,
    display_local: formatLocal(national, cls),
    display_international: formatInternational(national, cls),
    input: raw,
  };

  if (cls.carrier)     result.carrier     = cls.carrier;
  if (cls.carriers)    result.carriers    = cls.carriers;
  if (cls.carrier_he)  result.carrier_he  = cls.carrier_he;
  if (cls.region)      result.region      = cls.region;
  if (cls.region_he)   result.region_he   = cls.region_he;
  if (cls.portable)    result.portable    = cls.portable;
  if (cls.label)       result.label       = cls.label;
  if (cls.label_he)    result.label_he    = cls.label_he;

  return result;
}

/**
 * Parse an Israeli phone into a structured object — always returns a
 * breakdown regardless of validity. Useful for UI-side previews.
 *
 * @param {string} input
 * @returns {object}
 */
function parseIsraeliPhone(input) {
  const raw = input === null || input === undefined ? '' : String(input);
  const { digits, hadPlus } = stripToDigits(raw);

  // Special 3-digit code short-circuit
  if (digits.length === 3 && SPECIAL_CODES[digits]) {
    const info = SPECIAL_CODES[digits];
    return {
      input: raw,
      digits,
      had_plus_prefix: hadPlus,
      national: digits,
      country_code: COUNTRY_CODE,
      type: TYPES.SPECIAL,
      prefix: digits,
      area_code: null,
      carrier: null,
      carriers: null,
      carrier_he: null,
      region: null,
      region_he: null,
      label: info.label,
      label_he: info.he,
      portable: false,
      e164: digits,
      display_local: digits,
      display_international: digits,
    };
  }

  const national = normalizeToNational(raw);
  const cls = national ? classify(national) : { type: TYPES.UNKNOWN };

  return {
    input: raw,
    digits,
    had_plus_prefix: hadPlus,
    national,
    country_code: COUNTRY_CODE,
    type: cls.type,
    prefix: cls.prefix || null,
    area_code: cls.area_code || null,
    carrier: cls.carrier || null,
    carriers: cls.carriers || null,
    carrier_he: cls.carrier_he || null,
    region: cls.region || null,
    region_he: cls.region_he || null,
    label: cls.label || null,
    label_he: cls.label_he || null,
    portable: cls.portable || false,
    e164: national ? toE164(national, cls) : '',
    display_local: national ? formatLocal(national, cls) : '',
    display_international: national ? formatInternational(national, cls) : '',
  };
}

/**
 * Format any accepted input for display.
 *
 * @param {string} phone  raw phone in any accepted form
 * @param {'local'|'international'|'e164'} [mode='local']
 * @returns {string} formatted string, or '' if unparseable
 */
function formatForDisplay(phone, mode = 'local') {
  const national = normalizeToNational(phone);
  if (!national) return '';
  const cls = classify(national);
  if (cls.type === TYPES.UNKNOWN) return '';
  if (checkLength(national, cls)) return '';

  switch (mode) {
    case 'international': return formatInternational(national, cls);
    case 'e164':          return toE164(national, cls);
    case 'local':
    default:              return formatLocal(national, cls);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────

module.exports = {
  // Main API
  validateIsraeliPhone,
  parseIsraeliPhone,
  formatForDisplay,
  // Lower-level helpers (exposed for composition / testing)
  normalizeToNational,
  stripToDigits,
  classify,
  toE164,
  formatLocal,
  formatInternational,
  // Constant tables
  TYPES,
  MOBILE_PREFIXES,
  LANDLINE_AREA_CODES,
  VOIP_PREFIXES,
  SERVICE_PREFIXES,
  SPECIAL_CODES,
  COUNTRY_CODE,
  COUNTRY_CODE_INT,
};
