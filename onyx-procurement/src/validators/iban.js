/**
 * IBAN Validator — ISO 13616 (MOD-97) with Israeli bank-specific parsing.
 *
 * Agent 92 — Kobi's mega-ERP for Techno-Kol Uzi.
 * Wave: payroll / banking primitives.
 *
 * Zero runtime dependencies. Pure CommonJS. Node >= 16 (uses BigInt).
 * Bilingual: Hebrew comments are preserved alongside English.
 *
 * ════════════════════════════════════════════════════════════════════
 * ISO 13616 algorithm / אלגוריתם ISO 13616
 * ════════════════════════════════════════════════════════════════════
 *
 *   1. Remove spaces, uppercase.                 / הסרת רווחים והמרת אותיות גדולות
 *   2. Move first 4 chars to the end.            / העברת 4 תווים ראשונים לסוף
 *   3. Replace letters with numbers              / המרת אותיות למספרים
 *      (A=10, B=11, ..., Z=35).
 *   4. Compute BigInt mod 97; must equal 1.      / חישוב שארית 97 — חייב להיות 1
 *
 * ════════════════════════════════════════════════════════════════════
 * Israeli IBAN format / פורמט IBAN ישראלי
 * ════════════════════════════════════════════════════════════════════
 *
 *   IL<check:2><bank:3><branch:3><account:13> = 23 chars total
 *
 *   IL  62  010  800  0000099999999
 *   │   │   │    │    └── 13-digit account
 *   │   │   │    └─────── 3-digit branch
 *   │   │   └──────────── 3-digit bank code
 *   │   └──────────────── 2-digit check digits
 *   └──────────────────── country code
 *
 * ════════════════════════════════════════════════════════════════════
 * Exports / יצוא
 * ════════════════════════════════════════════════════════════════════
 *
 *   validateIban(iban)      → { valid, country, bank_code?, branch_code?,
 *                                account?, reason?, reason_he? }
 *   parseIsraeliIban(iban)  → { bank, branch, account }
 *   formatIban(iban)        → "IL62 0108 0000 0009 9999 999"
 *   israeliBanks            → { 10: {name_en,name_he}, ... }
 *   IBAN_COUNTRY_LENGTHS    → full ISO 13616 length registry map
 *
 * @module validators/iban
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Israeli banks map / מפת בנקים ישראליים
// ─────────────────────────────────────────────────────────────
//
// NOTE: The canonical mapping used by Kobi's mega-ERP (agent 92 spec).
// Includes both the historical Mizrachi code (20) and the merged Mizrahi-
// Tefahot code (12), both of which appear in legacy Techno-Kol records.
// Also includes the legacy code 77 for Bank of Jerusalem.
//
// הערה: המפה הקנונית של מערכת Kobi ERP. כוללת גם קוד מזרחי ישן (20),
// גם קוד מזרחי-טפחות (12), גם קוד ירושלים חדש (54) וגם הישן (77).

const israeliBanks = Object.freeze({
  4:  { name_en: 'Yahav',               name_he: 'יהב' },
  9:  { name_en: 'Bank of Israel',      name_he: 'בנק ישראל' },
  10: { name_en: 'Leumi',               name_he: 'לאומי' },
  11: { name_en: 'Discount',            name_he: 'דיסקונט' },
  12: { name_en: 'Mizrahi Tefahot',     name_he: 'מזרחי טפחות' },
  13: { name_en: 'Igud',                name_he: 'איגוד' },
  14: { name_en: 'Otzar HaHayal',       name_he: 'אוצר החייל' },
  17: { name_en: 'Merkantil Discount',  name_he: 'מרכנתיל דיסקונט' },
  20: { name_en: 'Mizrachi',            name_he: 'מזרחי' },
  26: { name_en: 'Union Bank',          name_he: 'יובנק' },
  31: { name_en: 'Hapoalim',            name_he: 'הפועלים' },
  34: { name_en: 'Arab Israel Bank',    name_he: 'ערבי ישראלי' },
  46: { name_en: 'Massad',              name_he: 'מסד' },
  52: { name_en: 'Poalei Agudat Israel', name_he: 'פועלי אגודת ישראל' },
  54: { name_en: 'Jerusalem',           name_he: 'ירושלים' },
  59: { name_en: 'Bank SBI',            name_he: 'SBI' },
  65: { name_en: 'First International', name_he: 'הבינלאומי הראשון' },
  68: { name_en: 'Dexia',               name_he: 'דקסיה ישראל' },
  71: { name_en: 'HSBC Israel',         name_he: 'HSBC ישראל' },
  77: { name_en: 'Jerusalem (legacy)',  name_he: 'ירושלים (ישן)' },
  82: { name_en: 'Citibank Israel',     name_he: 'סיטיבנק ישראל' },
  90: { name_en: 'HaDoar / Postal Bank', name_he: 'הדואר' },
  99: { name_en: 'Postal Bank',         name_he: 'בנק הדואר' },
});

// ─────────────────────────────────────────────────────────────
// ISO 13616 country lengths / אורכי IBAN לפי מדינה
// ─────────────────────────────────────────────────────────────
//
// Partial registry — includes every country that the ECBS registry
// publishes lengths for at time of writing. Unknown countries are still
// accepted if the 2-letter prefix is alphabetic and the mod-97 passes,
// but the length check is skipped.

const IBAN_COUNTRY_LENGTHS = Object.freeze({
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28,
  BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28,
  CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24,
  FI: 18, FO: 18, FR: 27,
  GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28,
  IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
  JO: 30,
  KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25,
  MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30,
  NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25,
  QA: 29,
  RO: 24, RS: 22, RU: 33,
  SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26,
  UA: 29,
  VA: 22, VG: 24,
  XK: 20,
});

// ─────────────────────────────────────────────────────────────
// Low-level helpers / עזרים פנימיים
// ─────────────────────────────────────────────────────────────

/**
 * Strip all whitespace (including Unicode) and uppercase.
 * מחרוזת IBAN נקייה: ללא רווחים, רק אותיות גדולות.
 *
 * @param {unknown} iban
 * @returns {string}
 */
function normalizeIban(iban) {
  if (iban === null || iban === undefined) return '';
  return String(iban).replace(/[\s\u00A0\u200E\u200F]+/g, '').toUpperCase();
}

/**
 * Convert letters to numbers per ISO 13616: A=10, B=11, ..., Z=35.
 * המרת אותיות לספרות לפי ISO 13616.
 *
 * @param {string} s
 * @returns {string}
 */
function lettersToDigits(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      // '0'..'9'
      out += ch;
    } else if (code >= 65 && code <= 90) {
      // 'A'..'Z' → (code - 55)  → 10..35
      out += (code - 55).toString();
    } else {
      // illegal char — signal by returning empty; caller should already
      // have rejected invalid chars before this point.
      return '';
    }
  }
  return out;
}

/**
 * Compute the ISO 13616 mod-97 remainder for a normalized IBAN.
 * Returns -1 on any error.
 *
 * @param {string} clean  Already normalized (no spaces, uppercase)
 * @returns {number}
 */
function mod97(clean) {
  if (!clean || clean.length < 4) return -1;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = lettersToDigits(rearranged);
  if (numeric === '') return -1;
  try {
    // BigInt required because an IBAN numeric is up to ~70 digits.
    // BigInt נדרש כי ה-numeric עולה על 2^53.
    const r = BigInt(numeric) % 97n;
    return Number(r);
  } catch (_err) {
    return -1;
  }
}

// ─────────────────────────────────────────────────────────────
// Public API / ממשק ציבורי
// ─────────────────────────────────────────────────────────────

/**
 * Validate an IBAN per ISO 13616 with optional Israeli bank parsing.
 *
 * @param {unknown} iban
 * @returns {{
 *   valid: boolean,
 *   country: string|null,
 *   bank_code?: string,
 *   branch_code?: string,
 *   account?: string,
 *   bank_name_en?: string,
 *   bank_name_he?: string,
 *   reason?: string,
 *   reason_he?: string,
 *   normalized?: string
 * }}
 */
function validateIban(iban) {
  // 1. Null/empty guard ──────────────────────────────
  if (iban === null || iban === undefined) {
    return {
      valid: false,
      country: null,
      reason: 'empty',
      reason_he: 'IBAN ריק',
    };
  }

  const clean = normalizeIban(iban);

  if (clean === '') {
    return {
      valid: false,
      country: null,
      reason: 'empty',
      reason_he: 'IBAN ריק',
    };
  }

  // 2. Basic shape check ─────────────────────────────
  //    Exactly: 2 letters + 2 digits + alphanumerics, length 5..34.
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean)) {
    return {
      valid: false,
      country: clean.length >= 2 ? clean.slice(0, 2) : null,
      reason: 'bad_format',
      reason_he: 'פורמט IBAN לא תקין',
      normalized: clean,
    };
  }

  if (clean.length < 5 || clean.length > 34) {
    return {
      valid: false,
      country: clean.slice(0, 2),
      reason: 'bad_length',
      reason_he: 'אורך IBAN לא חוקי',
      normalized: clean,
    };
  }

  const country = clean.slice(0, 2);

  // 3. Country-specific length check ─────────────────
  const expectedLen = IBAN_COUNTRY_LENGTHS[country];
  if (expectedLen !== undefined && clean.length !== expectedLen) {
    return {
      valid: false,
      country,
      reason: `bad_length_for_${country}:expected_${expectedLen}_got_${clean.length}`,
      reason_he: `אורך IBAN לא נכון למדינה ${country} (צריך ${expectedLen}, התקבל ${clean.length})`,
      normalized: clean,
    };
  }

  // Unknown country = we don't recognize the 2-letter prefix at all.
  // We still compute mod-97, but note it in the reason.
  const isKnownCountry = expectedLen !== undefined;

  // 4. Mod-97 check ──────────────────────────────────
  const rem = mod97(clean);
  if (rem !== 1) {
    return {
      valid: false,
      country,
      reason: rem === -1 ? 'mod97_error' : 'bad_check_digit',
      reason_he: rem === -1
        ? 'שגיאה בחישוב MOD-97'
        : 'ספרת ביקורת שגויה',
      normalized: clean,
    };
  }

  // 5. Build success payload ─────────────────────────
  /** @type {any} */
  const out = {
    valid: true,
    country,
    normalized: clean,
  };

  if (!isKnownCountry) {
    // Still valid mathematically, but mark unknown country so callers
    // can decide whether to accept it.
    out.reason = 'unknown_country';
    out.reason_he = 'מדינה לא מוכרת (חישוב עבר)';
  }

  // For Israel, parse the BBAN into bank / branch / account.
  if (country === 'IL') {
    const parsed = parseIsraeliIban(clean);
    if (parsed) {
      out.bank_code = parsed.bank;
      out.branch_code = parsed.branch;
      out.account = parsed.account;
      const bankEntry = israeliBanks[Number(parsed.bank)];
      if (bankEntry) {
        out.bank_name_en = bankEntry.name_en;
        out.bank_name_he = bankEntry.name_he;
      }
    }
  }

  return out;
}

/**
 * Parse the BBAN portion of an Israeli IBAN into its components.
 * Does NOT validate the checksum — pair with `validateIban` for that.
 *
 * Layout: IL + CC + BBB + SSS + 13 digit account
 *         0..1  2..3  4..6  7..9 10..22
 *
 * @param {unknown} iban
 * @returns {{ bank: string, branch: string, account: string } | null}
 */
function parseIsraeliIban(iban) {
  const clean = normalizeIban(iban);
  if (clean.length !== 23) return null;
  if (clean.slice(0, 2) !== 'IL') return null;
  if (!/^[0-9]{21}$/.test(clean.slice(2))) return null;

  return {
    bank:    clean.slice(4, 7),
    branch:  clean.slice(7, 10),
    account: clean.slice(10, 23),
  };
}

/**
 * Format an IBAN as groups of 4 chars separated by spaces.
 * "IL620108000000099999999" → "IL62 0108 0000 0009 9999 999"
 *
 * Invalid/empty inputs return an empty string (callers should validate
 * first if they care about strictness).
 *
 * @param {unknown} iban
 * @returns {string}
 */
function formatIban(iban) {
  const clean = normalizeIban(iban);
  if (clean === '') return '';
  // Don't format obviously-garbage input — protect callers from
  // accidentally rendering random text as "IBAN".
  if (!/^[A-Z0-9]{5,34}$/.test(clean)) return '';
  const groups = [];
  for (let i = 0; i < clean.length; i += 4) {
    groups.push(clean.slice(i, i + 4));
  }
  return groups.join(' ');
}

// ─────────────────────────────────────────────────────────────
// CommonJS exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  validateIban,
  parseIsraeliIban,
  formatIban,
  normalizeIban,
  israeliBanks,
  IBAN_COUNTRY_LENGTHS,
};
