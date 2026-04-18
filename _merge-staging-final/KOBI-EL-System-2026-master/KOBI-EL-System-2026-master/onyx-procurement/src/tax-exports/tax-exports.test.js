/**
 * tax-exports.test.js — Smoke tests for the 7 XML generators.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Run:
 *   node --test src/tax-exports/tax-exports.test.js
 *
 * Strategy: short, hermetic tests — for each generator verify
 *   1. generate() returns a non-empty BOM-prefixed XML string
 *   2. XML contains the expected root tag and FormCode
 *   3. validate() is empty for a well-formed payload
 *   4. validate() reports the expected error for a broken payload
 *   5. writeToFile() writes the bytes we got back from generate()
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tax = require('./index');
const {
  form1320, form857, form126, form1301, form102,
  vatRashutHamisim, shv, xmlCommon, FORMS, getFormGenerator, listForms,
} = tax;

// ───────────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────────

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-tax-exports-'));

function tmpFile(name) {
  return path.join(TMP_ROOT, name);
}

function assertXmlShape(xml, rootTag, formCode) {
  // BOM
  assert.equal(xml.charCodeAt(0), 0xfeff, 'missing UTF-8 BOM');
  // Prolog
  assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  // Root open/close
  assert.match(xml, new RegExp(`<${rootTag}[^>]*>`));
  assert.match(xml, new RegExp(`</${rootTag}>`));
  // Namespace
  assert.match(xml, new RegExp(`xmlns="http://www\\.taxes\\.gov\\.il/schema/${formCode.replace(/[-+]/g, '\\$&')}"`));
  // FormCode attribute
  assert.match(xml, new RegExp(`formCode="${formCode.replace(/[-+]/g, '\\$&')}"`));
  // Meta block present
  assert.match(xml, /<Meta>/);
  assert.match(xml, /<\/Meta>/);
}

// ═══════════════════════════════════════════════════════════════
// _xml-common
// ═══════════════════════════════════════════════════════════════

test('_xml-common: escapeXml handles all 5 predefined entities', () => {
  assert.equal(xmlCommon.escapeXml('<a&b>"c"\''), '&lt;a&amp;b&gt;&quot;c&quot;&apos;');
});

test('_xml-common: isoDate formats correctly', () => {
  assert.equal(xmlCommon.isoDate('2025-03-07'), '2025-03-07');
  assert.equal(xmlCommon.isoDate('2025-03-07T10:00:00Z'), '2025-03-07');
  assert.equal(xmlCommon.isoDate(''), '');
  assert.equal(xmlCommon.isoDate(null), '');
});

test('_xml-common: amount always 2-decimal string', () => {
  assert.equal(xmlCommon.amount(1000), '1000.00');
  assert.equal(xmlCommon.amount(1000.5), '1000.50');
  assert.equal(xmlCommon.amount(0), '0.00');
  assert.equal(xmlCommon.amount(null), '0.00');
});

test('_xml-common: isValidTaxId', () => {
  assert.equal(xmlCommon.isValidTaxId('123456782'), true);
  assert.equal(xmlCommon.isValidTaxId('1234567'), true);
  assert.equal(xmlCommon.isValidTaxId('abc'), false);
  assert.equal(xmlCommon.isValidTaxId(''), false);
});

// ═══════════════════════════════════════════════════════════════
// index.js catalog
// ═══════════════════════════════════════════════════════════════

test('index: listForms returns 7 forms', () => {
  const forms = listForms();
  assert.equal(forms.length, 7);
  const codes = forms.map(f => f.code).sort();
  assert.deepEqual(codes, ['102', '126', '1301', '1320', '857', 'SHV', 'VAT-Q']);
});

test('index: getFormGenerator by code', () => {
  assert.equal(getFormGenerator('1320'), form1320);
  assert.equal(getFormGenerator('SHV'), shv);
  assert.throws(() => getFormGenerator('9999'), /unknown form code/);
});

// ═══════════════════════════════════════════════════════════════
// form-1320
// ═══════════════════════════════════════════════════════════════

const f1320Data = {
  companyId: '123456782',
  companyName: 'Acme Industries Ltd',
  taxYear: 2025,
  income: { sales_revenue: 1500000, service_revenue: 200000, other_income: 5000 },
  expenses: { cogs: 600000, salaries: 400000, rent: 120000 },
  deductions: { carry_forward_losses: 10000, donations: 5000 },
  corporateTax: { taxable_income: 575000, tax_rate: 23, tax_payable: 132250, advances_paid: 100000 },
};

test('form-1320: generate produces valid XML', () => {
  const xml = form1320.generate(f1320Data);
  assertXmlShape(xml, 'Report1320', '1320');
  assert.match(xml, /<Income>/);
  assert.match(xml, /<Expenses>/);
  assert.match(xml, /<Deductions>/);
  assert.match(xml, /<CorporateTax>/);
  assert.match(xml, /<SalesRevenue>1500000\.00<\/SalesRevenue>/);
});

test('form-1320: validate empty on good payload', () => {
  assert.deepEqual(form1320.validate(f1320Data), []);
});

test('form-1320: validate reports missing fields', () => {
  const errors = form1320.validate({ income: {}, expenses: {}, corporateTax: {} });
  assert.ok(errors.some(e => e.includes('companyId')));
  assert.ok(errors.some(e => e.includes('taxYear')));
});

test('form-1320: validate rejects bad tax rate', () => {
  const errors = form1320.validate({
    ...f1320Data,
    corporateTax: { ...f1320Data.corporateTax, tax_rate: 150 },
  });
  assert.ok(errors.some(e => e.includes('tax_rate')));
});

test('form-1320: writeToFile persists bytes', () => {
  const out = form1320.writeToFile(f1320Data, tmpFile('1320.xml'));
  assert.ok(out.bytes > 100);
  assert.ok(/^[a-f0-9]{64}$/.test(out.sha256));
  const readBack = fs.readFileSync(out.path);
  assert.equal(readBack.length, out.bytes);
  // BOM is at bytes 0..2
  assert.equal(readBack[0], 0xef);
  assert.equal(readBack[1], 0xbb);
  assert.equal(readBack[2], 0xbf);
});

// ═══════════════════════════════════════════════════════════════
// form-857
// ═══════════════════════════════════════════════════════════════

const f857Data = {
  taxYear: 2025,
  employer: { employerId: '512345678', employerName: 'Acme Employer' },
  rows: [
    { type: 'employee', recipientId: '123456789', recipientName: 'Yossi Cohen', grossPaid: 120000, taxWithheld: 18000, bituachLeumi: 8400, health: 3600, netPaid: 90000, paymentsCount: 12 },
    { type: 'contractor', recipientId: '987654321', recipientName: 'Dana Levi', grossPaid: 50000, taxWithheld: 5000, netPaid: 45000, paymentsCount: 4 },
  ],
};

test('form-857: generate produces valid XML with rows', () => {
  const xml = form857.generate(f857Data);
  assertXmlShape(xml, 'Report857', '857');
  assert.match(xml, /<Employer>/);
  assert.match(xml, /<Withholdings>/);
  assert.match(xml, /<WithholdingRow>/g);
  assert.match(xml, /Yossi Cohen/);
  assert.match(xml, /Dana Levi/);
});

test('form-857: validate flags bad recipient id', () => {
  const bad = { ...f857Data, rows: [{ type: 'employee', recipientId: 'abc', recipientName: 'X' }] };
  const errors = form857.validate(bad);
  assert.ok(errors.some(e => e.includes('recipientId')));
});

test('form-857: validate passes for good data', () => {
  assert.deepEqual(form857.validate(f857Data), []);
});

test('form-857: writeToFile', () => {
  const out = form857.writeToFile(f857Data, tmpFile('857.xml'));
  assert.ok(out.bytes > 100);
});

// ═══════════════════════════════════════════════════════════════
// form-126
// ═══════════════════════════════════════════════════════════════

const f126Data = {
  taxYear: 2025,
  taxpayer: { taxpayerId: '512345678', taxpayerName: 'Acme', type: 'company' },
  installments: [
    { installmentNo: 1, dueDate: '2025-02-15', paymentDate: '2025-02-14', assessedAmount: 25000, paidAmount: 25000, status: 'paid' },
    { installmentNo: 2, dueDate: '2025-05-15', paymentDate: '2025-05-13', assessedAmount: 25000, paidAmount: 25000, status: 'paid' },
  ],
};

test('form-126: generate produces valid XML', () => {
  const xml = form126.generate(f126Data);
  assertXmlShape(xml, 'Report126', '126');
  assert.match(xml, /<Taxpayer>/);
  assert.match(xml, /<Installments>/);
  assert.match(xml, /<DueDate>2025-02-15<\/DueDate>/);
});

test('form-126: validate empty for good data', () => {
  assert.deepEqual(form126.validate(f126Data), []);
});

test('form-126: validate flags missing installmentNo', () => {
  const bad = { ...f126Data, installments: [{ dueDate: '2025-02-15', assessedAmount: 100 }] };
  const errors = form126.validate(bad);
  assert.ok(errors.some(e => e.includes('installmentNo')));
});

test('form-126: writeToFile', () => {
  const out = form126.writeToFile(f126Data, tmpFile('126.xml'));
  assert.ok(out.bytes > 100);
});

// ═══════════════════════════════════════════════════════════════
// form-1301
// ═══════════════════════════════════════════════════════════════

const f1301Data = {
  taxYear: 2025,
  individual: {
    taxpayerId: '123456782',
    firstName: 'Yossi',
    lastName: 'Cohen',
    maritalStatus: 'married',
    numChildren: 2,
    dateOfBirth: '1985-06-15',
  },
  salaryIncome: { totalGross: 180000, taxWithheld: 25000, bituachLeumi: 12600 },
  selfEmployedIncome: { businessRevenue: 50000, businessExpenses: 10000 },
  otherIncome: { interestIncome: 500 },
  deductions: { donations: 1000 },
  creditPoints: { basePoints: 2.25, childrenPoints: 2 },
  taxCalculation: { taxableIncome: 220500, netTax: 35000, balanceDue: 10000 },
};

test('form-1301: generate produces valid XML', () => {
  const xml = form1301.generate(f1301Data);
  assertXmlShape(xml, 'Report1301', '1301');
  assert.match(xml, /<Individual>/);
  assert.match(xml, /<SalaryIncome>/);
  assert.match(xml, /<TaxCalculation>/);
  assert.match(xml, /Yossi/);
});

test('form-1301: validate empty for good data', () => {
  assert.deepEqual(form1301.validate(f1301Data), []);
});

test('form-1301: validate rejects both balanceDue and refundDue', () => {
  const bad = { ...f1301Data, taxCalculation: { balanceDue: 100, refundDue: 50 } };
  const errors = form1301.validate(bad);
  assert.ok(errors.some(e => e.includes('balanceDue and refundDue')));
});

test('form-1301: validate rejects bad marital status', () => {
  const bad = { ...f1301Data, individual: { ...f1301Data.individual, maritalStatus: 'its-complicated' } };
  const errors = form1301.validate(bad);
  assert.ok(errors.some(e => e.includes('maritalStatus')));
});

test('form-1301: writeToFile', () => {
  const out = form1301.writeToFile(f1301Data, tmpFile('1301.xml'));
  assert.ok(out.bytes > 100);
});

// ═══════════════════════════════════════════════════════════════
// form-102
// ═══════════════════════════════════════════════════════════════

const f102Data = {
  employer: { employerId: '512345678', employerName: 'Acme Employer', deductionFileNumber: 'D12345' },
  period: { year: 2025, month: 3 },
  incomeTax: { employeesCount: 15, totalGrossWages: 150000, totalTaxWithheld: 22000 },
  bituachLeumi: { employeePortion: 10500, employerPortion: 7000 },
  health: { employeePortion: 3000 },
};

test('form-102: generate produces valid XML', () => {
  const xml = form102.generate(f102Data);
  assertXmlShape(xml, 'Report102', '102');
  assert.match(xml, /<Employer>/);
  assert.match(xml, /<ReportPeriod>/);
  assert.match(xml, /<IncomeTax>/);
  assert.match(xml, /<BituachLeumi>/);
  assert.match(xml, /<Period>2025-03<\/Period>/);
});

test('form-102: validate flags month out of range', () => {
  const bad = { ...f102Data, period: { year: 2025, month: 13 } };
  const errors = form102.validate(bad);
  assert.ok(errors.some(e => e.includes('period.month')));
});

test('form-102: validate passes for good data', () => {
  assert.deepEqual(form102.validate(f102Data), []);
});

test('form-102: writeToFile', () => {
  const out = form102.writeToFile(f102Data, tmpFile('102.xml'));
  assert.ok(out.bytes > 100);
});

// ═══════════════════════════════════════════════════════════════
// vat-rashut-hamisim
// ═══════════════════════════════════════════════════════════════

const vatData = {
  business: { vatFileNumber: '512345678', businessName: 'Acme VAT', reportingMethod: 'accrual' },
  quarter: { year: 2025, quarter: 1, periodStart: '2025-01-01', periodEnd: '2025-03-31' },
  sales: { taxableSales: 1000000, vatOnSales: 170000, zeroRateSales: 50000, exemptSales: 10000 },
  purchases: { taxablePurchases: 600000, vatOnPurchases: 102000, assetPurchases: 100000, vatOnAssets: 17000 },
  invoiceReform: { invoicesWithAllocationNumber: 120, invoicesWithoutAllocationNumber: 5, allocationNumberRequired: true },
};

test('vat-rashut-hamisim: generate produces valid XML', () => {
  const xml = vatRashutHamisim.generate(vatData);
  assertXmlShape(xml, 'ReportVATQuarterly', 'VAT-Q');
  assert.match(xml, /<Business>/);
  assert.match(xml, /<Quarter>/);
  assert.match(xml, /<Sales>/);
  assert.match(xml, /<Purchases>/);
  assert.match(xml, /<NetVat>/);
  assert.match(xml, /<InvoiceReform>/);
});

test('vat-rashut-hamisim: validate flags bad quarter', () => {
  const bad = { ...vatData, quarter: { ...vatData.quarter, quarter: 5 } };
  const errors = vatRashutHamisim.validate(bad);
  assert.ok(errors.some(e => e.includes('quarter.quarter')));
});

test('vat-rashut-hamisim: validate passes for good data', () => {
  assert.deepEqual(vatRashutHamisim.validate(vatData), []);
});

test('vat-rashut-hamisim: writeToFile', () => {
  const out = vatRashutHamisim.writeToFile(vatData, tmpFile('vat-q.xml'));
  assert.ok(out.bytes > 100);
});

// ═══════════════════════════════════════════════════════════════
// shv (self-assessment)
// ═══════════════════════════════════════════════════════════════

const shvData = {
  taxpayer: { taxpayerId: '512345678', taxpayerName: 'Acme', type: 'company', assessmentYear: 2025 },
  calculation: {
    grossIncome: 2000000,
    allowedExpenses: 1500000,
    taxableIncome: 500000,
    taxRate: 23,
    grossTax: 115000,
    credits: 5000,
    netTaxLiability: 110000,
  },
  payments: { advancePayments: 80000, withholdingCredits: 15000 },
  balance: { netTaxLiability: 110000, totalPaid: 95000, balanceDue: 15000 },
  attestation: { signedBy: 'CFO Dana', signedRole: 'Chief Financial Officer', signedDate: '2026-03-31' },
};

test('shv: generate produces valid XML', () => {
  const xml = shv.generate(shvData);
  assertXmlShape(xml, 'ReportSelfAssessment', 'SHV');
  assert.match(xml, /<Taxpayer>/);
  assert.match(xml, /<Calculation>/);
  assert.match(xml, /<Payments>/);
  assert.match(xml, /<Balance>/);
  assert.match(xml, /<Attestation>/);
  assert.match(xml, /<SignedBy>CFO Dana<\/SignedBy>/);
});

test('shv: validate rejects taxRate > 100', () => {
  const bad = { ...shvData, calculation: { ...shvData.calculation, taxRate: 200 } };
  const errors = shv.validate(bad);
  assert.ok(errors.some(e => e.includes('taxRate')));
});

test('shv: validate passes for good data', () => {
  assert.deepEqual(shv.validate(shvData), []);
});

test('shv: writeToFile', () => {
  const out = shv.writeToFile(shvData, tmpFile('shv.xml'));
  assert.ok(out.bytes > 100);
});

// ═══════════════════════════════════════════════════════════════
// Cross-form invariants
// ═══════════════════════════════════════════════════════════════

test('every form produces UTF-8 BOM and ISO-prolog', () => {
  const cases = [
    [form1320, f1320Data],
    [form857, f857Data],
    [form126, f126Data],
    [form1301, f1301Data],
    [form102, f102Data],
    [vatRashutHamisim, vatData],
    [shv, shvData],
  ];
  for (const [gen, data] of cases) {
    const xml = gen.generate(data);
    assert.equal(xml.charCodeAt(0), 0xfeff, `${gen.FORM_CODE}: missing BOM`);
    assert.ok(xml.includes('<?xml version="1.0" encoding="UTF-8"?>'), `${gen.FORM_CODE}: missing prolog`);
    assert.ok(xml.includes(`<${gen.ROOT_TAG}`), `${gen.FORM_CODE}: missing root open`);
    assert.ok(xml.includes(`</${gen.ROOT_TAG}>`), `${gen.FORM_CODE}: missing root close`);
    assert.ok(xml.includes('<Meta>'), `${gen.FORM_CODE}: missing Meta`);
    assert.ok(xml.includes('</Meta>'), `${gen.FORM_CODE}: missing Meta close`);
  }
});

test('every form rejects undefined data', () => {
  for (const gen of Object.values(FORMS)) {
    assert.throws(() => gen.generate(undefined), new RegExp(gen.FORM_CODE.replace(/[-+]/g, '\\$&') + '|required'));
  }
});
