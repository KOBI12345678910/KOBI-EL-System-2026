/**
 * Receipt PDF Generator — קבלה
 * Agent 72 — written 2026-04-11
 *
 * Generates Hebrew-first (with English fallback) A4 receipt PDFs in three
 * flavours required by Israeli Income Tax regulations (תקנות מס הכנסה —
 * ניהול פנקסי חשבונות, הוראה 18):
 *
 *   1. "receipt"         — קבלה רגילה         — for full payment of one or
 *                                                 more tax invoices.
 *   2. "on_account"      — קבלה על חשבון      — for partial payment against
 *                                                 a customer balance.
 *   3. "tax_invoice_receipt"
 *                        — חשבונית מס-קבלה    — combined tax invoice + receipt
 *                                                 (a single legal document).
 *
 * Layout:
 *   A4 split horizontally.
 *   - Top half    = מקור (original) for the merchant (our company).
 *   - Bottom half = העתק (copy) for the customer.
 *
 * Supports currencies: ILS (₪), USD ($), EUR (€).
 *
 * Public API:
 *   generateReceiptPdf(receipt, outputPath) -> Promise<{ path, size }>
 *   amountToHebrew(1234.56)                 -> "אלף מאתיים שלושים וארבעה
 *                                               שקלים וחמישים ושש אגורות"
 *
 * IMPORTANT: Uses pdfkit which is already a dependency.
 * IMPORTANT: This module creates NEW files only. It never deletes anything.
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────
// Receipt type constants
// ─────────────────────────────────────────────────────────────────────────

const RECEIPT_TYPES = Object.freeze({
  RECEIPT: 'receipt',
  ON_ACCOUNT: 'on_account',
  TAX_INVOICE_RECEIPT: 'tax_invoice_receipt',
});

const RECEIPT_TYPE_LABELS_HE = Object.freeze({
  receipt: 'קבלה',
  on_account: 'קבלה על חשבון',
  tax_invoice_receipt: 'חשבונית מס-קבלה',
});

const RECEIPT_TYPE_LABELS_EN = Object.freeze({
  receipt: 'Receipt',
  on_account: 'Receipt on Account',
  tax_invoice_receipt: 'Tax Invoice-Receipt',
});

const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  CHECK: 'check',
  CREDIT_CARD: 'credit_card',
  BANK_TRANSFER: 'bank_transfer',
  STANDING_ORDER: 'standing_order',
  OTHER: 'other',
});

const PAYMENT_METHOD_LABELS_HE = Object.freeze({
  cash: 'מזומן',
  check: 'צ\'ק',
  credit_card: 'כרטיס אשראי',
  bank_transfer: 'העברה בנקאית',
  standing_order: 'הוראת קבע',
  other: 'אחר',
});

const PAYMENT_METHOD_LABELS_EN = Object.freeze({
  cash: 'Cash',
  check: 'Check',
  credit_card: 'Credit Card',
  bank_transfer: 'Bank Transfer',
  standing_order: 'Standing Order',
  other: 'Other',
});

// ─────────────────────────────────────────────────────────────────────────
// Currency support
// ─────────────────────────────────────────────────────────────────────────

// Grammatical gender of currency names — determines which number forms
// we attach when counting.
//   שקל / דולר / יורו  → masculine
//   אגורה / סנט         → feminine
const CURRENCIES = Object.freeze({
  ILS: {
    code: 'ILS',
    symbol: '₪',
    locale: 'he-IL',
    majorSingular: 'שקל',
    majorPlural: 'שקלים',
    majorGender: 'm',
    minorSingular: 'אגורה',
    minorPlural: 'אגורות',
    minorGender: 'f',
    minorPerMajor: 100,
  },
  USD: {
    code: 'USD',
    symbol: '$',
    locale: 'en-US',
    majorSingular: 'דולר',
    majorPlural: 'דולרים',
    majorGender: 'm',
    minorSingular: 'סנט',
    minorPlural: 'סנטים',
    minorGender: 'm', // sent — masculine
    minorPerMajor: 100,
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    locale: 'de-DE',
    majorSingular: 'יורו',
    majorPlural: 'יורו',
    majorGender: 'm',
    minorSingular: 'סנט',
    minorPlural: 'סנטים',
    minorGender: 'm',
    minorPerMajor: 100,
  },
});

function resolveCurrency(code) {
  if (!code) return CURRENCIES.ILS;
  const upper = String(code).toUpperCase();
  return CURRENCIES[upper] || CURRENCIES.ILS;
}

// ─────────────────────────────────────────────────────────────────────────
// Hebrew number-to-words
//
// Covers the range needed by a receipt system: 0 .. 999,999,999,999
// (up to ~one trillion). Handles:
//   - units / tens / hundreds
//   - thousands  (אלף / אלפיים / שלושת אלפים ...)
//   - millions   (מיליון / שני מיליון / שלושה מיליון ...)
//   - billions   (מיליארד / שני מיליארד ...)  = "אלפי מיליונים"
//   - decimal (minor) portion (e.g. 1234.56 → אלף ... וחמישים ושש אגורות)
//
// Design notes:
//   Hebrew number words have gender. Israeli fiscal practice for receipt
//   amounts uses the FEMININE form for counts attached to "שקלים/אגורות"
//   (ten → עשר, twenty → עשרים, three-hundred → שלוש מאות). This matches
//   how Bank of Israel and Ministry of Finance print cheques.
//
//   The "אלף/מיליון/מיליארד" scale words themselves are grammatically
//   masculine, so scale counts use masculine forms (שני מיליון, שלושה
//   מיליון), except for the special cased exact scale quantities
//   (אלפיים, שלושת אלפים …, עשרת אלפים …).
// ─────────────────────────────────────────────────────────────────────────

// feminine units 1..9 (used for the base number attached to currency name)
const UNITS_F = [
  '', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע',
];

// masculine units 1..9 (used before scale words like מיליון / מיליארד)
const UNITS_M = [
  '', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה',
];

// 10..19 feminine
const TEENS_F = [
  'עשר', 'אחת עשרה', 'שתים עשרה', 'שלוש עשרה', 'ארבע עשרה',
  'חמש עשרה', 'שש עשרה', 'שבע עשרה', 'שמונה עשרה', 'תשע עשרה',
];

// 10..19 masculine
const TEENS_M = [
  'עשרה', 'אחד עשר', 'שנים עשר', 'שלושה עשר', 'ארבעה עשר',
  'חמישה עשר', 'שישה עשר', 'שבעה עשר', 'שמונה עשר', 'תשעה עשר',
];

// tens 20..90 (gender-neutral in Hebrew)
const TENS = [
  '', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים',
];

// hundreds 100..900 (feminine — matches שקלים / אגורות usage)
const HUNDREDS = [
  '', 'מאה', 'מאתיים', 'שלוש מאות', 'ארבע מאות', 'חמש מאות',
  'שש מאות', 'שבע מאות', 'שמונה מאות', 'תשע מאות',
];

// Exact thousands 1..10 — these are frozen constructions in Hebrew.
// e.g. "three thousand" = "שלושת אלפים", not "שלוש אלף".
const THOUSANDS_EXACT = [
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
 * Convert 0..999 to Hebrew feminine words.
 *
 * Style: "ו" is attached ONLY to the final element of the phrase — this
 * matches Israeli receipt/cheque convention:
 *
 *   101  -> "מאה ואחת"           (hundreds directly + conjunction on last)
 *   123  -> "מאה עשרים ושלוש"    (no "ו" between מאה and עשרים)
 *   234  -> "מאתיים שלושים וארבע"
 *   999  -> "תשע מאות תשעים ותשע"
 */
function hebrewUnder1000Feminine(n) {
  n = Math.floor(n);
  if (n < 0 || n >= 1000) {
    throw new RangeError('hebrewUnder1000Feminine expects 0..999, got ' + n);
  }
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const hundredsWord = hundreds > 0 ? HUNDREDS[hundreds] : '';

  if (rest === 0) return hundredsWord;

  const tens = Math.floor(rest / 10);
  const units = rest % 10;

  // Build the <100 piece. The final conjunction "ו" is inserted at
  // whichever element is the last one in the phrase.
  const pieces = [];
  if (hundredsWord) pieces.push(hundredsWord);

  if (rest < 10) {
    // Only units remain — "ו" attaches to the unit.
    pieces.push((hundredsWord ? 'ו' : '') + UNITS_F[rest]);
  } else if (rest < 20) {
    pieces.push((hundredsWord ? 'ו' : '') + TEENS_F[rest - 10]);
  } else if (units === 0) {
    // Only tens remain.
    pieces.push((hundredsWord ? 'ו' : '') + TENS[tens]);
  } else {
    // Tens + units. "ו" attaches to the UNITS (last element).
    pieces.push(TENS[tens]);
    pieces.push('ו' + UNITS_F[units]);
  }

  return pieces.join(' ');
}

/**
 * Convert 0..999 to Hebrew MASCULINE words (same conventions as the
 * feminine version above, but with masculine unit forms).
 */
function hebrewUnder1000Masculine(n) {
  n = Math.floor(n);
  if (n < 0 || n >= 1000) {
    throw new RangeError('hebrewUnder1000Masculine expects 0..999, got ' + n);
  }
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const hundredsWord = hundreds > 0 ? HUNDREDS[hundreds] : '';

  if (rest === 0) return hundredsWord;

  const tens = Math.floor(rest / 10);
  const units = rest % 10;

  const pieces = [];
  if (hundredsWord) pieces.push(hundredsWord);

  if (rest < 10) {
    pieces.push((hundredsWord ? 'ו' : '') + UNITS_M[rest]);
  } else if (rest < 20) {
    pieces.push((hundredsWord ? 'ו' : '') + TEENS_M[rest - 10]);
  } else if (units === 0) {
    pieces.push((hundredsWord ? 'ו' : '') + TENS[tens]);
  } else {
    pieces.push(TENS[tens]);
    pieces.push('ו' + UNITS_M[units]);
  }

  return pieces.join(' ');
}

// Compose a masculine count up to 999,999 by combining hundreds groups.
// Used when we're counting thousands beyond "עשרת אלפים" and when we need
// masculine scale-unit counts (e.g. "שלושה מיליון").
function hebrewMasculineGeneric(n) {
  n = Math.floor(n);
  if (n < 0) throw new RangeError('negative');
  if (n === 0) return '';
  if (n < 1000) return hebrewUnder1000Masculine(n);
  // n in 1000..999999 — recursive: <count> אלף <remainder>
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousandsWord = thousands <= 10
    ? THOUSANDS_EXACT[thousands]
    : hebrewUnder1000Masculine(thousands) + ' אלף';
  if (rest === 0) return thousandsWord;
  return thousandsWord + ' ' + hebrewUnder1000Masculine(rest);
}

/**
 * Build Hebrew words for a non-negative integer up to 999,999,999,999.
 *
 * `gender` controls the form of the trailing <1000 group (which is what
 * attaches to the currency name): 'm' for masculine (שלושה וארבעה שקלים),
 * 'f' for feminine (שלוש וארבע אגורות).
 *
 * Scale words (אלף / מיליון / מיליארד) are grammatically masculine so
 * their counts always use the masculine form regardless of `gender`.
 */
function hebrewIntegerByGender(n, gender) {
  n = Math.floor(n);
  if (n < 0) throw new RangeError('hebrewIntegerByGender: negative');
  if (n === 0) return 'אפס';

  // Scale decomposition. Safe for our cap (<1e12).
  const billions = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const units = n % 1000;

  const parts = [];

  if (billions > 0) {
    if (billions === 1) parts.push('מיליארד');
    else if (billions === 2) parts.push('שני מיליארד');
    else parts.push(hebrewMasculineGeneric(billions) + ' מיליארד');
  }

  if (millions > 0) {
    if (millions === 1) parts.push('מיליון');
    else if (millions === 2) parts.push('שני מיליון');
    else parts.push(hebrewMasculineGeneric(millions) + ' מיליון');
  }

  if (thousands > 0) {
    if (thousands <= 10) {
      parts.push(THOUSANDS_EXACT[thousands]);
    } else {
      parts.push(hebrewMasculineGeneric(thousands) + ' אלף');
    }
  }

  if (units > 0) {
    parts.push(
      gender === 'f'
        ? hebrewUnder1000Feminine(units)
        : hebrewUnder1000Masculine(units)
    );
  }

  return parts.join(' ');
}

// Backwards-compat alias (feminine — historical name in this module).
function hebrewIntegerFeminine(n) {
  return hebrewIntegerByGender(n, 'f');
}

/**
 * Public helper — convert a decimal amount to Hebrew words, including the
 * minor currency unit (e.g. agorot / cents).
 *
 *   amountToHebrew(1234.56)         -> "אלף מאתיים שלושים וארבעה שקלים וחמישים ושש אגורות"
 *   amountToHebrew(1)               -> "שקל אחד"
 *   amountToHebrew(2)               -> "שני שקלים"
 *   amountToHebrew(2, 'USD')        -> "שני דולרים"
 *   amountToHebrew(0)               -> "אפס שקלים"
 *   amountToHebrew(1234567890.12)   -> "מיליארד מאתיים שלושים וארבעה מיליון ..."
 *
 * @param {number|string} amount - non-negative numeric amount
 * @param {string}        [currencyCode='ILS']
 * @returns {string}
 */
function amountToHebrew(amount, currencyCode = 'ILS') {
  const currency = resolveCurrency(currencyCode);

  // Normalize into integer major + integer minor to avoid float drift.
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    throw new TypeError('amountToHebrew: amount must be a finite number');
  }
  if (num < 0) {
    throw new RangeError('amountToHebrew: negative amounts are not supported');
  }
  // Round to 2 decimal places (banker's-style not required here — standard half-up).
  const rounded = Math.round(num * 100);
  const major = Math.floor(rounded / currency.minorPerMajor);
  const minor = rounded % currency.minorPerMajor;

  const majorGender = currency.majorGender || 'm';
  const minorGender = currency.minorGender || 'f';

  // Major portion
  let majorWord;
  if (major === 0) {
    majorWord = 'אפס ' + currency.majorPlural;
  } else if (major === 1) {
    // "שקל אחד" / "דולר אחד" — "אחד" (m) / "אחת" (f)
    const one = majorGender === 'f' ? 'אחת' : 'אחד';
    majorWord = currency.majorSingular + ' ' + one;
  } else if (major === 2) {
    // "שני שקלים" (m) / "שתי" (f)
    const two = majorGender === 'f' ? 'שתי' : 'שני';
    majorWord = two + ' ' + currency.majorPlural;
  } else {
    majorWord = hebrewIntegerByGender(major, majorGender) + ' ' + currency.majorPlural;
  }

  if (minor === 0) {
    return majorWord;
  }

  // Minor portion
  let minorWord;
  if (minor === 1) {
    const one = minorGender === 'f' ? 'אחת' : 'אחד';
    minorWord = currency.minorSingular + ' ' + one;
  } else if (minor === 2) {
    const two = minorGender === 'f' ? 'שתי' : 'שני';
    minorWord = two + ' ' + currency.minorPlural;
  } else {
    // Minor is <100, so no scale decomposition needed — a direct
    // hundreds group call is sufficient.
    const word = minorGender === 'f'
      ? hebrewUnder1000Feminine(minor)
      : hebrewUnder1000Masculine(minor);
    minorWord = word + ' ' + currency.minorPlural;
  }

  return majorWord + ' ו' + minorWord;
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────

function formatMoney(n, currencyCode = 'ILS') {
  const currency = resolveCurrency(currencyCode);
  const num = Number(n || 0);
  return currency.symbol + ' ' + num.toLocaleString(currency.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatReceiptNumber(n) {
  if (n === null || n === undefined || n === '') return '';
  // Pad sequential receipt numbers to at least 6 digits (e.g. 000042)
  const s = String(n);
  if (/^\d+$/.test(s)) return s.padStart(6, '0');
  return s;
}

function maskCreditCard(last4) {
  if (!last4) return '';
  const s = String(last4).replace(/\D/g, '').slice(-4);
  return '**** **** **** ' + s.padStart(4, '0');
}

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

function validateReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    throw new TypeError('receipt must be an object');
  }
  const type = receipt.type || RECEIPT_TYPES.RECEIPT;
  if (!Object.values(RECEIPT_TYPES).includes(type)) {
    throw new RangeError('receipt.type must be one of ' +
      Object.values(RECEIPT_TYPES).join(', '));
  }
  if (!receipt.receipt_number && receipt.receipt_number !== 0) {
    throw new Error('receipt.receipt_number is required');
  }
  if (!receipt.issue_date) {
    throw new Error('receipt.issue_date is required');
  }
  if (!receipt.issuer || !receipt.issuer.legal_name) {
    throw new Error('receipt.issuer.legal_name is required');
  }
  if (!receipt.payer || !receipt.payer.name) {
    throw new Error('receipt.payer.name is required');
  }
  if (receipt.amount_gross === undefined || receipt.amount_gross === null) {
    throw new Error('receipt.amount_gross is required');
  }
  if (Number(receipt.amount_gross) < 0) {
    throw new RangeError('receipt.amount_gross must be non-negative');
  }
  if (!receipt.payment || !receipt.payment.method) {
    throw new Error('receipt.payment.method is required');
  }
  if (!Object.values(PAYMENT_METHODS).includes(receipt.payment.method)) {
    throw new RangeError('receipt.payment.method must be one of ' +
      Object.values(PAYMENT_METHODS).join(', '));
  }
  // tax_invoice_receipt MUST carry VAT line items
  if (type === RECEIPT_TYPES.TAX_INVOICE_RECEIPT) {
    if (receipt.vat_amount === undefined || receipt.vat_amount === null) {
      throw new Error('tax_invoice_receipt requires vat_amount');
    }
  }
  return type;
}

// ─────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────

/**
 * Draw one half of the receipt (either the original or the copy).
 * The two halves share the same content but carry different stamps.
 *
 * @param {PDFDocument} doc
 * @param {object}      receipt
 * @param {number}      topY         - top Y coordinate of this half
 * @param {number}      halfHeight   - height available for this half
 * @param {string}      stampLabel   - "מקור" / "העתק"
 */
function drawReceiptHalf(doc, receipt, topY, halfHeight, stampLabel) {
  const left = 40;
  const right = 555;
  const width = right - left;
  const currencyCode = receipt.currency || 'ILS';
  const type = receipt.type || RECEIPT_TYPES.RECEIPT;
  const titleHe = RECEIPT_TYPE_LABELS_HE[type];
  const titleEn = RECEIPT_TYPE_LABELS_EN[type];

  // Outer border for this half
  doc.lineWidth(1).rect(left, topY, width, halfHeight - 8).stroke();

  // Title row
  let y = topY + 8;
  doc.font('Helvetica-Bold').fontSize(14);
  doc.text(`${titleHe} / ${titleEn}`, left + 10, y, {
    width: width - 20,
    align: 'center',
  });
  y = doc.y + 2;

  // Stamp — top-right corner of the half
  doc.font('Helvetica-Bold').fontSize(11);
  const stampWidth = 70;
  const stampHeight = 22;
  const stampX = right - stampWidth - 10;
  const stampY = topY + 6;
  doc.lineWidth(1.5).rect(stampX, stampY, stampWidth, stampHeight).stroke();
  doc.text(stampLabel, stampX, stampY + 6, {
    width: stampWidth,
    align: 'center',
  });
  doc.lineWidth(1);

  // Receipt number + date row
  doc.font('Helvetica').fontSize(10);
  doc.text(
    `מס' קבלה / Receipt #: ${formatReceiptNumber(receipt.receipt_number)}`,
    left + 10, y,
    { width: (width / 2) - 20, align: 'left' }
  );
  doc.text(
    `תאריך / Date: ${formatDate(receipt.issue_date)}`,
    left + (width / 2), y,
    { width: (width / 2) - 20, align: 'right' }
  );
  y = doc.y + 4;

  // Divider
  doc.moveTo(left + 10, y).lineTo(right - 10, y).stroke();
  y += 4;

  // Issuer + Payer block
  doc.fontSize(9);
  doc.font('Helvetica-Bold').text('מאת / From:', left + 10, y);
  doc.font('Helvetica').text(receipt.issuer.legal_name, left + 60, y);
  y = doc.y;
  if (receipt.issuer.company_id) {
    doc.text(`ח.פ / Co. ID: ${receipt.issuer.company_id}`, left + 60, y);
    y = doc.y;
  }
  if (receipt.issuer.tax_file) {
    doc.text(`תיק ניכויים / Tax file: ${receipt.issuer.tax_file}`, left + 60, y);
    y = doc.y;
  }
  if (receipt.issuer.address) {
    doc.text(receipt.issuer.address, left + 60, y);
    y = doc.y;
  }
  y += 2;

  doc.font('Helvetica-Bold').text('ל / To:', left + 10, y);
  doc.font('Helvetica').text(receipt.payer.name, left + 60, y);
  y = doc.y;
  if (receipt.payer.tax_id) {
    const idLabel = receipt.payer.tax_id_type === 'company'
      ? 'ח.פ / Co. ID'
      : 'ת.ז / ID';
    doc.text(`${idLabel}: ${receipt.payer.tax_id}`, left + 60, y);
    y = doc.y;
  }
  if (receipt.payer.address) {
    doc.text(receipt.payer.address, left + 60, y);
    y = doc.y;
  }
  y += 4;

  // Divider
  doc.moveTo(left + 10, y).lineTo(right - 10, y).stroke();
  y += 4;

  // Amount in figures
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text('סכום / Amount:', left + 10, y, { continued: false });
  doc.text(
    formatMoney(receipt.amount_gross, currencyCode),
    right - 170, y,
    { width: 160, align: 'right' }
  );
  y = doc.y + 2;

  // VAT line for tax_invoice_receipt
  if (type === RECEIPT_TYPES.TAX_INVOICE_RECEIPT) {
    doc.font('Helvetica').fontSize(9);
    const amountBeforeVat = Number(receipt.amount_before_vat || 0);
    const vat = Number(receipt.vat_amount || 0);
    const vatRate = Number(receipt.vat_rate || 18);
    doc.text(
      `לפני מע"מ / Before VAT: ${formatMoney(amountBeforeVat, currencyCode)}`,
      left + 10, y, { width: width - 20, align: 'left' }
    );
    y = doc.y;
    doc.text(
      `מע"מ ${vatRate}% / VAT: ${formatMoney(vat, currencyCode)}`,
      left + 10, y, { width: width - 20, align: 'left' }
    );
    y = doc.y + 2;
  }

  // Amount in words (Hebrew)
  doc.font('Helvetica').fontSize(9);
  const words = amountToHebrew(receipt.amount_gross, currencyCode);
  doc.text(`במילים / In words: ${words}`, left + 10, y, {
    width: width - 20,
    align: 'right',
  });
  y = doc.y + 4;

  // Payment method block
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('אמצעי תשלום / Payment method:', left + 10, y);
  y = doc.y;
  doc.font('Helvetica').fontSize(9);
  const methodHe = PAYMENT_METHOD_LABELS_HE[receipt.payment.method];
  const methodEn = PAYMENT_METHOD_LABELS_EN[receipt.payment.method];
  doc.text(`${methodHe} / ${methodEn}`, left + 20, y);
  y = doc.y;

  // Method-specific details
  const p = receipt.payment;
  if (p.method === PAYMENT_METHODS.CREDIT_CARD) {
    if (p.card_last4) {
      doc.text(`כרטיס / Card: ${maskCreditCard(p.card_last4)}`, left + 20, y);
      y = doc.y;
    }
    if (p.card_brand) {
      doc.text(`מותג / Brand: ${p.card_brand}`, left + 20, y);
      y = doc.y;
    }
    if (p.installments) {
      doc.text(`תשלומים / Installments: ${p.installments}`, left + 20, y);
      y = doc.y;
    }
    if (p.auth_code) {
      doc.text(`אישור / Auth: ${p.auth_code}`, left + 20, y);
      y = doc.y;
    }
  } else if (p.method === PAYMENT_METHODS.CHECK) {
    if (p.check_number) {
      doc.text(`מס' צ'ק / Check #: ${p.check_number}`, left + 20, y);
      y = doc.y;
    }
    if (p.bank_name) {
      doc.text(`בנק / Bank: ${p.bank_name}`, left + 20, y);
      y = doc.y;
    }
    if (p.bank_number) {
      doc.text(`קוד בנק / Bank code: ${p.bank_number}`, left + 20, y);
      y = doc.y;
    }
    if (p.branch_number) {
      doc.text(`סניף / Branch: ${p.branch_number}`, left + 20, y);
      y = doc.y;
    }
    if (p.account_number) {
      doc.text(`חשבון / Account: ${p.account_number}`, left + 20, y);
      y = doc.y;
    }
  } else if (p.method === PAYMENT_METHODS.BANK_TRANSFER) {
    if (p.transfer_reference) {
      doc.text(`אסמכתא / Ref: ${p.transfer_reference}`, left + 20, y);
      y = doc.y;
    }
    if (p.bank_name) {
      doc.text(`בנק / Bank: ${p.bank_name}`, left + 20, y);
      y = doc.y;
    }
  } else if (p.method === PAYMENT_METHODS.OTHER && p.note) {
    doc.text(`פירוט / Detail: ${p.note}`, left + 20, y);
    y = doc.y;
  }

  if (p.value_date) {
    doc.text(`תאריך ערך / Value date: ${formatDate(p.value_date)}`, left + 20, y);
    y = doc.y;
  }
  y += 2;

  // Invoice references
  if (Array.isArray(receipt.invoice_refs) && receipt.invoice_refs.length > 0) {
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('כנגד חשבוניות / Against invoices:', left + 10, y);
    y = doc.y;
    doc.font('Helvetica').fontSize(8);
    for (const ref of receipt.invoice_refs) {
      const invDate = ref.date ? formatDate(ref.date) : '';
      const invAmount = ref.amount !== undefined
        ? formatMoney(ref.amount, currencyCode)
        : '';
      doc.text(
        `  ▪ #${ref.invoice_number}${invDate ? '  ' + invDate : ''}${invAmount ? '  ' + invAmount : ''}`,
        left + 20, y
      );
      y = doc.y;
    }
    y += 2;
  }

  // On-account balance disclosure
  if (type === RECEIPT_TYPES.ON_ACCOUNT) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555');
    doc.text(
      'תשלום על חשבון — לא כנגד חשבונית מס ספציפית / Partial payment on account.',
      left + 10, y, { width: width - 20 }
    );
    doc.fillColor('#000');
    y = doc.y + 2;
  }

  // Signature line
  const sigY = topY + halfHeight - 30;
  doc.moveTo(left + 10, sigY).lineTo(left + 200, sigY).stroke();
  doc.font('Helvetica').fontSize(8);
  doc.text('חתימה וחותמת / Signature & stamp', left + 10, sigY + 2);

  // Footer text for this half
  doc.fontSize(7).fillColor('#666');
  doc.text(
    `הופק / Generated: ${formatDate(new Date())}  |  ${currencyCode}`,
    left + 10, topY + halfHeight - 14,
    { width: width - 20, align: 'right' }
  );
  doc.fillColor('#000');
}

/**
 * Generate a receipt PDF and write it to outputPath.
 * Returns a promise that resolves to { path, size }.
 *
 * @param {object} receipt
 * @param {string} outputPath - absolute path of the PDF to create
 * @returns {Promise<{path: string, size: number}>}
 */
function generateReceiptPdf(receipt, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      validateReceipt(receipt);

      // Ensure target directory exists (creates new dirs only, never deletes).
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const type = receipt.type || RECEIPT_TYPES.RECEIPT;
      const titleHe = RECEIPT_TYPE_LABELS_HE[type];

      const doc = new PDFDocument({
        size: 'A4',
        margin: 20,
        info: {
          Title: `${titleHe} ${formatReceiptNumber(receipt.receipt_number)} - ${receipt.payer.name}`,
          Author: receipt.issuer.legal_name,
          Subject: 'Receipt / קבלה',
          Keywords: 'receipt, קבלה, tax invoice, חשבונית מס',
          CreationDate: new Date(),
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // A4 = 595 x 842 points. Margin 20 on each side.
      // Each half ~ 400pt tall with a small gap in the middle.
      const pageTop = 20;
      const pageBottom = 822;
      const gap = 8;
      const halfHeight = Math.floor((pageBottom - pageTop - gap) / 2);

      // Upper half — מקור (original, merchant copy)
      drawReceiptHalf(doc, receipt, pageTop, halfHeight, 'מקור / ORIGINAL');

      // Cut line in the middle
      const cutY = pageTop + halfHeight + (gap / 2);
      doc.save();
      doc.lineWidth(0.5).dash(4, { space: 4 });
      doc.moveTo(30, cutY).lineTo(565, cutY).stroke();
      doc.undash();
      doc.restore();
      doc.font('Helvetica').fontSize(7).fillColor('#888');
      doc.text('גזור כאן / cut here', 30, cutY - 10, { width: 535, align: 'center' });
      doc.fillColor('#000');

      // Lower half — העתק (copy, customer)
      drawReceiptHalf(doc, receipt, pageTop + halfHeight + gap, halfHeight, 'העתק / COPY');

      doc.end();

      stream.on('finish', () => {
        try {
          const stats = fs.statSync(outputPath);
          resolve({ path: outputPath, size: stats.size });
        } catch (e) {
          reject(e);
        }
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateReceiptPdf,
  amountToHebrew,
  // exported for tests / advanced callers
  validateReceipt,
  hebrewIntegerByGender,
  hebrewIntegerFeminine,
  hebrewUnder1000Feminine,
  hebrewUnder1000Masculine,
  hebrewMasculineGeneric,
  RECEIPT_TYPES,
  PAYMENT_METHODS,
  CURRENCIES,
};
