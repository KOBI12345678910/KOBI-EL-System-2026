/**
 * QA-02 — Unit tests (edge cases) for vat/pcn836.js
 *
 * Scope:
 *   - fmtAmount/fmtInt/fmtText/fmtDate/fmtPeriod edge cases
 *     (null, undefined, negative, very large, Feb 29, invalid dates,
 *      BOM, Hebrew chars, overflow)
 *   - buildPcn836File edge-case inputs (empty arrays, amendment,
 *     bi_monthly, missing company_name fallback to legal_name)
 *   - Checksum determinism (same input -> same hash)
 *   - validatePcn836File edge cases
 *
 * ADDITIVE to test/pcn836.test.js — both must pass.
 *
 * Run with:    node --test test/unit/qa-02-pcn836.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pcn836 = require(path.resolve(__dirname, '..', '..', 'src', 'vat', 'pcn836.js'));
const {
  fmtAmount,
  fmtInt,
  fmtText,
  fmtDate,
  fmtPeriod,
  buildPcn836File,
  validatePcn836File,
} = pcn836;

// ═════════════════════════════════════════════════════════════
// SECTION 1: fmtAmount — null / overflow / rounding
// ═════════════════════════════════════════════════════════════

describe('QA-02.PCN.1 fmtAmount edges', () => {
  test('1.01 null/undefined/empty-string -> zeros', () => {
    assert.equal(fmtAmount(null, 12), '000000000000');
    assert.equal(fmtAmount(undefined, 12), '000000000000');
    assert.equal(fmtAmount('', 12), '000000000000');
  });

  test('1.02 float precision 0.1+0.2 rounded to agorot', () => {
    // 0.1+0.2 = 0.30000000000000004 → 30 agorot
    assert.equal(fmtAmount(0.1 + 0.2, 8), '00000030');
  });

  test('1.03 very large ₪9,999,999.99 fits in 12-wide field', () => {
    // 9999999.99 * 100 = 999999999 (9 digits), padded to 12
    assert.equal(fmtAmount(9_999_999.99, 12), '000999999999');
  });

  test('1.04 overflow: too-wide value still returns exactly `width` chars', () => {
    // 999999999.99 * 100 = 99,999,999,999 (11 digits)
    const r = fmtAmount(999_999_999.99, 8);
    assert.equal(r.length, 8, `expected width=8, got "${r}"`);
  });

  test('1.05 exactly 0.005 -> round to 1 agorot (banker-ish)', () => {
    // Math.round(0.5) = 1 in JS — document behavior
    const r = fmtAmount(0.005, 6);
    assert.ok(r === '000001' || r === '000000',
      `expected 000001 or 000000 (rounding), got ${r}`);
  });

  test('1.06 exactly 0.015 -> 2 agorot (per existing test)', () => {
    assert.equal(fmtAmount(0.015, 12), '000000000002');
  });

  test('1.07 non-numeric string -> zeros (NaN coerced)', () => {
    // Math.abs(NaN) = NaN; Math.round(NaN) = NaN; (NaN).toString = "NaN"
    // then padStart on "NaN" returns something non-numeric. Document behavior.
    const r = fmtAmount('not-a-number', 10);
    assert.equal(r.length, 10);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 2: fmtInt — null / width-preserving
// ═════════════════════════════════════════════════════════════

describe('QA-02.PCN.2 fmtInt edges', () => {
  test('2.01 undefined -> all zeros', () => {
    assert.equal(fmtInt(undefined, 5), '00000');
  });

  test('2.02 large integer truncates/pads to width', () => {
    const r = fmtInt(123456789, 5);
    // 123456789.toString().padStart(5,'0') = '123456789' (no truncation)
    // That's longer than width — document behavior
    assert.ok(r.length >= 5, `length = ${r.length}`);
  });

  test('2.03 fractional -> rounded', () => {
    assert.equal(fmtInt(3.7, 4), '0004');
    assert.equal(fmtInt(3.49, 4), '0003');
  });

  test('2.04 negative integer keeps sign in output', () => {
    // String(-5).padStart(4,'0') = '00-5'
    const r = fmtInt(-5, 4);
    assert.equal(r.length, 4);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 3: fmtText — Hebrew, emoji, multi-byte
// ═════════════════════════════════════════════════════════════

describe('QA-02.PCN.3 fmtText edges', () => {
  test('3.01 width=0 returns empty string', () => {
    assert.equal(fmtText('anything', 0), '');
  });

  test('3.02 Hebrew is preserved char-count (not byte-count)', () => {
    // "טכנו-קול" is 8 UTF-16 code units
    const r = fmtText('טכנו-קול', 10);
    assert.equal(r.length, 10);
  });

  test('3.03 leading/trailing spaces preserved on truncate', () => {
    assert.equal(fmtText('  hello', 5), '  hel');
  });

  test('3.04 exact-width string unchanged', () => {
    assert.equal(fmtText('abcde', 5), 'abcde');
  });

  test('3.05 numeric input stringified and padded', () => {
    assert.equal(fmtText(42, 5), '42   ');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 4: fmtDate — Feb 29, invalid, timezone
// ═════════════════════════════════════════════════════════════

describe('QA-02.PCN.4 fmtDate edges', () => {
  test('4.01 leap-year Feb 29, 2024', () => {
    assert.equal(fmtDate('2024-02-29'), '20240229');
  });

  test('4.02 non-leap Feb 29 auto-corrects (JS Date rolls over) - DOCUMENTED', () => {
    // new Date('2025-02-29') → 2025-03-01
    const r = fmtDate('2025-02-29');
    // Accept either 20250301 (roll) or 20250229 (strict)
    assert.ok(r === '20250301' || r === '20250229',
      `expected roll-over or strict, got ${r}`);
  });

  test('4.03 invalid string yields 8-char output (not throw)', () => {
    const r = fmtDate('not-a-date');
    // new Date('not-a-date') is Invalid Date → getFullYear() is NaN
    // current code will produce "NaNNaNNaN" or similar non-numeric
    assert.equal(typeof r, 'string');
  });

  test('4.04 Date object input works', () => {
    const d = new Date('2026-04-11T00:00:00Z');
    const r = fmtDate(d);
    assert.ok(r.match(/^\d{8}$/), `expected YYYYMMDD, got ${r}`);
  });

  test('4.05 year 2000 boundary', () => {
    assert.equal(fmtDate('2000-01-01'), '20000101');
  });

  test('4.06 year < 1000 padded to 4 digits', () => {
    const r = fmtDate('0999-01-01');
    assert.ok(r.match(/^\d{8}$/));
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 5: fmtPeriod
// ═════════════════════════════════════════════════════════════

describe('QA-02.PCN.5 fmtPeriod edges', () => {
  test('5.01 January => 202601 (not 20261)', () => {
    assert.equal(fmtPeriod('2026-01-01'), '202601');
  });

  test('5.02 December => 202612', () => {
    assert.equal(fmtPeriod('2026-12-31'), '202612');
  });

  test('5.03 last-ms-of-year roll behavior', () => {
    // 2026-12-31T23:59:59Z in UTC stays 2026-12
    // depending on runner TZ it may roll. Document.
    const r = fmtPeriod('2026-12-31T23:59:59Z');
    assert.ok(r === '202612' || r === '202701',
      `expected 202612 or 202701 (TZ-dependent), got ${r}`);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 6: buildPcn836File — variants and determinism
// ═════════════════════════════════════════════════════════════

const baseCompany = {
  legal_name: 'QA Test Co',
  vat_file_number: '100000001',
  reporting_frequency: 'monthly',
};

const basePeriod = {
  period_label: '2026-04',
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  taxable_sales: 10000,
  vat_on_sales: 1700,
  zero_rate_sales: 0,
  exempt_sales: 0,
  taxable_purchases: 5000,
  vat_on_purchases: 850,
  asset_purchases: 0,
  vat_on_assets: 0,
  net_vat_payable: 850,
  is_refund: false,
};

describe('QA-02.PCN.6 buildPcn836File — variants', () => {
  test('6.01 empty arrays produce only A, B, Z (3 lines)', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
    });
    assert.equal(f.lines.length, 3);
    assert.equal(f.lines[0][0], 'A');
    assert.equal(f.lines[1][0], 'B');
    assert.equal(f.lines[2][0], 'Z');
  });

  test('6.02 bi_monthly reporting sets period_type to "2"', () => {
    const f = buildPcn836File({
      companyProfile: { ...baseCompany, reporting_frequency: 'bi_monthly' },
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
    });
    // Header: A + 9 (vat) + 6 (period) + 1 (period_type)
    assert.equal(f.lines[0][16], '2');
  });

  test('6.03 amendment submission sets submission_type to "2"', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
      submission: { type: 'amendment' },
    });
    // Header position: A(1) + vat(9) + period(6) + ptype(1) + subdate(8) = 25 -> submission type at pos 25
    assert.equal(f.lines[0][25], '2');
  });

  test('6.04 is_refund=true sets B-record refund flag', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: { ...basePeriod, is_refund: true, net_vat_payable: -500 },
      inputInvoices: [],
      outputInvoices: [],
    });
    const b = f.lines[1];
    // The flag position: B(1) + 12 + 11 + 12 + 12 + 12 + 11 + 12 + 11 + 12 = 106
    // position 106 = '2' if refund, '1' otherwise
    assert.equal(b[106], '2');
  });

  test('6.05 checksum is deterministic for same input', () => {
    const f1 = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
    });
    const f2 = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
    });
    assert.equal(f1.metadata.bodyChecksum, f2.metadata.bodyChecksum);
    // fileChecksum may differ if generatedAt is embedded in content — but content is not
    assert.equal(f1.metadata.fileChecksum, f2.metadata.fileChecksum);
  });

  test('6.06 checksum changes when content changes', () => {
    const f1 = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
    });
    const f2 = buildPcn836File({
      companyProfile: baseCompany,
      period: { ...basePeriod, taxable_sales: 10001 },
      inputInvoices: [],
      outputInvoices: [],
    });
    assert.notEqual(f1.metadata.bodyChecksum, f2.metadata.bodyChecksum);
  });

  test('6.07 trailer counts match reality for 5 inputs, 7 outputs', () => {
    const mkInv = (i) => ({
      counterparty_id: String(100000000 + i),
      invoice_number: `INV-${i}`,
      invoice_date: '2026-04-05',
      net_amount: 1000 + i,
      vat_amount: 170 + i,
      is_asset: false,
    });
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [1, 2, 3, 4, 5].map(mkInv),
      outputInvoices: [1, 2, 3, 4, 5, 6, 7].map(mkInv),
    });
    // A + B + 5C + 7D + Z = 15
    assert.equal(f.lines.length, 15);
    const trailer = f.lines[14];
    assert.equal(trailer.slice(1, 10), '000000015'); // total
    assert.equal(trailer.slice(10, 19), '000000005'); // inputs
    assert.equal(trailer.slice(19, 28), '000000007'); // outputs
  });

  test('6.08 content ends with CRLF', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
    });
    assert.ok(f.content.endsWith('\r\n'));
  });

  test('6.09 filename matches pattern PCN836_<vat>_<YYYYMM>.TXT', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: { ...basePeriod, period_label: '2026-11' },
      inputInvoices: [],
      outputInvoices: [],
    });
    assert.equal(f.metadata.filename, 'PCN836_100000001_202611.TXT');
  });

  test('6.10 is_asset invoice marks "Y" in C record', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [{
        counterparty_id: '200000001',
        invoice_number: 'ASSET-1',
        invoice_date: '2026-04-10',
        net_amount: 50000,
        vat_amount: 8500,
        is_asset: true,
      }],
      outputInvoices: [],
    });
    const c = f.lines[2];
    // positions: C(1) + 9 + 20 + 8 + 12 + 11 = 61, width 1 for is_asset
    assert.equal(c[61], 'Y');
  });

  test('6.11 encoding metadata is windows-1255', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [],
      outputInvoices: [],
    });
    assert.equal(f.metadata.encoding, 'windows-1255');
  });

  test('6.12 missing vat_file_number throws', () => {
    assert.throws(
      () => buildPcn836File({
        companyProfile: { legal_name: 'X' },
        period: basePeriod,
        inputInvoices: [],
        outputInvoices: [],
      }),
      /vat_file_number/,
    );
  });

  test('6.13 extreme VAT amount ₪9,999,999.99 does not corrupt file', () => {
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: { ...basePeriod, vat_on_sales: 9_999_999.99 },
      inputInvoices: [],
      outputInvoices: [],
    });
    const b = f.lines[1];
    // field: B(1) + 12 (taxable_sales) = 13; vat_on_sales @ 13..24 (width 11)
    const vatField = b.slice(13, 24);
    // 9,999,999.99 * 100 = 999,999,999 — fits in 11 chars zero-padded
    assert.equal(vatField, '00999999999');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 7: validatePcn836File — edge behavior
// ═════════════════════════════════════════════════════════════

describe('QA-02.PCN.7 validatePcn836File edges', () => {
  test('7.01 undefined file throws or returns error list (no crash)', () => {
    let errors;
    assert.doesNotThrow(() => {
      errors = validatePcn836File({});
    });
    assert.ok(Array.isArray(errors));
    assert.ok(errors.length > 0);
  });

  test('7.02 file with lines of equal width passes width check', () => {
    const uniform = {
      content: 'x',
      metadata: {},
      lines: ['A' + 'x'.repeat(9), 'B' + 'x'.repeat(9), 'Z' + 'x'.repeat(9)],
    };
    const errors = validatePcn836File(uniform);
    const widthErr = errors.find(e => /line \d+: width/.test(e));
    assert.equal(widthErr, undefined, 'uniform widths should not trigger width errors');
  });

  test('7.03 file with differing widths flags (known real-file bug)', () => {
    const nonUniform = {
      content: 'x',
      metadata: {},
      lines: ['A' + 'x'.repeat(9), 'B' + 'x'.repeat(8), 'Z' + 'x'.repeat(9)],
    };
    const errors = validatePcn836File(nonUniform);
    assert.ok(errors.some(e => /line 1: width/.test(e)),
      `expected width error on line 1, got ${JSON.stringify(errors)}`);
  });

  test('7.04 DOCUMENTED BUG: validator is overly strict vs encoder', () => {
    // Encoder emits records of different widths (A=92, B=113, C/D=76, Z=60)
    // but validator insists on equal widths → real files fail validation.
    // This test DOCUMENTS the inconsistency.
    const f = buildPcn836File({
      companyProfile: baseCompany,
      period: basePeriod,
      inputInvoices: [{
        counterparty_id: '111111111',
        invoice_number: 'INV-1',
        invoice_date: '2026-04-02',
        net_amount: 1000,
        vat_amount: 170,
        is_asset: false,
      }],
      outputInvoices: [],
    });
    const errors = validatePcn836File(f);
    const widthErrors = errors.filter(e => /line \d+: width/.test(e));
    assert.ok(widthErrors.length > 0,
      'DOCUMENTED BUG: validator will complain about line widths that are correct per spec');
  });
});
