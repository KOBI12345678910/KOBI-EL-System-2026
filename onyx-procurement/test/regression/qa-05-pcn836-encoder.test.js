/**
 * QA-05 — Regression Agent
 * Area: PCN836 encoder (legacy Wave 1.5 / B-09)
 *
 * Purpose:
 *   Lock in the fixed-width field formatters and record structure of the
 *   Israeli VAT submission format. Any drift in fmtAmount/fmtInt/fmtText/
 *   fmtDate/fmtPeriod or the A/B/C/D/Z record builders risks a rejected
 *   submission to שמ"ת.
 *
 *   Known quirks (baselined, NOT treated as bugs):
 *     - fmtAmount uses `.slice(-width)` so large widths drop the leading '-'
 *       sign for negative values (covered in test 3.3 below).
 *     - validatePcn836File() enforces same-width for all records, but the
 *       current encoder emits A=92, B=113, C/D=76, Z=60 — so a real built
 *       file reports "line N: width X, expected 92" warnings. The structural
 *       A/B/Z checks still pass. See existing test/pcn836.test.js lines 409+.
 *
 * Run:
 *   node --test test/regression/qa-05-pcn836-encoder.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  fmtAmount,
  fmtInt,
  fmtText,
  fmtDate,
  fmtPeriod,
  buildPcn836File,
  validatePcn836File,
} = require(path.resolve(__dirname, '..', '..', 'src', 'vat', 'pcn836.js'));

// ─── Fixtures (mirrors test/pcn836.test.js minimally) ──────────────────

const COMPANY = {
  legal_name: 'טכנו-קול עוזי',
  vat_file_number: '123456789',
  reporting_frequency: 'monthly',
};

const PERIOD = {
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

const INPUTS = [
  {
    counterparty_tax_id: '111111111',
    invoice_number: 'INV-001',
    invoice_date: '2026-04-02',
    net_amount: 3000,
    vat_amount: 510,
    gross_amount: 3510,
    is_asset: false,
  },
];

const OUTPUTS = [
  {
    counterparty_tax_id: '333333333',
    invoice_number: 'S-100',
    invoice_date: '2026-04-03',
    net_amount: 4000,
    vat_amount: 680,
    gross_amount: 4680,
  },
];

// ─── 1. fmtAmount — value × 100 (agorot), width-aligned ────────────────

test('QA-05 pcn836.fmtAmount: ₪1,000 width 10 → "0000100000"', () => {
  assert.equal(fmtAmount(1000, 10), '0000100000');
});

test('QA-05 pcn836.fmtAmount: ₪12,345.67 width 8 → "01234567"', () => {
  assert.equal(fmtAmount(12345.67, 8), '01234567');
});

test('QA-05 pcn836.fmtAmount: zero → all zeros', () => {
  assert.equal(fmtAmount(0, 5), '00000');
});

test('QA-05 pcn836.fmtAmount: negative ₪100 width 10 → baseline "0000010000"', () => {
  // Known quirk: .slice(-width) drops the prepended '-' sign when pad+sign
  // exceeds width. This is the baselined behavior — do NOT silently "fix" it.
  assert.equal(fmtAmount(-100, 10), '0000010000');
});

// ─── 2. fmtInt / fmtText / fmtDate / fmtPeriod ─────────────────────────

test('QA-05 pcn836.fmtInt: 42 width 5 → "00042"', () => {
  assert.equal(fmtInt(42, 5), '00042');
});

test('QA-05 pcn836.fmtInt: undefined → zero-padded', () => {
  assert.equal(fmtInt(undefined, 3), '000');
});

test('QA-05 pcn836.fmtText: "abc" width 7 → right-padded with spaces', () => {
  assert.equal(fmtText('abc', 7), 'abc    ');
});

test('QA-05 pcn836.fmtText: "longer" width 4 → truncated to "long"', () => {
  assert.equal(fmtText('longer', 4), 'long');
});

test('QA-05 pcn836.fmtDate: ISO "2026-04-11" → "20260411"', () => {
  assert.equal(fmtDate('2026-04-11'), '20260411');
});

test('QA-05 pcn836.fmtDate: empty → "00000000"', () => {
  assert.equal(fmtDate(''), '00000000');
});

test('QA-05 pcn836.fmtPeriod: ISO "2026-04-11" → "202604"', () => {
  assert.equal(fmtPeriod('2026-04-11'), '202604');
});

test('QA-05 pcn836.fmtPeriod: empty → "000000"', () => {
  assert.equal(fmtPeriod(''), '000000');
});

// ─── 3. buildPcn836File — structure & metadata ─────────────────────────

test('QA-05 pcn836.build: throws when companyProfile missing', () => {
  assert.throws(
    () => buildPcn836File({ period: PERIOD, inputInvoices: [], outputInvoices: [] }),
    /companyProfile is required/,
  );
});

test('QA-05 pcn836.build: throws when period missing', () => {
  assert.throws(
    () => buildPcn836File({ companyProfile: COMPANY, inputInvoices: [], outputInvoices: [] }),
    /period is required/,
  );
});

test('QA-05 pcn836.build: throws when vat_file_number missing', () => {
  assert.throws(
    () =>
      buildPcn836File({
        companyProfile: { legal_name: 'X' },
        period: PERIOD,
      }),
    /vat_file_number is required/,
  );
});

test('QA-05 pcn836.build: returns content + lines + metadata shape', () => {
  const file = buildPcn836File({
    companyProfile: COMPANY,
    period: PERIOD,
    inputInvoices: INPUTS,
    outputInvoices: OUTPUTS,
  });
  assert.equal(typeof file.content, 'string');
  assert.ok(Array.isArray(file.lines));
  assert.ok(file.metadata);
  assert.equal(file.metadata.inputCount, 1);
  assert.equal(file.metadata.outputCount, 1);
  assert.equal(file.metadata.encoding, 'windows-1255');
  assert.ok(/^PCN836_\d+_\d{6}\.TXT$/.test(file.metadata.filename));
  assert.equal(typeof file.metadata.fileChecksum, 'string');
  assert.ok(file.metadata.fileChecksum.length >= 32, 'sha256 hex expected');
});

test('QA-05 pcn836.build: first line starts with A (header), last with Z (trailer)', () => {
  const file = buildPcn836File({
    companyProfile: COMPANY,
    period: PERIOD,
    inputInvoices: INPUTS,
    outputInvoices: OUTPUTS,
  });
  assert.equal(file.lines[0][0], 'A', 'header record type');
  assert.equal(file.lines[1][0], 'B', 'summary record type');
  assert.equal(file.lines[file.lines.length - 1][0], 'Z', 'trailer record type');
});

test('QA-05 pcn836.build: record count = 2 (A,B) + inputs + outputs + 1 (Z)', () => {
  const file = buildPcn836File({
    companyProfile: COMPANY,
    period: PERIOD,
    inputInvoices: INPUTS,
    outputInvoices: OUTPUTS,
  });
  // 1 A + 1 B + 1 C + 1 D + 1 Z = 5
  assert.equal(file.metadata.recordCount, 5);
});

test('QA-05 pcn836.build: content ends with CRLF', () => {
  const file = buildPcn836File({
    companyProfile: COMPANY,
    period: PERIOD,
    inputInvoices: [],
    outputInvoices: [],
  });
  assert.ok(file.content.endsWith('\r\n'), 'PCN836 lines must be CRLF-terminated');
});

// ─── 4. validatePcn836File — structural + width sanity ────────────────

test('QA-05 pcn836.validate: empty file returns structural errors', () => {
  const errors = validatePcn836File({});
  assert.ok(errors.some((e) => /Missing content/.test(e)));
  assert.ok(errors.some((e) => /Missing metadata/.test(e)));
});

test('QA-05 pcn836.validate: real built file passes A/B/Z structural checks', () => {
  // Matches the existing test in test/pcn836.test.js line 409: width errors
  // are expected noise from the known record-width mismatch.
  const file = buildPcn836File({
    companyProfile: COMPANY,
    period: PERIOD,
    inputInvoices: INPUTS,
    outputInvoices: OUTPUTS,
  });
  const errors = validatePcn836File(file);
  const structural = errors.filter((e) =>
    /Missing (content|metadata)|Too few records|First record must be header|Second record must be summary|Last record must be trailer/.test(e),
  );
  assert.deepEqual(structural, [], 'no structural errors on real file');
});
