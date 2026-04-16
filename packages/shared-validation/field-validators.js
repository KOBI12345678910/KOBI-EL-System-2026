'use strict';

/**
 * @module field-validators
 * @description Field-level validators for an Israeli ERP.
 * Every function returns `{ valid: boolean, error?: string }`.
 */

/* ================================================================== */
/*  Israeli ID (Teudat Zehut) — Luhn mod-10 variant                   */
/* ================================================================== */

/**
 * Validates an Israeli ID number (Teudat Zehut).
 *
 * Algorithm (Luhn mod-10 variant):
 *  1. Left-pad to 9 digits.
 *  2. Multiply each digit by 1 or 2 alternating (starting with 1).
 *  3. If the product is > 9, subtract 9.
 *  4. Sum all results. Valid if sum % 10 === 0.
 *
 * @param {string|number} id
 * @returns {{ valid: boolean, error?: string }}
 */
function validateIsraeliId(id) {
  if (id === undefined || id === null || id === '') {
    return { valid: false, error: 'Israeli ID is required' };
  }

  const str = String(id).replace(/\D/g, '');

  if (str.length === 0 || str.length > 9) {
    return { valid: false, error: 'Israeli ID must be 1-9 digits' };
  }

  const padded = str.padStart(9, '0');
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    let digit = Number(padded[i]);
    const multiplier = (i % 2) + 1; // 1, 2, 1, 2, ...
    let product = digit * multiplier;
    if (product > 9) product -= 9;
    sum += product;
  }

  if (sum % 10 !== 0) {
    return { valid: false, error: 'Israeli ID checksum failed' };
  }

  return { valid: true };
}

/* ================================================================== */
/*  Israeli VAT number (8-9 digits, same Luhn checksum)               */
/* ================================================================== */

/**
 * Validates an Israeli VAT / company registration number.
 * Uses the same Luhn mod-10 checksum as Teudat Zehut, with 9 digits.
 *
 * @param {string|number} num
 * @returns {{ valid: boolean, error?: string }}
 */
function validateVatNumber(num) {
  if (num === undefined || num === null || num === '') {
    return { valid: false, error: 'VAT number is required' };
  }

  const str = String(num).replace(/\D/g, '');

  if (str.length < 8 || str.length > 9) {
    return { valid: false, error: 'VAT number must be 8-9 digits' };
  }

  // Reuse Israeli ID checksum (pad to 9)
  return validateIsraeliId(str);
}

/* ================================================================== */
/*  Israeli phone                                                      */
/* ================================================================== */

/**
 * Validates an Israeli phone number.
 *
 * Accepted formats:
 *  - Mobile: 050-058, 10 digits (e.g. 0501234567).
 *  - Landline: 02-09, 9 digits (e.g. 021234567).
 *  - International: +972…
 *  - Common separators: `-`, ` `, `.`
 *
 * @param {string} phone
 * @returns {{ valid: boolean, error?: string }}
 */
function validateIsraeliPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  // Strip common separators
  const clean = phone.replace(/[\s\-().]/g, '');

  // +972 prefix normalization
  let normalized = clean;
  if (normalized.startsWith('+972')) {
    normalized = '0' + normalized.slice(4);
  } else if (normalized.startsWith('972')) {
    normalized = '0' + normalized.slice(3);
  }

  // Mobile: 05X followed by 7 digits (total 10)
  const mobileRegex = /^05[0-8]\d{7}$/;
  // Landline: 0[2-9] followed by 7 digits (total 9)
  const landlineRegex = /^0[2-9]\d{7}$/;
  // Special: 1-800, 1-700, *-numbers
  const specialRegex = /^(1[78]00\d{6}|\*\d{4})$/;

  if (mobileRegex.test(normalized) || landlineRegex.test(normalized) || specialRegex.test(normalized)) {
    return { valid: true };
  }

  return { valid: false, error: 'Invalid Israeli phone number' };
}

/* ================================================================== */
/*  IBAN (ISO 13616, mod-97)                                           */
/* ================================================================== */

/**
 * Validates an IBAN using the ISO 13616 mod-97 algorithm.
 *
 * @param {string} iban
 * @returns {{ valid: boolean, error?: string }}
 */
function validateIBAN(iban) {
  if (!iban || typeof iban !== 'string') {
    return { valid: false, error: 'IBAN is required' };
  }

  const clean = iban.replace(/\s/g, '').toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(clean)) {
    return { valid: false, error: 'IBAN format is invalid' };
  }

  // Move first 4 characters to end
  const rearranged = clean.slice(4) + clean.slice(0, 4);

  // Convert letters to numbers (A=10, B=11, …, Z=35)
  let numStr = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numStr += String(code - 55);
    } else {
      numStr += ch;
    }
  }

  // Mod-97 on a very long numeric string (BigInt-safe approach)
  let remainder = 0;
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + Number(numStr[i])) % 97;
  }

  if (remainder !== 1) {
    return { valid: false, error: 'IBAN checksum failed (mod-97)' };
  }

  return { valid: true };
}

/* ================================================================== */
/*  Israeli bank account                                               */
/* ================================================================== */

/**
 * Israeli bank codes — top banks.
 * @type {Record<string, string>}
 */
const ISRAELI_BANKS = {
  '10': 'Leumi',
  '11': 'Israel Discount',
  '12': 'Hapoalim',
  '13': 'Igud (Union)',
  '14': 'Otsar HaHayal',
  '17': 'Mercantile',
  '20': 'Mizrahi-Tefahot',
  '26': 'UBank',
  '31': 'International',
  '46': 'Massad',
  '52': 'Poaley Agudat Israel',
  '54': 'Jerusalem',
};

/**
 * Validates an Israeli bank account number.
 *
 * @param {string|number} bankCode  - 2-digit bank code.
 * @param {string|number} branch    - 3-4 digit branch number.
 * @param {string|number} account   - 6-9 digit account number.
 * @returns {{ valid: boolean, error?: string }}
 */
function validateBankAccount(bankCode, branch, account) {
  const errors = [];

  const bc = String(bankCode || '').replace(/\D/g, '');
  if (!bc || bc.length < 1 || bc.length > 2) {
    errors.push('Bank code must be 1-2 digits');
  } else if (!ISRAELI_BANKS[bc.padStart(2, '0')]) {
    // Not necessarily invalid — could be a smaller institution
    // We allow it but could warn
  }

  const br = String(branch || '').replace(/\D/g, '');
  if (!br || br.length < 1 || br.length > 4) {
    errors.push('Branch number must be 1-4 digits');
  }

  const acc = String(account || '').replace(/\D/g, '');
  if (!acc || acc.length < 1 || acc.length > 9) {
    errors.push('Account number must be 1-9 digits');
  }

  if (errors.length) {
    return { valid: false, error: errors.join('; ') };
  }

  return { valid: true };
}

/* ================================================================== */
/*  Israeli postal code                                                */
/* ================================================================== */

/**
 * Validates an Israeli postal code (5-digit or 7-digit).
 *
 * @param {string|number} code
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePostalCode(code) {
  if (code === undefined || code === null || code === '') {
    return { valid: false, error: 'Postal code is required' };
  }

  const clean = String(code).replace(/[\s\-]/g, '');

  if (/^\d{5}$/.test(clean) || /^\d{7}$/.test(clean)) {
    return { valid: true };
  }

  return { valid: false, error: 'Israeli postal code must be 5 or 7 digits' };
}

/* ================================================================== */
/*  Email                                                              */
/* ================================================================== */

/**
 * Validates an email address using a practical regex (RFC 5322 subset).
 *
 * @param {string} email
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const trimmed = email.trim();

  // Practical email regex — covers 99.9% of real addresses
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!re.test(trimmed)) {
    return { valid: false, error: 'Invalid email address' };
  }

  // At least one dot in domain part
  const domainPart = trimmed.split('@')[1];
  if (!domainPart || !domainPart.includes('.')) {
    return { valid: false, error: 'Email domain must contain a dot' };
  }

  return { valid: true };
}

/* ================================================================== */
/*  Generic validators                                                 */
/* ================================================================== */

/**
 * Validates that a value is a non-empty string.
 *
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, error?: string }}
 */
function required(value, fieldName) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return { valid: false, error: `${fieldName} is required` };
  }
  return { valid: true };
}

/**
 * Validates that a value is a positive number (> 0).
 *
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, error?: string }}
 */
function positiveNumber(value, fieldName) {
  const num = Number(value);
  if (value === undefined || value === null || isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }
  if (num <= 0) {
    return { valid: false, error: `${fieldName} must be a positive number` };
  }
  return { valid: true };
}

/**
 * Validates a date string/object is a valid date within an optional range.
 *
 * @param {*}       value      - Date string, timestamp, or Date object.
 * @param {string}  fieldName
 * @param {Object}  [opts]
 * @param {Date}    [opts.min] - Earliest allowed date.
 * @param {Date}    [opts.max] - Latest allowed date.
 * @returns {{ valid: boolean, error?: string }}
 */
function validDate(value, fieldName, opts = {}) {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: `${fieldName} is required` };
  }

  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { valid: false, error: `${fieldName} is not a valid date` };
  }

  if (opts.min && d < new Date(opts.min)) {
    return { valid: false, error: `${fieldName} must be after ${new Date(opts.min).toISOString().slice(0, 10)}` };
  }

  if (opts.max && d > new Date(opts.max)) {
    return { valid: false, error: `${fieldName} must be before ${new Date(opts.max).toISOString().slice(0, 10)}` };
  }

  return { valid: true };
}

/**
 * Validates that a value is one of the allowed enum values.
 *
 * @param {*}        value
 * @param {string[]} validValues
 * @param {string}   fieldName
 * @returns {{ valid: boolean, error?: string }}
 */
function inEnum(value, validValues, fieldName) {
  if (!Array.isArray(validValues) || validValues.length === 0) {
    return { valid: false, error: `${fieldName}: no valid values defined` };
  }

  if (!validValues.includes(value)) {
    return {
      valid: false,
      error: `${fieldName} must be one of: ${validValues.join(', ')}`,
    };
  }

  return { valid: true };
}

/* ================================================================== */
/*  Exports                                                            */
/* ================================================================== */

module.exports = {
  validateIsraeliId,
  validateVatNumber,
  validateIsraeliPhone,
  validateIBAN,
  validateBankAccount,
  validatePostalCode,
  validateEmail,
  required,
  positiveNumber,
  validDate,
  inEnum,
  ISRAELI_BANKS,
};
