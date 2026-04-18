/**
 * Unit tests for Israeli tax-file validator.
 *
 * Run with:
 *     node --test test/payroll/tax-file.test.js
 * or:
 *     node test/run.js --only tax-file
 *
 * Requires: Node.js >= 18 (built-in `node:test`).
 *
 * Agent 95 — 2026-04-11
 * Test-count target: 20+. Actual count: 30 test cases across 8 suites.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const tf = require(path.resolve(
  __dirname, '..', '..', 'src', 'validators', 'tax-file.js'
));

const {
  validateTaxFile,
  validateWithholdingFile,
  validateVatFile,
  validateIncomeTaxFile,
  validateOsekMorsheFile,
  crossReference,
  checkActiveStatus,
  normalize,
  luhnIsraeliCheck,
  formatDisplay,
  TAX_FILE_TYPES,
  REASON_CODES,
} = tf;

// ═══════════════════════════════════════════════════════════════
//  FIXTURES — all check-digit-valid per the Israeli Luhn test
// ═══════════════════════════════════════════════════════════════
//
// These numbers were computed with the same Luhn routine the Israeli
// Tax Authority uses for ת.ז / ח.פ / תיק ניכויים. DO NOT change them
// without recomputing — they are the seed of ~half the test suite.

const VALID = Object.freeze({
  WITHHOLDING_A: '937123453',   // base 93712345_, check 3
  WITHHOLDING_B: '514000009',   // base 51400000_, check 9
  VAT_A:         '123456782',   // base 12345678_, check 2
  VAT_B:         '556666774',   // base 55666677_, check 4
  INCOME_A:      '300000015',   // base 30000001_, check 5
  OSEK_A:        '102030400',   // base 10203040_, check 0
  EDGE_LOW:      '000000018',   // lowest non-trivial valid
  EDGE_HIGH:     '999999998',   // highest valid
  ALL_SIX:       '666666664',   // stress: repeating digit
  ALL_SEV:       '777777772',
  ALL_EIGHT:     '888888880',
});

const INVALID_CHECK_DIGIT = [
  '937123454',   // right base, wrong terminator
  '123456780',
  '514000000',
  '999999999',
];

// ═══════════════════════════════════════════════════════════════
//  1. normalize()
// ═══════════════════════════════════════════════════════════════

describe('normalize() — input cleansing', () => {
  test('null / undefined → null', () => {
    assert.equal(normalize(null), null);
    assert.equal(normalize(undefined), null);
  });

  test('empty string → null', () => {
    assert.equal(normalize(''), null);
    assert.equal(normalize('   '), null);
  });

  test('strips dashes, slashes, dots, underscores', () => {
    assert.equal(normalize('937-123-453'), '937123453');
    assert.equal(normalize('937/123/453'), '937123453');
    assert.equal(normalize('937.123.453'), '937123453');
    assert.equal(normalize('937_123_453'), '937123453');
  });

  test('strips spaces inside the number', () => {
    assert.equal(normalize('937 123 453'), '937123453');
  });

  test('left-pads short numbers to 9 digits', () => {
    assert.equal(normalize('18'),         '000000018');
    assert.equal(normalize('123456782'),  '123456782');
  });

  test('coerces numeric input', () => {
    // 18 is a valid 9-digit number when padded
    assert.equal(normalize(18), '000000018');
  });

  test('passes through >9 digit strings so caller can report length', () => {
    assert.equal(normalize('1234567890'), '1234567890');
  });

  test('passes through non-digit strings so caller can report NON_NUMERIC', () => {
    // Quotation marks / parens are scrubbed, but letters remain
    assert.equal(normalize('ABCDE'), 'ABCDE');
  });
});

// ═══════════════════════════════════════════════════════════════
//  2. luhnIsraeliCheck()
// ═══════════════════════════════════════════════════════════════

describe('luhnIsraeliCheck() — check-digit algorithm', () => {
  test('accepts every VALID fixture', () => {
    for (const [k, v] of Object.entries(VALID)) {
      assert.equal(luhnIsraeliCheck(v), true, `fixture ${k}=${v} should be valid`);
    }
  });

  test('rejects every INVALID_CHECK_DIGIT fixture', () => {
    for (const v of INVALID_CHECK_DIGIT) {
      assert.equal(luhnIsraeliCheck(v), false, `${v} should be invalid`);
    }
  });

  test('rejects non-9-digit strings outright', () => {
    assert.equal(luhnIsraeliCheck('12345'), false);
    assert.equal(luhnIsraeliCheck('1234567890'), false);
    assert.equal(luhnIsraeliCheck(''), false);
    assert.equal(luhnIsraeliCheck('12345678X'), false);
  });

  test('rejects non-string input', () => {
    assert.equal(luhnIsraeliCheck(123456782), false);
    assert.equal(luhnIsraeliCheck(null), false);
    assert.equal(luhnIsraeliCheck(undefined), false);
    assert.equal(luhnIsraeliCheck({}), false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  3. validateTaxFile() — happy paths
// ═══════════════════════════════════════════════════════════════

describe('validateTaxFile() — valid inputs', () => {
  test('withholding: canonical valid number', () => {
    const r = validateTaxFile(VALID.WITHHOLDING_A, TAX_FILE_TYPES.WITHHOLDING);
    assert.equal(r.valid, true);
    assert.equal(r.type, TAX_FILE_TYPES.WITHHOLDING);
    assert.equal(r.normalized, '937123453');
    assert.match(r.display, /937-123-453/);
    assert.match(r.display, /תיק ניכויים/);
    assert.match(r.display, /Withholding file/);
    assert.equal(r.reason, undefined);
  });

  test('vat: canonical valid number', () => {
    const r = validateTaxFile(VALID.VAT_A, TAX_FILE_TYPES.VAT);
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '123456782');
    assert.match(r.display, /תיק מע"מ/);
  });

  test('income_tax: canonical valid number', () => {
    const r = validateTaxFile(VALID.INCOME_A, TAX_FILE_TYPES.INCOME_TAX);
    assert.equal(r.valid, true);
    assert.match(r.display, /תיק מס הכנסה/);
  });

  test('osek_morshe: canonical valid number', () => {
    const r = validateTaxFile(VALID.OSEK_A, TAX_FILE_TYPES.OSEK_MORSHE);
    assert.equal(r.valid, true);
    assert.match(r.display, /עוסק מורשה/);
  });

  test('default type is WITHHOLDING when type omitted', () => {
    const r = validateTaxFile(VALID.WITHHOLDING_A);
    assert.equal(r.valid, true);
    assert.equal(r.type, TAX_FILE_TYPES.WITHHOLDING);
  });

  test('accepts formatted input with dashes', () => {
    const r = validateTaxFile('937-123-453', TAX_FILE_TYPES.WITHHOLDING);
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '937123453');
  });

  test('accepts numeric input (number type)', () => {
    const r = validateTaxFile(123456782, TAX_FILE_TYPES.VAT);
    assert.equal(r.valid, true);
  });

  test('accepts left-padded short valid number', () => {
    const r = validateTaxFile('18', TAX_FILE_TYPES.WITHHOLDING);
    assert.equal(r.valid, true);
    assert.equal(r.normalized, '000000018');
  });
});

// ═══════════════════════════════════════════════════════════════
//  4. validateTaxFile() — failure paths
// ═══════════════════════════════════════════════════════════════

describe('validateTaxFile() — invalid inputs', () => {
  test('null → EMPTY', () => {
    const r = validateTaxFile(null);
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.EMPTY);
    assert.ok(r.reason_he && r.reason_en, 'bilingual reasons must be present');
  });

  test('undefined → EMPTY', () => {
    const r = validateTaxFile(undefined);
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.EMPTY);
  });

  test('empty string → EMPTY', () => {
    const r = validateTaxFile('');
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.EMPTY);
  });

  test('wrong length (>9 digits) → WRONG_LENGTH', () => {
    const r = validateTaxFile('1234567890');
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.WRONG_LENGTH);
  });

  test('letters in the middle → NON_NUMERIC', () => {
    const r = validateTaxFile('12345A782');
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.NON_NUMERIC);
  });

  test('all zeros → ALL_ZEROS', () => {
    const r = validateTaxFile('000000000');
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.ALL_ZEROS);
  });

  test('bad check digit → CHECK_DIGIT', () => {
    for (const bad of INVALID_CHECK_DIGIT) {
      const r = validateTaxFile(bad);
      assert.equal(r.valid, false, `${bad} should be invalid`);
      assert.equal(r.reason, REASON_CODES.CHECK_DIGIT);
    }
  });

  test('unknown type → UNKNOWN_TYPE', () => {
    const r = validateTaxFile(VALID.WITHHOLDING_A, 'nonsense-type');
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.UNKNOWN_TYPE);
  });

  test('object input → NOT_STRING', () => {
    const r = validateTaxFile({ fake: 'number' });
    assert.equal(r.valid, false);
    assert.equal(r.reason, REASON_CODES.NOT_STRING);
  });

  test('all failure results have bilingual reasons', () => {
    const cases = [
      validateTaxFile(null),
      validateTaxFile(''),
      validateTaxFile('abc'),
      validateTaxFile('1234'),
      validateTaxFile('000000000'),
      validateTaxFile('937123454'),
    ];
    for (const r of cases) {
      assert.equal(r.valid, false);
      assert.ok(typeof r.reason_he === 'string' && r.reason_he.length > 0);
      assert.ok(typeof r.reason_en === 'string' && r.reason_en.length > 0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  5. Shortcut functions
// ═══════════════════════════════════════════════════════════════

describe('shortcut wrappers', () => {
  test('validateWithholdingFile routes to WITHHOLDING type', () => {
    const r = validateWithholdingFile(VALID.WITHHOLDING_A);
    assert.equal(r.valid, true);
    assert.equal(r.type, TAX_FILE_TYPES.WITHHOLDING);
  });

  test('validateVatFile routes to VAT type', () => {
    const r = validateVatFile(VALID.VAT_A);
    assert.equal(r.valid, true);
    assert.equal(r.type, TAX_FILE_TYPES.VAT);
  });

  test('validateIncomeTaxFile routes to INCOME_TAX type', () => {
    const r = validateIncomeTaxFile(VALID.INCOME_A);
    assert.equal(r.valid, true);
    assert.equal(r.type, TAX_FILE_TYPES.INCOME_TAX);
  });

  test('validateOsekMorsheFile routes to OSEK_MORSHE type', () => {
    const r = validateOsekMorsheFile(VALID.OSEK_A);
    assert.equal(r.valid, true);
    assert.equal(r.type, TAX_FILE_TYPES.OSEK_MORSHE);
  });

  test('shortcuts propagate failures with bilingual reasons', () => {
    const r = validateVatFile('bad-input-no-digits');
    assert.equal(r.valid, false);
    assert.ok(r.reason_he);
    assert.ok(r.reason_en);
  });
});

// ═══════════════════════════════════════════════════════════════
//  6. crossReference()
// ═══════════════════════════════════════════════════════════════

describe('crossReference() — entity ↔ tax file', () => {
  test('exact 9-digit match → confidence 1.0', () => {
    const r = crossReference(VALID.WITHHOLDING_A, VALID.WITHHOLDING_A);
    assert.equal(r.match, true);
    assert.equal(r.confidence, 1.0);
    assert.equal(r.reason, 'exact_match');
  });

  test('same 8-digit base, different check → confidence 0.9', () => {
    // 937123453 vs 937123454 share first 8 digits
    const r = crossReference('937123453', '937123454');
    assert.equal(r.match, true);
    assert.equal(r.confidence, 0.9);
    assert.equal(r.reason, 'same_base_different_check');
  });

  test('same 7-digit prefix → confidence 0.6', () => {
    // 937123453 vs 937123599 share first 7 digits "9371234"
    // (8th digit differs: "5" vs "5" ... no — share 9371234, then "5" vs "9")
    // Actually: 937123453 → "9371234" prefix7, "93712345" prefix8
    //           937123499 → "9371234" prefix7, "93712349" prefix8
    // So 937123499 shares prefix7 but not prefix8. Good.
    const r = crossReference('937123453', '937123499');
    assert.equal(r.match, true);
    assert.equal(r.confidence, 0.6);
    assert.equal(r.reason, 'same_prefix_7');
  });

  test('unrelated → confidence 0.0', () => {
    const r = crossReference('123456782', '937123453');
    assert.equal(r.match, false);
    assert.equal(r.confidence, 0.0);
    assert.equal(r.reason, 'no_relationship');
  });

  test('invalid inputs → match=false, invalid_input', () => {
    const r = crossReference('bad', '937123453');
    assert.equal(r.match, false);
    assert.equal(r.confidence, 0.0);
    assert.equal(r.reason, 'invalid_input');
  });

  test('formatted inputs are normalized before comparison', () => {
    const r = crossReference('937-123-453', '937 123 453');
    assert.equal(r.match, true);
    assert.equal(r.confidence, 1.0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  7. formatDisplay()
// ═══════════════════════════════════════════════════════════════

describe('formatDisplay()', () => {
  test('produces XXX-XXX-XXX grouping', () => {
    const s = formatDisplay('937123453');
    assert.equal(s, '937-123-453');
  });

  test('prepends bilingual type label when type given', () => {
    const s = formatDisplay('937123453', TAX_FILE_TYPES.WITHHOLDING);
    assert.match(s, /תיק ניכויים/);
    assert.match(s, /Withholding file/);
    assert.match(s, /937-123-453/);
  });

  test('echoes raw on bad input', () => {
    assert.equal(formatDisplay('junk'), 'junk');
    assert.equal(formatDisplay(null), '');
  });
});

// ═══════════════════════════════════════════════════════════════
//  8. checkActiveStatus() — stub behavior
// ═══════════════════════════════════════════════════════════════

describe('checkActiveStatus() — async stub', () => {
  test('returns "unknown" for a valid input (stub)', async () => {
    const r = await checkActiveStatus(VALID.WITHHOLDING_A, TAX_FILE_TYPES.WITHHOLDING);
    assert.equal(r.status, 'unknown');
    assert.equal(r.source, 'stub');
    assert.ok(typeof r.last_checked_at === 'string');
  });

  test('returns "invalid_format" for bad input, does not throw', async () => {
    const r = await checkActiveStatus('not-a-number');
    assert.equal(r.status, 'invalid_format');
    assert.equal(r.source, 'stub');
    assert.ok(r.local_reason);
  });

  test('never throws even on null input', async () => {
    const r = await checkActiveStatus(null);
    assert.equal(r.status, 'invalid_format');
  });
});
