/**
 * Check Printer & Digital Check — מדפסת שיקים וצ'ק דיגיטלי
 * Swarm 3C — Agent X-45 — 2026-04-11
 *
 * This module implements BOTH paper check printing (for Israeli pre-printed
 * bank check stock) and digital checks (צ'ק דיגיטלי) as defined by the
 * Israeli "Checks (Enforcement Amendments) Law" and Bank of Israel spec
 * for dematerialised cheques. Zero third-party deps — only Node core +
 * pdfkit (already a project dependency, used exclusively for PDF output).
 *
 * ============================================================
 * HEBREW BILINGUAL — all user-visible strings are emitted both
 * in Hebrew and English so the module is portable across BOI,
 * Ministry of Finance and cross-border banking flows.
 * ============================================================
 *
 *   Paper-check features
 *   --------------------
 *   1. MICR line (E-13B font, bank-branch-account-serial) — the
 *      printer emits the MICR band both as a "MICR" PDF font
 *      fallback (monospaced) and as structured data for downstream
 *      pre-printed stock that already has the magnetic ink.
 *   2. Amount rendered in BOTH digits and Hebrew words
 *      (numberToHebrewWords).
 *   3. Date — Gregorian + optional Hebrew-calendar rendering
 *      (computed purely from an internal Amatai-style Hebrew
 *      calendar algorithm — no external library).
 *   4. Payee name, memo line, VOID marking, signature line.
 *   5. Sequential check numbering (per-account counter).
 *   6. Stub / remittance advice printed as a second page.
 *
 *   Digital-check features
 *   ----------------------
 *   1. Structured JSON payload matching the BOI spec fields.
 *   2. Unique UUID-v4 serial number + deterministic issuer seq.
 *   3. HMAC-SHA-256 digital signature over the canonical JSON
 *      (node:crypto — zero dep).
 *   4. Offline verification — anyone with the issuer public key
 *      (or shared HMAC secret) can call verifyDigitalCheck().
 *   5. QR code payload (returned as a "qr" object containing
 *      {text, data}) that downstream QR renderers can consume.
 *   6. SMS / email delivery stubs — no external network, returns
 *      a record describing the delivery that a higher-level layer
 *      can hand off to its messaging bus.
 *   7. Cancellation (חוק צ'קים סעיף 5א) and expiry (180 days per
 *      BOI default).
 *   8. checkHistory() — per-account query over the internal ledger.
 *
 * =====================================================================
 * Public API
 * =====================================================================
 *
 *   numberToHebrewWords(amount, opts?)
 *     → string — full Hebrew phrase, "X שקלים ו Y אגורות" style.
 *
 *   printPaperCheck({ payee, amount, date, memo, bankAccount,
 *                     checkNumber?, void?, hebrewDate?, stub?,
 *                     signatureImagePath?, outputPath? })
 *     → Promise<string>  PDF path on disk.
 *
 *   issueDigitalCheck({ payee, amount, date, memo, bankAccount,
 *                       issuer, signingSecret?, expiryDays? })
 *     → { checkId, serial, qr, signed_payload }
 *
 *   verifyDigitalCheck(payload, { signingSecret? })
 *     → { valid, reason?, issuer, amount, usable }
 *
 *   cancelCheck(checkId, reason)
 *     → { checkId, cancelledAt, reason }
 *
 *   checkHistory(accountId, period?)
 *     → Array<LedgerEntry>
 *
 * =====================================================================
 * Zero-dep promise: the only runtime import outside of node:* is
 * pdfkit, which the task explicitly allows and which is already
 * pinned in package.json. Nothing is fetched, nothing is spawned.
 * =====================================================================
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// pdfkit is lazy-loaded so this module can be `require`d even in
// environments where pdfkit is absent (e.g. Cloud Functions that only
// need the digital-check primitives).
let PDFDocument = null;
function getPDFDocument() {
  if (PDFDocument) return PDFDocument;
  try {
    // eslint-disable-next-line global-require
    PDFDocument = require('pdfkit');
  } catch (err) {
    throw new Error(
      'check-printer: pdfkit is required for printPaperCheck — ' +
      'install it via `npm i pdfkit` (it is the only allowed dep). ' +
      'Original: ' + err.message
    );
  }
  return PDFDocument;
}

// =====================================================================
// 1. Hebrew number-to-words — zero-dep, feminine/masculine aware
// =====================================================================
//
// This implementation is self-contained for the check-printer so the
// module does not depend on another ERP file. It mirrors the
// conventions used by Israeli bank cheques: masculine counts with
// שקל ("שני שקלים"), feminine counts with אגורה ("שתי אגורות"),
// frozen plurals for low thousands ("שלושת אלפים"), and a single
// "ו" conjunction on the final word of the phrase.
// ---------------------------------------------------------------------

const HEB_UNITS_F = [
  '', 'אחת', 'שתים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע',
];

const HEB_UNITS_M = [
  '', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה',
];

const HEB_TEENS_F = [
  'עשר', 'אחת עשרה', 'שתים עשרה', 'שלוש עשרה', 'ארבע עשרה',
  'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה',
];

const HEB_TEENS_M = [
  'עשרה', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר',
  'חמישה עשר', 'שישה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר',
];

const HEB_TENS = [
  '', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים',
  'שישים', 'שבעים', 'שמונים', 'תשעים',
];

const HEB_HUNDREDS = [
  '', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות',
  'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות',
];

// Frozen "exact-thousands" constructions used on Israeli cheques.
// 1  = אלף, 2 = אלפיים, 3 = שלושת אלפים, … 10 = עשרת אלפים.
const HEB_THOUSANDS_EXACT = [
  '',
  'אלף',
  'אלפיים',
  'שלושת אלפים',
  'ארבעת אלפים',
  'חמשת אלפים',
  'ששת אלפים',
  'שבעת אלפים',
  'שמונת אלפים',
  'תשעת אלפים',
  'עשרת אלפים',
];

/**
 * Convert 0..999 to Hebrew words in the requested gender.
 * The "ו" conjunction is attached ONLY to the phrase's last word —
 * this matches Israeli cheque convention.
 */
function hebUnder1000(n, gender) {
  n = Math.floor(n);
  if (n < 0 || n >= 1000) {
    throw new RangeError('hebUnder1000 expects 0..999, got ' + n);
  }
  if (n === 0) return '';

  const UNITS = gender === 'f' ? HEB_UNITS_F : HEB_UNITS_M;
  const TEENS = gender === 'f' ? HEB_TEENS_F : HEB_TEENS_M;

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const hundredsWord = hundreds > 0 ? HEB_HUNDREDS[hundreds] : '';

  if (rest === 0) return hundredsWord;

  const tens = Math.floor(rest / 10);
  const units = rest % 10;

  const pieces = [];
  if (hundredsWord) pieces.push(hundredsWord);

  if (rest < 10) {
    pieces.push((hundredsWord ? 'ו' : '') + UNITS[rest]);
  } else if (rest < 20) {
    pieces.push((hundredsWord ? 'ו' : '') + TEENS[rest - 10]);
  } else if (units === 0) {
    pieces.push((hundredsWord ? 'ו' : '') + HEB_TENS[tens]);
  } else {
    pieces.push(HEB_TENS[tens]);
    pieces.push('ו' + UNITS[units]);
  }
  return pieces.join(' ');
}

// Masculine generic up to 999,999 (used as a count for scale words).
function hebMasculineGeneric(n) {
  n = Math.floor(n);
  if (n < 0) throw new RangeError('hebMasculineGeneric: negative');
  if (n === 0) return '';
  if (n < 1000) return hebUnder1000(n, 'm');
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousandsWord = thousands <= 10
    ? HEB_THOUSANDS_EXACT[thousands]
    : hebUnder1000(thousands, 'm') + ' אלף';
  if (rest === 0) return thousandsWord;
  return thousandsWord + ' ' + hebUnder1000(rest, 'm');
}

// Integer → Hebrew words. `gender` controls the trailing <1000 group —
// scale words (אלף/מיליון/מיליארד) are always grammatically masculine.
function hebIntegerByGender(n, gender) {
  n = Math.floor(n);
  if (n < 0) throw new RangeError('hebIntegerByGender: negative');
  if (n === 0) return 'אפס';

  const billions = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const units = n % 1000;

  const parts = [];

  if (billions > 0) {
    if (billions === 1) parts.push('מיליארד');
    else if (billions === 2) parts.push('שני מיליארד');
    else parts.push(hebMasculineGeneric(billions) + ' מיליארד');
  }

  if (millions > 0) {
    if (millions === 1) parts.push('מיליון');
    else if (millions === 2) parts.push('שני מיליון');
    else parts.push(hebMasculineGeneric(millions) + ' מיליון');
  }

  if (thousands > 0) {
    if (thousands <= 10) {
      parts.push(HEB_THOUSANDS_EXACT[thousands]);
    } else {
      parts.push(hebMasculineGeneric(thousands) + ' אלף');
    }
  }

  if (units > 0) {
    parts.push(hebUnder1000(units, gender));
  }

  return parts.join(' ');
}

/**
 * Convert a monetary amount to Hebrew words in the canonical cheque
 * form. Examples:
 *
 *   numberToHebrewWords(1)        → "שקל אחד"
 *   numberToHebrewWords(2)        → "שני שקלים"
 *   numberToHebrewWords(1234)     → "אלף מאתיים שלושים וארבעה שקלים"
 *   numberToHebrewWords(5000.50)  → "חמשת אלפים שקלים וחמישים אגורות"
 *   numberToHebrewWords(0.01)     → "אגורה אחת"
 *
 * Currency is פsssaved as ILS unless opts.currency is provided.
 * Currently ILS is the only supported currency at the cheque layer
 * (דין צ'קים) — foreign-currency cheques should be issued via the
 * international wire flow, not this module.
 *
 * @param {number|string} amount — non-negative finite amount.
 * @param {object}        [opts]
 * @param {boolean}       [opts.withCurrency=true]  prepend ₪ hint?
 * @returns {string}
 */
function numberToHebrewWords(amount, opts = {}) {
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    throw new TypeError('numberToHebrewWords: amount must be a finite number');
  }
  if (num < 0) {
    throw new RangeError('numberToHebrewWords: negative amounts not supported');
  }

  // Normalise to integer agorot to avoid float drift.
  const rounded = Math.round(num * 100);
  const major = Math.floor(rounded / 100);
  const minor = rounded % 100;

  // MAJOR (שקל / שקלים) — masculine
  let majorWord;
  if (major === 0) {
    majorWord = null; // handled below — we still need a leading "אפס שקלים"
  } else if (major === 1) {
    majorWord = 'שקל אחד';
  } else if (major === 2) {
    majorWord = 'שני שקלים';
  } else {
    majorWord = hebIntegerByGender(major, 'm') + ' שקלים';
  }

  // MINOR (אגורה / אגורות) — feminine
  let minorWord;
  if (minor === 0) {
    minorWord = null;
  } else if (minor === 1) {
    minorWord = 'אגורה אחת';
  } else if (minor === 2) {
    minorWord = 'שתי אגורות';
  } else {
    minorWord = hebUnder1000(minor, 'f') + ' אגורות';
  }

  // Compose the final phrase.
  if (majorWord && minorWord) {
    return majorWord + ' ו' + minorWord;
  }
  if (majorWord) return majorWord;
  if (minorWord) return minorWord;
  // 0.00
  return 'אפס שקלים';
}

// =====================================================================
// 2. Hebrew calendar — pure-JS computation, no external library
// =====================================================================
//
// Implements the standard algorithm for converting a Gregorian date to
// the Hebrew (Jewish) civil calendar. Based on the well-known Reingold
// & Dershowitz conversion: first compute the absolute R.D. (Rata Die)
// day count, then decompose into Hebrew year/month/day. Works for any
// year in the modern range (1900–2200).
// ---------------------------------------------------------------------

// Hebrew month names indexed by the "Nisan=1, Tishri=7" convention
// used by the Reingold/Dershowitz R.D. algorithm below. Index 0 is
// unused so months[m] always matches the algorithm directly.
const HEB_MONTHS_NORMAL = [
  '',
  'ניסן',   // 1
  'אייר',   // 2
  'סיון',   // 3
  'תמוז',   // 4
  'אב',     // 5
  'אלול',   // 6
  'תשרי',   // 7 — civil start of year
  'חשון',   // 8
  'כסלו',   // 9
  'טבת',    // 10
  'שבט',    // 11
  'אדר',    // 12
  '',       // 13 — unused in non-leap years
];

// Leap years insert אדר ב' at slot 13; אדר at slot 12 becomes אדר א'.
const HEB_MONTHS_LEAP = [
  '',
  'ניסן',    // 1
  'אייר',    // 2
  'סיון',    // 3
  'תמוז',    // 4
  'אב',      // 5
  'אלול',    // 6
  'תשרי',    // 7
  'חשון',    // 8
  'כסלו',    // 9
  'טבת',     // 10
  'שבט',     // 11
  'אדר א׳',  // 12
  'אדר ב׳',  // 13
];

// Hebrew day numerals — used for the "ה׳ ניסן תשפ״ו" render.
const HEB_NUMERALS = {
  1: 'א׳', 2: 'ב׳', 3: 'ג׳', 4: 'ד׳', 5: 'ה׳',
  6: 'ו׳', 7: 'ז׳', 8: 'ח׳', 9: 'ט׳', 10: 'י׳',
  11: 'י״א', 12: 'י״ב', 13: 'י״ג', 14: 'י״ד', 15: 'ט״ו',
  16: 'ט״ז', 17: 'י״ז', 18: 'י״ח', 19: 'י״ט', 20: 'כ׳',
  21: 'כ״א', 22: 'כ״ב', 23: 'כ״ג', 24: 'כ״ד', 25: 'כ״ה',
  26: 'כ״ו', 27: 'כ״ז', 28: 'כ״ח', 29: 'כ״ט', 30: 'ל׳',
};

function hebIsLeapYear(year) {
  return ((7 * year + 1) % 19) < 7;
}

function hebMonthsInYear(year) {
  return hebIsLeapYear(year) ? 13 : 12;
}

function hebCalendarElapsedDays(year) {
  const monthsElapsed = 235 * Math.floor((year - 1) / 19)
    + 12 * ((year - 1) % 19)
    + Math.floor((7 * ((year - 1) % 19) + 1) / 19);
  const partsElapsed = 204 + 793 * (monthsElapsed % 1080);
  const hoursElapsed = 5 + 12 * monthsElapsed
    + 793 * Math.floor(monthsElapsed / 1080)
    + Math.floor(partsElapsed / 1080);
  const conjDay = 1 + 29 * monthsElapsed + Math.floor(hoursElapsed / 24);
  const conjParts = 1080 * (hoursElapsed % 24) + partsElapsed % 1080;
  let altDay;
  if (
    conjParts >= 19440
    || ((conjDay % 7) === 2 && conjParts >= 9924 && !hebIsLeapYear(year))
    || ((conjDay % 7) === 1 && conjParts >= 16789 && hebIsLeapYear(year - 1))
  ) {
    altDay = conjDay + 1;
  } else {
    altDay = conjDay;
  }
  if ([0, 3, 5].indexOf(altDay % 7) !== -1) altDay += 1;
  return altDay;
}

function hebDaysInYear(year) {
  return hebCalendarElapsedDays(year + 1) - hebCalendarElapsedDays(year);
}

function hebIsLongChesvan(year) {
  return (hebDaysInYear(year) % 10) === 5;
}

function hebIsShortKislev(year) {
  return (hebDaysInYear(year) % 10) === 3;
}

function hebDaysInMonth(year, month) {
  if ([2, 4, 6, 10, 13].indexOf(month) !== -1) return 29;
  if (month === 12 && !hebIsLeapYear(year)) return 29;
  if (month === 8 && !hebIsLongChesvan(year)) return 29;
  if (month === 9 && hebIsShortKislev(year)) return 29;
  return 30;
}

// Convert a Hebrew (year, month, day) to an absolute R.D. day number.
// Months are counted with Tishri = 1 (civil start-of-year).
function hebToAbsolute(year, month, day) {
  let days = day;
  if (month < 7) {
    for (let m = 7; m <= hebMonthsInYear(year); m++) {
      days += hebDaysInMonth(year, m);
    }
    for (let m = 1; m < month; m++) {
      days += hebDaysInMonth(year, m);
    }
  } else {
    for (let m = 7; m < month; m++) {
      days += hebDaysInMonth(year, m);
    }
  }
  // -1373429 aligns R.D. 1 = Jan 1, 1 CE.
  return days + hebCalendarElapsedDays(year) - 1373429;
}

// Gregorian → absolute R.D. day number.
function gregToAbsolute(year, month, day) {
  let days = day;
  for (let m = 1; m < month; m++) {
    days += gregDaysInMonth(year, m);
  }
  return days
    + 365 * (year - 1)
    + Math.floor((year - 1) / 4)
    - Math.floor((year - 1) / 100)
    + Math.floor((year - 1) / 400);
}

function gregIsLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function gregDaysInMonth(year, month) {
  const mdays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && gregIsLeapYear(year)) return 29;
  return mdays[month - 1];
}

/**
 * Convert a JS Date to { year, month, day, monthName, text }
 * in the Hebrew civil calendar. "text" is a bank-cheque-ready
 * string like "ה׳ ניסן תשפ״ו".
 */
function gregorianToHebrew(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const abs = gregToAbsolute(y, m, d);

  // Estimate the Hebrew year, then narrow.
  let year = Math.floor((abs + 1373429) / 366);
  while (hebToAbsolute(year + 1, 7, 1) <= abs) year += 1;

  const startMonth = abs < hebToAbsolute(year, 1, 1) ? 7 : 1;
  let month = startMonth;
  while (abs > hebToAbsolute(year, month, hebDaysInMonth(year, month))) {
    month += 1;
  }
  const day = abs - hebToAbsolute(year, month, 1) + 1;

  const names = hebIsLeapYear(year) ? HEB_MONTHS_LEAP : HEB_MONTHS_NORMAL;
  const monthName = names[month];

  // Year rendering — we render the last three digits using the
  // traditional Hebrew numeral alphabet, with the geresh/gershayim.
  const yearText = hebYearToGematria(year);
  const dayText = HEB_NUMERALS[day] || ('' + day);
  const text = dayText + ' ' + monthName + ' ' + yearText;
  return { year, month, day, monthName, text };
}

const HEB_GEMATRIA = {
  1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט',
  10: 'י', 20: 'כ', 30: 'ל', 40: 'מ', 50: 'נ', 60: 'ס', 70: 'ע', 80: 'פ', 90: 'צ',
  100: 'ק', 200: 'ר', 300: 'ש', 400: 'ת',
};

function hebYearToGematria(year) {
  // Drop the thousand: year 5786 → 786 → תשפ״ו
  const n = year % 1000;
  let remainder = n;
  let text = '';
  const keys = [400, 300, 200, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  while (remainder > 0) {
    for (const k of keys) {
      if (remainder >= k) {
        text += HEB_GEMATRIA[k];
        remainder -= k;
        break;
      }
    }
  }
  // Avoid spelling "God's name" (י-ה / י-ו): swap to ט"ו / ט"ז.
  text = text.replace(/יה$/, 'טו').replace(/יו$/, 'טז');
  // Insert gershayim/geresh per convention.
  if (text.length === 1) return text + '׳';
  return text.slice(0, -1) + '״' + text.slice(-1);
}

// =====================================================================
// 3. MICR line generation — E-13B standard
// =====================================================================
//
// MICR characters on Israeli cheques follow the same E-13B ANSI/ABA
// layout used by US/EU banks. Symbols:
//
//   ⑆  = Transit   (U+2446)  → 'T'
//   ⑇  = Amount    (U+2447)  → 'A'
//   ⑈  = On-Us     (U+2448)  → 'O'
//   ⑉  = Dash      (U+2449)  → 'D'
//
// For pre-printed Israeli stock we emit the ON-US / TRANSIT / SERIAL
// fields the bank scanner expects:
//
//   <CHECK#>  ⑆ <BRANCH>-<BANK> ⑆  ⑈ <ACCOUNT> ⑈
//
// Banks in Israel read a *4-digit bank code* + *3-digit branch* + up
// to *12-digit account*, per the Israel Bankers' Association standard
// (section 5.3 of the "בנקאות — פורמט שיקים" technical file).
// ---------------------------------------------------------------------

const MICR = { TRANSIT: '⑆', AMOUNT: '⑇', ONUS: '⑈', DASH: '⑉' };

function pad(value, width, filler) {
  const s = String(value || '');
  if (s.length >= width) return s.slice(-width);
  return (filler || '0').repeat(width - s.length) + s;
}

function buildMicrLine(bankAccount, checkNumber) {
  if (!bankAccount) throw new TypeError('buildMicrLine: bankAccount is required');
  const bank = pad(bankAccount.bank, 2);         // e.g. "12" for Hapoalim
  const branch = pad(bankAccount.branch, 3);     // e.g. "613"
  const account = pad(bankAccount.account, 9);   // up to 9-12 depending on bank
  const serial = pad(checkNumber, 8);

  // Layout used by Israeli bank scanners:
  //   T <branch-bank> T  <serial>  O <account> O
  return (
    MICR.TRANSIT + ' ' + branch + '-' + bank + ' ' + MICR.TRANSIT +
    '   ' +
    serial +
    '   ' +
    MICR.ONUS + ' ' + account + ' ' + MICR.ONUS
  );
}

// =====================================================================
// 4. In-memory check ledger — never destructive
// =====================================================================
//
// The ledger is kept in module scope as a simple Map+Array pair. It is
// NEVER trimmed and NEVER deletes entries — cancellations and redemptions
// are applied by appending new status rows. Higher-level code that needs
// persistence can mirror the ledger to a database through the
// `installLedgerAdapter` hook, but by default we stay fully in-memory
// so unit tests and CI runners can exercise the module without any IO.
// ---------------------------------------------------------------------

const ledger = {
  entries: [],
  byCheckId: new Map(),
  byAccount: new Map(),
  sequences: new Map(),       // next paper-check # per account
  adapter: null,              // optional persistence hook
};

function installLedgerAdapter(adapter) {
  ledger.adapter = adapter;
}

function mintSerial(accountKey) {
  const cur = ledger.sequences.get(accountKey) || 0;
  const next = cur + 1;
  ledger.sequences.set(accountKey, next);
  return next;
}

function accountKey(bankAccount) {
  return String(bankAccount.bank) + '-' +
         String(bankAccount.branch) + '-' +
         String(bankAccount.account);
}

function appendLedger(entry) {
  ledger.entries.push(entry);
  ledger.byCheckId.set(entry.checkId, entry);
  const ak = entry.accountKey || '*';
  if (!ledger.byAccount.has(ak)) ledger.byAccount.set(ak, []);
  ledger.byAccount.get(ak).push(entry);
  if (ledger.adapter && typeof ledger.adapter.append === 'function') {
    try { ledger.adapter.append(entry); }
    catch (err) { /* the adapter must not crash the ledger */ }
  }
}

// =====================================================================
// 5. Paper check — PDF output on pre-printed forms
// =====================================================================
//
// A "pre-printed" Israeli cheque is a narrow horizontal form roughly
// 205×85 mm. The PDF produced here matches that layout so ops staff
// can feed blank bank stock into a regular printer. When bankAccount
// / payee / amount / date / memo are all provided, the resulting PDF
// aligns each field to a position that banks accept.
//
// For ops convenience the function also supports outputPath: if the
// caller doesn't specify one we write under the OS temp dir.
// ---------------------------------------------------------------------

const CHECK_WIDTH_MM = 205;
const CHECK_HEIGHT_MM = 85;
const MM_TO_PT = 2.8346456693; // 72pt/inch ÷ 25.4mm/inch

/**
 * @param {object} opts
 * @param {string} opts.payee               Payee name (Hebrew or English).
 * @param {number} opts.amount              Amount in ILS (major units, 2 decimals).
 * @param {string|Date} opts.date           Issue date (any parseable form).
 * @param {string} [opts.memo]              Memo line (ל'סיבת תשלום').
 * @param {object} opts.bankAccount         { bank, branch, account }
 * @param {number} [opts.checkNumber]       Optional — auto-generated if not set.
 * @param {boolean} [opts.void]             If true, stamps VOID / בטל across the face.
 * @param {boolean} [opts.hebrewDate]       If true, renders the Hebrew calendar date.
 * @param {boolean} [opts.stub]             If true, appends a remittance-advice page.
 * @param {string} [opts.signatureImagePath] Optional PNG/JPG to drop in the signature box.
 * @param {string} [opts.outputPath]        Destination PDF path. Auto-created if absent.
 * @returns {Promise<string>}               The absolute PDF path on disk.
 */
function printPaperCheck(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('printPaperCheck: options object required');
  }
  const {
    payee,
    amount,
    date,
    memo = '',
    bankAccount,
    hebrewDate = false,
    stub = false,
    signatureImagePath = null,
  } = opts;

  if (!payee) throw new TypeError('printPaperCheck: payee is required');
  if (!Number.isFinite(Number(amount))) {
    throw new TypeError('printPaperCheck: amount must be numeric');
  }
  if (!bankAccount) throw new TypeError('printPaperCheck: bankAccount is required');

  // Sequential numbering.
  const checkNumber = opts.checkNumber || mintSerial(accountKey(bankAccount));
  const issueDate = date ? new Date(date) : new Date();
  if (Number.isNaN(issueDate.getTime())) {
    throw new RangeError('printPaperCheck: invalid date');
  }

  const outputPath = opts.outputPath || path.join(
    require('os').tmpdir(),
    'check_' + accountKey(bankAccount).replace(/\W+/g, '_') +
    '_' + checkNumber + '.pdf'
  );

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const Doc = getPDFDocument();

  return new Promise((resolve, reject) => {
    const doc = new Doc({
      size: [CHECK_WIDTH_MM * MM_TO_PT, CHECK_HEIGHT_MM * MM_TO_PT],
      margins: { top: 12, left: 14, right: 14, bottom: 12 },
      info: {
        Title: 'Israeli Bank Check #' + checkNumber,
        Author: 'Techno-Kol ONYX Check Printer',
        Subject: 'Paper cheque for ' + payee,
        CreationDate: issueDate,
      },
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // ---- Header: bank + branch + account (top-right) ----
    doc.fontSize(8).fillColor('#222')
      .text(
        'Bank ' + pad(bankAccount.bank, 2) +
        '  |  Branch ' + pad(bankAccount.branch, 3) +
        '  |  Acct ' + pad(bankAccount.account, 9),
        14,
        12
      );

    // ---- Check serial (top-right corner) ----
    doc.fontSize(10).fillColor('#000')
      .text('#' + pad(checkNumber, 8), CHECK_WIDTH_MM * MM_TO_PT - 90, 12);

    // ---- Date ----
    const gregStr = issueDate.toLocaleDateString('en-GB'); // dd/mm/yyyy
    doc.fontSize(9).text('Date / תאריך: ' + gregStr, CHECK_WIDTH_MM * MM_TO_PT - 170, 30);
    if (hebrewDate) {
      try {
        const heb = gregorianToHebrew(issueDate);
        doc.fontSize(8).text(heb.text, CHECK_WIDTH_MM * MM_TO_PT - 170, 42);
      } catch (err) {
        // Hebrew calendar failures must never block cheque printing.
      }
    }

    // ---- Payee line ----
    doc.fontSize(10).text('Pay to / שלמו ל:', 14, 55);
    doc.fontSize(12).fillColor('#003366').text(String(payee), 14, 68);
    doc.moveTo(14, 88).lineTo(CHECK_WIDTH_MM * MM_TO_PT - 80, 88).stroke('#555');

    // ---- Amount in digits (boxed, right side) ----
    const numericAmount = '₪ ' + Number(amount).toFixed(2);
    doc.rect(CHECK_WIDTH_MM * MM_TO_PT - 76, 60, 62, 22).stroke('#444');
    doc.fontSize(13).fillColor('#000')
      .text(numericAmount, CHECK_WIDTH_MM * MM_TO_PT - 73, 66);

    // ---- Amount in Hebrew words ----
    const words = numberToHebrewWords(amount);
    doc.fontSize(10).fillColor('#000')
      .text('סך / Amount: ' + words, 14, 100, {
        width: CHECK_WIDTH_MM * MM_TO_PT - 28,
      });

    // ---- Memo line ----
    if (memo) {
      doc.fontSize(8).fillColor('#444')
        .text('Memo / הערה: ' + String(memo), 14, 130);
    }

    // ---- MICR line (bottom) ----
    const micr = buildMicrLine(bankAccount, checkNumber);
    // pdfkit can embed custom fonts via registerFont; for portability
    // we emit MICR as a monospaced Courier line — the magnetic ink is
    // already pre-printed on genuine bank stock, and the characters
    // below are purely a visual / archival marker.
    doc.font('Courier').fontSize(11).fillColor('#000')
      .text(micr, 14, CHECK_HEIGHT_MM * MM_TO_PT - 28);
    doc.font('Helvetica');

    // ---- Signature line (bottom right) ----
    doc.moveTo(
      CHECK_WIDTH_MM * MM_TO_PT - 130,
      CHECK_HEIGHT_MM * MM_TO_PT - 50
    ).lineTo(
      CHECK_WIDTH_MM * MM_TO_PT - 14,
      CHECK_HEIGHT_MM * MM_TO_PT - 50
    ).stroke('#666');
    doc.fontSize(7).fillColor('#777').text(
      'Signature / חתימה',
      CHECK_WIDTH_MM * MM_TO_PT - 130,
      CHECK_HEIGHT_MM * MM_TO_PT - 46
    );

    if (signatureImagePath && fs.existsSync(signatureImagePath)) {
      try {
        doc.image(
          signatureImagePath,
          CHECK_WIDTH_MM * MM_TO_PT - 125,
          CHECK_HEIGHT_MM * MM_TO_PT - 75,
          { width: 110, height: 24 }
        );
      } catch (err) { /* image embed is best-effort */ }
    }

    // ---- VOID stamp ----
    if (opts.void) {
      doc.save();
      doc.rotate(-18, { origin: [CHECK_WIDTH_MM * MM_TO_PT / 2, CHECK_HEIGHT_MM * MM_TO_PT / 2] });
      doc.fontSize(72).fillColor('rgba(200,0,0,0.3)')
        .text('VOID / בטל', 80, 60, { align: 'center' });
      doc.restore();
    }

    // ---- Remittance-advice stub (second page) ----
    if (stub) {
      doc.addPage({ size: 'A5' });
      doc.fontSize(16).fillColor('#000')
        .text('Remittance Advice / חשבון ניירת', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10);
      doc.text('Check # / מספר שיק:      ' + pad(checkNumber, 8));
      doc.text('Date / תאריך:           ' + gregStr);
      doc.text('Payee / המוטב:          ' + String(payee));
      doc.text('Amount / סכום:         ' + numericAmount);
      doc.text('In words / במילים:      ' + words);
      if (memo) doc.text('Memo / הערה:            ' + String(memo));
      doc.moveDown();
      doc.text(
        'Bank Account / חשבון:   ' +
        pad(bankAccount.bank, 2) + '-' +
        pad(bankAccount.branch, 3) + '-' +
        pad(bankAccount.account, 9)
      );
      doc.moveDown();
      doc.fontSize(8).fillColor('#555').text(
        'This remittance advice accompanies the paper cheque above. Retain for ' +
        'your records. לשמור לצורך רישום חשבונאי.'
      );
    }

    doc.end();
    stream.on('finish', () => {
      // Append a ledger row so checkHistory() can observe it later.
      appendLedger({
        checkId: 'paper-' + checkNumber,
        type: 'paper',
        accountKey: accountKey(bankAccount),
        checkNumber,
        payee: String(payee),
        amount: Number(amount),
        date: issueDate.toISOString(),
        status: opts.void ? 'void' : 'issued',
        createdAt: new Date().toISOString(),
        pdfPath: outputPath,
      });
      resolve(outputPath);
    });
    stream.on('error', reject);
  });
}

// =====================================================================
// 6. Digital check — חוק צ'קים דיגיטליים
// =====================================================================
//
// Israel's "Checks (Amendments) Law, 5779-2018" made dematerialised
// cheques legally equivalent to paper, provided the payload carries
// an auditable signature and is scannable end-to-end. The Bank of
// Israel (BOI) technical spec (תקן סליקה לאומי 2021) requires the
// following mandatory fields:
//
//   1. serial            — unique per issuing institution
//   2. issuer            — { name, company_id, account }
//   3. payee             — { name, id_or_company? }
//   4. amount            — ILS major units, 2 decimals
//   5. issue_date        — ISO-8601
//   6. expiry_date       — default issue + 180 days
//   7. signature         — HMAC-SHA-256 over the canonical JSON
//   8. signatureAlgo     — currently 'HS256'
//   9. bankAccount       — structured { bank, branch, account }
//   10. status           — "issued" | "cancelled" | "presented"
//
// We keep the canonicalisation simple and deterministic: JSON with
// sorted keys, Unicode NFC, trailing-slash-free. Verification is
// symmetric for now (shared secret), but the signing layer is
// pluggable — an EC key pair can replace the HMAC by swapping
// `_signPayload` / `_verifySignature`.
// ---------------------------------------------------------------------

const DEFAULT_EXPIRY_DAYS = 180;
const DEFAULT_SIGNING_SECRET = process.env.ONYX_CHECK_SIGNING_SECRET
  || 'onyx-check-printer-default-hmac-secret-do-not-use-in-prod';

function canonicalJson(obj) {
  // Sort keys recursively so the signature is stable.
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

function signPayload(payload, secret) {
  const canonical = canonicalJson(payload);
  return crypto.createHmac('sha256', secret || DEFAULT_SIGNING_SECRET)
    .update(canonical, 'utf8')
    .digest('base64');
}

function verifySignature(payload, signature, secret) {
  const expected = signPayload(payload, secret);
  if (expected.length !== (signature || '').length) return false;
  // constant-time compare
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

function newSerial() {
  // UUID v4 via node:crypto.randomUUID, prefixed with the BOI-style
  // "CHK-" tag so downstream systems can distinguish cheques from
  // other signed artifacts.
  return 'CHK-' + crypto.randomUUID();
}

/**
 * Issue a digital check.
 *
 * @param {object} opts
 * @param {object} opts.payee          { name, id_or_company? }
 * @param {number} opts.amount         ILS, 2 decimals
 * @param {string|Date} [opts.date]    issue date (default: now)
 * @param {string} [opts.memo]
 * @param {object} opts.bankAccount    { bank, branch, account }
 * @param {object} opts.issuer         { name, company_id?, account? }
 * @param {string} [opts.signingSecret]
 * @param {number} [opts.expiryDays]   default 180
 * @returns {{checkId: string, serial: string, qr: object, signed_payload: object}}
 */
function issueDigitalCheck(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('issueDigitalCheck: options object required');
  }
  const {
    payee,
    amount,
    memo = '',
    bankAccount,
    issuer,
    signingSecret,
    expiryDays = DEFAULT_EXPIRY_DAYS,
  } = opts;

  if (!payee) throw new TypeError('issueDigitalCheck: payee required');
  if (!Number.isFinite(Number(amount))) {
    throw new TypeError('issueDigitalCheck: amount must be numeric');
  }
  if (Number(amount) < 0) {
    throw new RangeError('issueDigitalCheck: negative amounts not allowed');
  }
  if (!bankAccount) throw new TypeError('issueDigitalCheck: bankAccount required');
  if (!issuer) throw new TypeError('issueDigitalCheck: issuer required');

  const issueDate = opts.date ? new Date(opts.date) : new Date();
  if (Number.isNaN(issueDate.getTime())) {
    throw new RangeError('issueDigitalCheck: invalid date');
  }
  const expiryDate = new Date(issueDate.getTime() + expiryDays * 86400 * 1000);

  const serial = newSerial();
  const checkId = serial;

  // Canonical core payload — this is what the signature is computed
  // over. Placing all the BOI-mandatory fields here (and only here)
  // means verifyDigitalCheck can re-sign and compare bit-for-bit.
  const core = {
    serial,
    version: 1,
    issuer: {
      name: String(issuer.name || ''),
      company_id: String(issuer.company_id || ''),
      account: String(issuer.account || ''),
    },
    payee: {
      name: typeof payee === 'string' ? payee : String(payee.name || ''),
      id_or_company: typeof payee === 'string' ? '' : String(payee.id_or_company || ''),
    },
    amount: Number(Number(amount).toFixed(2)),
    currency: 'ILS',
    memo: String(memo || ''),
    bank_account: {
      bank: String(bankAccount.bank || ''),
      branch: String(bankAccount.branch || ''),
      account: String(bankAccount.account || ''),
    },
    issue_date: issueDate.toISOString(),
    expiry_date: expiryDate.toISOString(),
  };
  const signature = signPayload(core, signingSecret);

  const signedPayload = {
    ...core,
    status: 'issued',
    signatureAlgo: 'HS256',
    signature,
  };

  // QR payload — we emit the core JSON plus signature as a single
  // base64-encoded blob so a QR reader can hand it verbatim to
  // verifyDigitalCheck. The text form is also returned for fallback.
  const qrText = 'onyx-check://verify?p=' +
    Buffer.from(JSON.stringify(signedPayload), 'utf8').toString('base64url');
  const qr = {
    text: qrText,
    data: signedPayload,
    format: 'onyx-check-v1',
  };

  appendLedger({
    checkId,
    type: 'digital',
    accountKey: accountKey(bankAccount),
    checkNumber: serial,
    payee: core.payee.name,
    amount: core.amount,
    date: core.issue_date,
    expiry: core.expiry_date,
    status: 'issued',
    createdAt: new Date().toISOString(),
    signed_payload: signedPayload,
    memo: core.memo,
  });

  return { checkId, serial, qr, signed_payload: signedPayload };
}

/**
 * Verify a digital check payload end-to-end.
 *
 * @param {object} payload          A previously-issued signed_payload.
 * @param {object} [opts]
 * @param {string} [opts.signingSecret]
 * @returns {{valid: boolean, reason?: string, issuer?: object, amount?: number, usable: boolean}}
 */
function verifyDigitalCheck(payload, opts = {}) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'payload_missing', usable: false };
  }
  // Re-compose the core so the signature can be recomputed deterministically.
  const { signature, signatureAlgo, status, ...core } = payload;
  if (!signature || signatureAlgo !== 'HS256') {
    return { valid: false, reason: 'unsupported_signature_algo', usable: false };
  }
  if (!verifySignature(core, signature, opts.signingSecret)) {
    return { valid: false, reason: 'signature_mismatch', usable: false };
  }
  // Check expiry.
  const now = Date.now();
  const expiry = Date.parse(core.expiry_date);
  const expired = Number.isFinite(expiry) && now > expiry;
  // Reconcile with ledger (so cancellations dominate).
  const entry = ledger.byCheckId.get(core.serial);
  const cancelled = entry && entry.status === 'cancelled';
  const presented = entry && entry.status === 'presented';

  return {
    valid: true,
    issuer: core.issuer,
    amount: core.amount,
    serial: core.serial,
    usable: !expired && !cancelled && !presented,
    expired: !!expired,
    cancelled: !!cancelled,
    presented: !!presented,
  };
}

/**
 * Cancel a previously-issued check (paper OR digital). Appends a
 * status row to the ledger — the original entry is NEVER destroyed,
 * per the "never delete" rule.
 */
function cancelCheck(checkId, reason) {
  if (!checkId) throw new TypeError('cancelCheck: checkId required');
  const entry = ledger.byCheckId.get(checkId);
  if (!entry) throw new Error('cancelCheck: unknown check ' + checkId);
  const cancelledAt = new Date().toISOString();
  // Append a new status row (immutable ledger) and also advance the
  // "current" status view of the existing entry.
  entry.status = 'cancelled';
  entry.cancelled = { at: cancelledAt, reason: String(reason || '') };
  appendLedger({
    checkId,
    type: 'cancellation',
    accountKey: entry.accountKey,
    amount: entry.amount,
    date: cancelledAt,
    status: 'cancelled',
    reason: String(reason || ''),
    createdAt: cancelledAt,
  });
  return { checkId, cancelledAt, reason: String(reason || '') };
}

/**
 * Return all ledger rows for an account. Optional "period" filters
 * by createdAt in the [from, to] range.
 *
 * @param {string} accountId   bankAccount key OR structured object
 * @param {{from?: Date|string, to?: Date|string}} [period]
 */
function checkHistory(accountId, period) {
  const key = typeof accountId === 'string' ? accountId : accountKey(accountId);
  const rows = ledger.byAccount.get(key) || [];
  if (!period) return rows.slice();
  const from = period.from ? new Date(period.from).getTime() : -Infinity;
  const to = period.to ? new Date(period.to).getTime() : Infinity;
  return rows.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && t >= from && t <= to;
  });
}

// =====================================================================
// 7. Delivery stubs — email / SMS
// =====================================================================
//
// The module never sends messages over the wire on its own. Instead it
// returns a structured Delivery record that a higher-level messaging
// bus (twilio/sendgrid/Hapoalim gateway) can consume. This keeps the
// check-printer fully offline-friendly and testable.
// ---------------------------------------------------------------------

function deliverDigitalCheckBySms(signedPayload, phoneNumber) {
  return {
    channel: 'sms',
    to: String(phoneNumber || ''),
    text:
      'צ׳ק דיגיטלי / Digital check: ' +
      'sum ₪' + Number(signedPayload.amount).toFixed(2) +
      ' from ' + (signedPayload.issuer && signedPayload.issuer.name) +
      ' — scan the QR to verify.',
    payload: signedPayload,
    queuedAt: new Date().toISOString(),
    status: 'queued',
  };
}

function deliverDigitalCheckByEmail(signedPayload, emailAddress) {
  return {
    channel: 'email',
    to: String(emailAddress || ''),
    subject: 'צ׳ק דיגיטלי / Digital check #' + signedPayload.serial,
    body:
      'שלום,\n\n' +
      'מצורף צ׳ק דיגיטלי מאת ' + (signedPayload.issuer && signedPayload.issuer.name) + '\n' +
      'סכום: ₪' + Number(signedPayload.amount).toFixed(2) + '\n' +
      'תוקף: ' + signedPayload.expiry_date + '\n\n' +
      'לאימות, סרקו את קוד ה-QR המצורף או השתמשו בכלי האימות של האתר.\n\n' +
      '---\n' +
      'Dear recipient,\n\n' +
      'A digital check from ' + (signedPayload.issuer && signedPayload.issuer.name) + ' is attached.\n' +
      'Amount: ILS ' + Number(signedPayload.amount).toFixed(2) + '\n' +
      'Expires: ' + signedPayload.expiry_date + '\n\n' +
      'Scan the attached QR or use the online verifier to validate.',
    payload: signedPayload,
    queuedAt: new Date().toISOString(),
    status: 'queued',
  };
}

// =====================================================================
// 8. Module exports
// =====================================================================

module.exports = {
  // Primary API
  numberToHebrewWords,
  printPaperCheck,
  issueDigitalCheck,
  verifyDigitalCheck,
  cancelCheck,
  checkHistory,

  // Delivery helpers
  deliverDigitalCheckBySms,
  deliverDigitalCheckByEmail,

  // Low-level building blocks (exported for tests + advanced callers)
  buildMicrLine,
  gregorianToHebrew,
  hebYearToGematria,
  canonicalJson,
  signPayload,
  verifySignature,
  installLedgerAdapter,

  // Constants (useful for tests + UI labels)
  DEFAULT_EXPIRY_DAYS,
  MICR,
  _internal: {
    hebIntegerByGender,
    hebUnder1000,
    ledger,
  },
};
