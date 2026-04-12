/**
 * Unit tests for pnl-report.js
 *
 * Run with:
 *   node --test src/reports/pnl-report.test.js
 *
 * All tests operate on in-memory mock data (no Supabase, no filesystem
 * side effects for the computation tests). A small set of serialization
 * tests writes XML to the system temp directory and cleans up after itself.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pnl = require('./pnl-report.js');
const {
  generatePNL,
  generatePNLJson,
  generatePNLExcel,
  computePNL,
  resolvePeriod,
  classifyRevenue,
  classifySupplierInvoice,
  classifyPayroll,
  pctChange,
  r2,
  sum,
  CORPORATE_TAX_RATE,
} = pnl;

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const customerInvoices = [
  {
    id: 'ci-1',
    invoice_number: 'CI-001',
    issue_date: '2026-04-05',
    net_amount: 120000,
    status: 'issued',
    revenue_category: 'sales',
  },
  {
    id: 'ci-2',
    invoice_number: 'CI-002',
    issue_date: '2026-04-12',
    net_amount: 30000,
    status: 'issued',
    revenue_category: 'services',
  },
  {
    id: 'ci-3',
    invoice_number: 'CI-003',
    issue_date: '2026-04-20',
    net_amount: 5000,
    status: 'issued',
    revenue_category: 'other',
  },
  // Voided — must be ignored
  {
    id: 'ci-4',
    invoice_number: 'CI-004',
    issue_date: '2026-04-22',
    net_amount: 99999,
    status: 'voided',
    revenue_category: 'sales',
  },
];

const supplierInvoices = [
  {
    id: 'si-1',
    invoice_number: 'SI-101',
    issue_date: '2026-04-06',
    net_amount: 35000,
    status: 'issued',
    direction: 'input',
    is_asset: false,
    category: 'raw_materials',
    po_id: 'po-9',
  },
  {
    id: 'si-2',
    invoice_number: 'SI-102',
    issue_date: '2026-04-10',
    net_amount: 8000,
    status: 'issued',
    direction: 'input',
    is_asset: false,
    category: 'subcontractors',
  },
  {
    id: 'si-3',
    invoice_number: 'SI-103',
    issue_date: '2026-04-15',
    net_amount: 12000,
    status: 'issued',
    direction: 'input',
    is_asset: false,
    category: 'rent',
  },
  {
    id: 'si-4',
    invoice_number: 'SI-104',
    issue_date: '2026-04-18',
    net_amount: 3000,
    status: 'issued',
    direction: 'input',
    is_asset: false,
    category: 'marketing',
  },
  {
    id: 'si-5',
    invoice_number: 'SI-105',
    issue_date: '2026-04-25',
    net_amount: 2500,
    status: 'issued',
    direction: 'input',
    is_asset: false,
    category: 'finance',
  },
  // Capital purchase — must NOT hit P&L
  {
    id: 'si-6',
    invoice_number: 'SI-106',
    issue_date: '2026-04-28',
    net_amount: 50000,
    status: 'issued',
    direction: 'input',
    is_asset: true,
    category: 'equipment',
  },
];

const payrollRuns = [
  {
    id: 'pr-1',
    period_month: '2026-04',
    gross_pay: 40000,
    employer_cost: 52000,
    category: 'production',
    employee_count: 5,
  },
  {
    id: 'pr-2',
    period_month: '2026-04',
    gross_pay: 25000,
    employer_cost: 32000,
    category: 'office',
    employee_count: 3,
  },
];

const transactions = [
  { id: 'tx-1', transaction_date: '2026-04-11', amount: 500, category: 'interest_income', description: 'Deposit interest' },
  { id: 'tx-2', transaction_date: '2026-04-27', amount: 300, category: 'bank_fees', description: 'Monthly bank fee' },
];

const mockDataset = {
  customerInvoices,
  supplierInvoices,
  payrollRuns,
  glEntries: [],
  transactions,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

test('r2 rounds to two decimals without float drift', () => {
  assert.equal(r2(0.1 + 0.2), 0.3);
  assert.equal(r2(1234.5678), 1234.57);
  assert.equal(r2(null), 0);
});

test('sum aggregates a numeric array', () => {
  assert.equal(sum([1.1, 2.2, 3.3]), 6.6);
  assert.equal(sum([]), 0);
  assert.equal(sum([null, undefined, 5]), 5);
});

test('pctChange computes percent delta and handles zero base', () => {
  assert.equal(pctChange(110, 100), 10);
  assert.equal(pctChange(90, 100), -10);
  assert.equal(pctChange(100, 0), null);
  assert.equal(pctChange(0, 0), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFIERS
// ═══════════════════════════════════════════════════════════════════════════

test('classifyRevenue buckets invoices', () => {
  assert.equal(classifyRevenue({ revenue_category: 'sales' }), 'sales');
  assert.equal(classifyRevenue({ revenue_category: 'services' }), 'services');
  assert.equal(classifyRevenue({ revenue_category: 'other' }), 'other');
  assert.equal(classifyRevenue({}), 'sales');
});

test('classifySupplierInvoice buckets by category', () => {
  assert.equal(
    classifySupplierInvoice({ category: 'raw_materials', is_asset: false }),
    'cogs.rawMaterials',
  );
  assert.equal(
    classifySupplierInvoice({ category: 'rent', is_asset: false }),
    'operatingExpenses.rent',
  );
  assert.equal(
    classifySupplierInvoice({ category: 'finance', is_asset: false }),
    'financeNet.expense',
  );
  // Capital → not P&L
  assert.equal(classifySupplierInvoice({ category: 'equipment', is_asset: true }), null);
});

test('classifyPayroll distinguishes production vs office labor', () => {
  assert.equal(classifyPayroll({ category: 'production' }), 'cogs.productionLabor');
  assert.equal(classifyPayroll({ category: 'office' }), 'operatingExpenses.salaries');
  assert.equal(classifyPayroll({}), 'operatingExpenses.salaries');
});

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

test('resolvePeriod — monthly', () => {
  const p = resolvePeriod(2026, 4);
  assert.equal(p.type, 'month');
  assert.equal(p.label, '2026-04');
  assert.equal(p.start, '2026-04-01');
  assert.equal(p.end, '2026-04-30');
  assert.equal(p.prevStart, '2026-03-01');
  assert.equal(p.prevEnd, '2026-03-31');
  assert.equal(p.yoyStart, '2025-04-01');
  assert.equal(p.yoyEnd, '2025-04-30');
});

test('resolvePeriod — quarterly Q2', () => {
  const p = resolvePeriod(2026, 'Q2');
  assert.equal(p.type, 'quarter');
  assert.equal(p.start, '2026-04-01');
  assert.equal(p.end, '2026-06-30');
  assert.equal(p.yoyStart, '2025-04-01');
  assert.equal(p.yoyEnd, '2025-06-30');
});

test('resolvePeriod — annual', () => {
  const p = resolvePeriod(2026, null);
  assert.equal(p.type, 'year');
  assert.equal(p.start, '2026-01-01');
  assert.equal(p.end, '2026-12-31');
  assert.equal(p.yoyStart, '2025-01-01');
  assert.equal(p.yoyEnd, '2025-12-31');
});

test('resolvePeriod rejects invalid inputs', () => {
  assert.throws(() => resolvePeriod(null, 4));
  assert.throws(() => resolvePeriod(2026, 13));
  assert.throws(() => resolvePeriod(2026, 'Q5'));
});

// ═══════════════════════════════════════════════════════════════════════════
// CORE COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

test('computePNL — headline numbers match hand calculation', () => {
  const out = computePNL(mockDataset, { label: '2026-04', start: '2026-04-01', end: '2026-04-30' });

  // Revenue: 120000 + 30000 + 5000 = 155000 (voided ignored)
  assert.equal(out.revenue.total, 155000);
  assert.equal(out.revenue.lines.find(l => l.code === 'revenue.sales').amount, 120000);
  assert.equal(out.revenue.lines.find(l => l.code === 'revenue.services').amount, 30000);
  assert.equal(out.revenue.lines.find(l => l.code === 'revenue.other').amount, 5000);

  // COGS: raw 35000 + subs 8000 + production labor 52000 = 95000
  assert.equal(out.cogs.total, 95000);
  assert.equal(out.cogs.lines.find(l => l.code === 'cogs.rawMaterials').amount, 35000);
  assert.equal(out.cogs.lines.find(l => l.code === 'cogs.subcontractors').amount, 8000);
  assert.equal(out.cogs.lines.find(l => l.code === 'cogs.productionLabor').amount, 52000);

  // Gross profit
  assert.equal(out.grossProfit, 60000);

  // OpEx: rent 12000 + marketing 3000 + office salaries 32000 = 47000
  assert.equal(out.operatingExpenses.total, 47000);

  // EBIT
  assert.equal(out.ebit, 13000);

  // Finance: supplier 2500 + bank_fees 300 expense; interest_income 500
  // net = 2800 - 500 = 2300
  assert.equal(out.financeNet.expense.amount, 2800);
  assert.equal(out.financeNet.income.amount, 500);
  assert.equal(out.financeNet.net, 2300);

  // EBT
  assert.equal(out.ebt, r2(13000 - 2300));
  // Tax at 23%
  assert.equal(out.taxProvision, r2(out.ebt * CORPORATE_TAX_RATE));
  // Net income
  assert.equal(out.netIncome, r2(out.ebt - out.taxProvision));
});

test('computePNL — capital purchases are excluded from P&L', () => {
  const out = computePNL(mockDataset);
  // None of the COGS lines should carry the 50,000 equipment purchase.
  for (const l of out.cogs.lines) {
    const auditTotal = l.audit.reduce((a, b) => a + (b.amount || 0), 0);
    assert.notEqual(auditTotal, 50000);
  }
  for (const l of out.operatingExpenses.lines) {
    const auditTotal = l.audit.reduce((a, b) => a + (b.amount || 0), 0);
    assert.notEqual(auditTotal, 50000);
  }
});

test('computePNL — margins are null when revenue is zero', () => {
  const out = computePNL({
    customerInvoices: [],
    supplierInvoices: [],
    payrollRuns: [],
    glEntries: [],
    transactions: [],
  });
  assert.equal(out.grossMargin, null);
  assert.equal(out.operatingMargin, null);
  assert.equal(out.netMargin, null);
  assert.equal(out.taxProvision, 0);
});

test('computePNL — loss does not generate a tax credit', () => {
  const out = computePNL({
    customerInvoices: [
      { id: 'r1', issue_date: '2026-04-01', net_amount: 10000, status: 'issued', revenue_category: 'sales' },
    ],
    supplierInvoices: [
      { id: 's1', issue_date: '2026-04-02', net_amount: 20000, status: 'issued', direction: 'input', is_asset: false, category: 'raw_materials' },
    ],
    payrollRuns: [],
    glEntries: [],
    transactions: [],
  });
  assert.ok(out.ebt < 0);
  assert.equal(out.taxProvision, 0);
  assert.equal(out.netIncome, out.ebt);
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT TRAIL
// ═══════════════════════════════════════════════════════════════════════════

test('audit trail captures source id for every non-zero line', () => {
  const out = computePNL(mockDataset);
  const salesLine = out.revenue.lines.find(l => l.code === 'revenue.sales');
  assert.equal(salesLine.audit.length, 1);
  assert.equal(salesLine.audit[0].source, 'customer_invoice');
  assert.equal(salesLine.audit[0].id, 'ci-1');
  assert.equal(salesLine.audit[0].ref, 'CI-001');
  assert.equal(salesLine.audit[0].amount, 120000);

  const rawLine = out.cogs.lines.find(l => l.code === 'cogs.rawMaterials');
  assert.equal(rawLine.audit.length, 1);
  assert.equal(rawLine.audit[0].source, 'supplier_invoice');
  assert.equal(rawLine.audit[0].po_id, 'po-9');
});

// ═══════════════════════════════════════════════════════════════════════════
// JSON OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

test('generatePNLJson produces a UI-friendly shape', () => {
  const core = computePNL(mockDataset, { label: '2026-04', start: '2026-04-01', end: '2026-04-30' });
  const json = generatePNLJson(core);

  assert.equal(json.version, '1.0');
  assert.ok(json.revenue.totalFormatted.includes('155'));
  assert.ok(json.netIncome.amountFormatted.length > 0);
  assert.equal(json.taxProvision.rate, CORPORATE_TAX_RATE);
  assert.equal(json.taxProvision.ratePercent, '23%');
  assert.ok(Array.isArray(json.revenue.lines));
  assert.ok(json.revenue.lines[0].label);
  assert.ok('auditCount' in json.revenue.lines[0]);
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPARISONS (YoY / MoM)
// ═══════════════════════════════════════════════════════════════════════════

test('generatePNL — MoM / YoY comparisons with a fake supabase client', async () => {
  // Build a fake Supabase: every query returns a canned dataset based on the date range.
  const datasetByRange = {
    // April 2026 — current
    '2026-04-01..2026-04-30': {
      customer_invoices: [{ id: 'a', net_amount: 100000, status: 'issued', revenue_category: 'sales' }],
      tax_invoices: [{ id: 'b', net_amount: 30000, status: 'issued', direction: 'input', is_asset: false, category: 'raw_materials' }],
      payroll_runs: [],
      gl_entries: [],
      transactions: [],
    },
    // March 2026 — MoM
    '2026-03-01..2026-03-31': {
      customer_invoices: [{ id: 'c', net_amount: 80000, status: 'issued', revenue_category: 'sales' }],
      tax_invoices: [{ id: 'd', net_amount: 25000, status: 'issued', direction: 'input', is_asset: false, category: 'raw_materials' }],
      payroll_runs: [],
      gl_entries: [],
      transactions: [],
    },
    // April 2025 — YoY
    '2025-04-01..2025-04-30': {
      customer_invoices: [{ id: 'e', net_amount: 50000, status: 'issued', revenue_category: 'sales' }],
      tax_invoices: [{ id: 'f', net_amount: 10000, status: 'issued', direction: 'input', is_asset: false, category: 'raw_materials' }],
      payroll_runs: [],
      gl_entries: [],
      transactions: [],
    },
  };

  const fakeSupabase = {
    from(table) {
      let gte, lte;
      const query = {
        select() {
          return query;
        },
        gte(_col, v) {
          gte = v;
          return query;
        },
        lte(_col, v) {
          lte = v;
          // Terminal call returns a thenable that resolves with { data, error }
          const key = `${gte}..${lte}`;
          const bucket = datasetByRange[key] || {};
          return Promise.resolve({ data: bucket[table] || [], error: null });
        },
      };
      return query;
    },
  };

  const report = await generatePNL(2026, 4, { supabase: fakeSupabase });

  assert.equal(report.revenue.total, 100000);
  assert.equal(report.cogs.total, 30000);
  assert.equal(report.grossProfit, 70000);
  assert.ok(report.comparisons);

  // MoM: revenue 100000 vs 80000 → +25%
  assert.equal(report.comparisons.mom.revenue.pct, 25);
  // YoY: revenue 100000 vs 50000 → +100%
  assert.equal(report.comparisons.yoy.revenue.pct, 100);
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY / MISSING SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

test('generatePNL tolerates a missing supabase client', async () => {
  const report = await generatePNL(2026, 4, {});
  assert.equal(report.revenue.total, 0);
  assert.equal(report.netIncome, 0);
  assert.ok(report.warnings.length > 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// EXCEL OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

test('generatePNLExcel writes a valid SpreadsheetML XML file', () => {
  const core = computePNL(mockDataset, { label: '2026-04', start: '2026-04-01', end: '2026-04-30' });
  const json = generatePNLJson(core); // sanity check that JSON works before writing
  assert.ok(json);

  const outPath = path.join(os.tmpdir(), `pnl-test-${Date.now()}.xml`);
  generatePNLExcel(core, outPath);

  try {
    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(content.startsWith('<?xml'));
    assert.ok(content.includes('<Workbook'));
    assert.ok(content.includes('<Worksheet ss:Name="P&amp;L">'));
    assert.ok(content.includes('155000.00')); // revenue total
    assert.ok(content.includes('Audit Trail'));
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch (_) {
      /* ignore */
    }
  }
});

test('generatePNLExcel escapes XML special characters in audit refs', () => {
  const data = computePNL({
    customerInvoices: [
      { id: 'x1', invoice_number: 'A&B<>"\'', issue_date: '2026-04-01', net_amount: 100, status: 'issued' },
    ],
    supplierInvoices: [],
    payrollRuns: [],
    glEntries: [],
    transactions: [],
  });
  const outPath = path.join(os.tmpdir(), `pnl-escape-${Date.now()}.xml`);
  generatePNLExcel(data, outPath);
  try {
    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(content.includes('A&amp;B&lt;&gt;'));
    assert.ok(!content.includes('A&B<>')); // raw form must be absent
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch (_) {
      /* ignore */
    }
  }
});
