/**
 * Financial Statements Generator — Unit Tests
 * Agent X-40 — Techno-Kol Uzi ERP / Swarm 3C — 2026-04-11
 *
 * Run with:  node --test test/payroll/financial-statements.test.js
 *
 * Coverage (20+ test cases):
 *   1.  Module loads and exposes public surface
 *   2.  resolvePeriod: month / quarter / year / custom / shorthand
 *   3.  priorPeriod: month→prior month, quarter→prior quarter, year→prior year
 *   4.  yoyPeriod: same period last year
 *   5.  classify: assets / liabilities / equity / revenue / cogs / opex / finance / tax
 *   6.  normaliseLine: FX conversion to ILS
 *   7.  trialBalance: balanced on well-formed ledger
 *   8.  trialBalance: imbalance is detected
 *   9.  trialBalance: subtotals by section
 *  10.  trialBalance: opening / movement / closing separation
 *  11.  balanceSheet: assets = liabilities + equity fundamental check
 *  12.  balanceSheet: comparative date produces variance column
 *  13.  balanceSheet: synthetic net income flows to retained earnings
 *  14.  incomeStatement: revenue / cogs / gross / operating / net cascade
 *  15.  incomeStatement: gross / operating / net margin percents
 *  16.  incomeStatement: comparative yoy growth %
 *  17.  incomeStatement: Israeli 23% corporate tax
 *  18.  cashFlowStatement: indirect method with net income + depreciation
 *  19.  cashFlowStatement: beginning + net = ending cash reconciliation
 *  20.  cashFlowStatement: investing vs financing classification
 *  21.  equityStatement: opening + movements + closing
 *  22.  equityStatement: net income + dividends tracked
 *  23.  reportPack: all statements bundled with cross-checks
 *  24.  Consolidation: entities filter narrows the ledger
 *  25.  Consolidation: eliminations net out intercompany balances
 *  26.  toExcelXml: produces a valid SpreadsheetML XML string
 *  27.  toPrintableText: readable text representation
 *  28.  Multi-currency: USD and EUR roll up to ILS via fx_to_ils
 *  29.  Zero/empty input: reports return sane structure
 *  30.  Drill-down audit: source ids preserved in every level
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const fs = require(
  path.resolve(__dirname, '..', '..', 'src', 'gl', 'financial-statements.js')
);
const {
  trialBalance,
  balanceSheet,
  incomeStatement,
  cashFlowStatement,
  equityStatement,
  reportPack,
  toExcelXml,
  toPrintableText,
  resolvePeriod,
  priorPeriod,
  yoyPeriod,
  classify,
  normaliseLine,
  CORPORATE_TAX_RATE,
  BALANCE_TOLERANCE,
  _internals,
} = fs;

// ─────────────────────────────────────────────────────────────
// Sample GL ledger helpers
// ─────────────────────────────────────────────────────────────

/**
 * Build a sample Techno-Kol ledger for Q1 2026:
 *   • opening cash 100,000 (from prior year's retained earnings)
 *   • January: sale 50,000 + COGS 20,000 + salary 8,000 + rent 3,000
 *   • February: sale 60,000 + COGS 22,000 + salary 8,000 + rent 3,000
 *   • March: sale 70,000 + COGS 25,000 + salary 8,000 + rent 3,000
 *   • March 15: depreciation 4,000
 *   • March 20: paid off 5,000 of long-term loan (financing)
 *
 * Chart:
 *   1110 Cash (asset, current)
 *   1120 Accounts Receivable (asset, current)
 *   1210 PPE (asset, non-current)
 *   2110 Accounts Payable (liab, current)
 *   2210 Long-term Loan (liab, non-current)
 *   3100 Share Capital (equity)
 *   3200 Retained Earnings (equity)
 *   4100 Sales Revenue
 *   5100 COGS
 *   6100 Salaries
 *   6200 Rent
 *   6300 Depreciation
 *   8100 Finance Expense
 *   9100 Tax Expense
 */
function buildSampleLedger() {
  const lines = [];
  const push = (l) => lines.push(l);

  // Prior-year opening balances (booked at 2025-12-31)
  push({ id: 'op-cash', account: '1110', name_he: 'מזומן', name_en: 'Cash',
         date: '2025-12-31', debit: 100000, credit: 0 });
  push({ id: 'op-cap', account: '3100', name_he: 'הון מניות', name_en: 'Share Capital',
         date: '2025-12-31', debit: 0, credit: 50000 });
  push({ id: 'op-re', account: '3200', name_he: 'עודפים', name_en: 'Retained Earnings',
         date: '2025-12-31', debit: 0, credit: 50000 });

  // PPE — machinery acquired 2025-06-01
  push({ id: 'op-ppe', account: '1210', name_he: 'מכונות', name_en: 'Machinery',
         date: '2025-06-01', debit: 40000, credit: 0 });
  push({ id: 'op-ppe-c', account: '1110', name_he: 'מזומן', name_en: 'Cash',
         date: '2025-06-01', debit: 0, credit: 40000 });
  push({ id: 'op-loan', account: '2210', name_he: 'הלוואה ארוכת טווח', name_en: 'Long-term Loan',
         date: '2025-06-01', debit: 0, credit: 40000 });
  push({ id: 'op-loan-c', account: '1110', name_he: 'מזומן', name_en: 'Cash',
         date: '2025-06-01', debit: 40000, credit: 0 });

  // January 2026
  push({ id: 'j1-s', account: '4100', name_he: 'מכירות', name_en: 'Sales', date: '2026-01-15', debit: 0, credit: 50000, source: 'invoice', source_id: 1001 });
  push({ id: 'j1-ar', account: '1120', name_he: 'לקוחות', name_en: 'Accounts Receivable', date: '2026-01-15', debit: 50000, credit: 0, source: 'invoice', source_id: 1001 });
  push({ id: 'j1-c', account: '5100', name_he: 'עלות המכר', name_en: 'COGS', date: '2026-01-15', debit: 20000, credit: 0 });
  push({ id: 'j1-cp', account: '2110', name_he: 'ספקים', name_en: 'Accounts Payable', date: '2026-01-15', debit: 0, credit: 20000 });
  push({ id: 'j1-sal', account: '6100', name_he: 'משכורות', name_en: 'Salaries', date: '2026-01-25', debit: 8000, credit: 0 });
  push({ id: 'j1-sal-c', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-01-25', debit: 0, credit: 8000 });
  push({ id: 'j1-rent', account: '6200', name_he: 'שכר דירה', name_en: 'Rent', date: '2026-01-01', debit: 3000, credit: 0 });
  push({ id: 'j1-rent-c', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-01-01', debit: 0, credit: 3000 });

  // February 2026
  push({ id: 'f1-s', account: '4100', name_he: 'מכירות', name_en: 'Sales', date: '2026-02-10', debit: 0, credit: 60000, source: 'invoice', source_id: 1002 });
  push({ id: 'f1-ar', account: '1120', name_he: 'לקוחות', name_en: 'Accounts Receivable', date: '2026-02-10', debit: 60000, credit: 0, source: 'invoice', source_id: 1002 });
  push({ id: 'f1-c', account: '5100', name_he: 'עלות המכר', name_en: 'COGS', date: '2026-02-10', debit: 22000, credit: 0 });
  push({ id: 'f1-cp', account: '2110', name_he: 'ספקים', name_en: 'Accounts Payable', date: '2026-02-10', debit: 0, credit: 22000 });
  push({ id: 'f1-sal', account: '6100', name_he: 'משכורות', name_en: 'Salaries', date: '2026-02-25', debit: 8000, credit: 0 });
  push({ id: 'f1-sal-c', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-02-25', debit: 0, credit: 8000 });
  push({ id: 'f1-rent', account: '6200', name_he: 'שכר דירה', name_en: 'Rent', date: '2026-02-01', debit: 3000, credit: 0 });
  push({ id: 'f1-rent-c', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-02-01', debit: 0, credit: 3000 });

  // Collection of January AR on Feb 28
  push({ id: 'f1-col', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-02-28', debit: 50000, credit: 0 });
  push({ id: 'f1-col-c', account: '1120', name_he: 'לקוחות', name_en: 'Accounts Receivable', date: '2026-02-28', debit: 0, credit: 50000 });

  // March 2026
  push({ id: 'm1-s', account: '4100', name_he: 'מכירות', name_en: 'Sales', date: '2026-03-10', debit: 0, credit: 70000, source: 'invoice', source_id: 1003 });
  push({ id: 'm1-ar', account: '1120', name_he: 'לקוחות', name_en: 'Accounts Receivable', date: '2026-03-10', debit: 70000, credit: 0, source: 'invoice', source_id: 1003 });
  push({ id: 'm1-c', account: '5100', name_he: 'עלות המכר', name_en: 'COGS', date: '2026-03-10', debit: 25000, credit: 0 });
  push({ id: 'm1-cp', account: '2110', name_he: 'ספקים', name_en: 'Accounts Payable', date: '2026-03-10', debit: 0, credit: 25000 });
  push({ id: 'm1-sal', account: '6100', name_he: 'משכורות', name_en: 'Salaries', date: '2026-03-25', debit: 8000, credit: 0 });
  push({ id: 'm1-sal-c', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-03-25', debit: 0, credit: 8000 });
  push({ id: 'm1-rent', account: '6200', name_he: 'שכר דירה', name_en: 'Rent', date: '2026-03-01', debit: 3000, credit: 0 });
  push({ id: 'm1-rent-c', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-03-01', debit: 0, credit: 3000 });

  // Depreciation 2026-03-15
  push({ id: 'm1-dep', account: '6300', name_he: 'פחת', name_en: 'Depreciation', date: '2026-03-15', debit: 4000, credit: 0 });
  push({ id: 'm1-dep-c', account: '1210', name_he: 'פחת נצבר', name_en: 'Accumulated Depreciation', date: '2026-03-15', debit: 0, credit: 4000 });

  // Loan repayment 2026-03-20 (5000)
  push({ id: 'm1-ln', account: '2210', name_he: 'הלוואה ארוכת טווח', name_en: 'Long-term Loan', date: '2026-03-20', debit: 5000, credit: 0 });
  push({ id: 'm1-ln-c', account: '1110', name_he: 'מזומן', name_en: 'Cash', date: '2026-03-20', debit: 0, credit: 5000 });

  return lines;
}

// ─────────────────────────────────────────────────────────────
// 1. Module surface
// ─────────────────────────────────────────────────────────────
test('1) exports: module exposes the required public API', () => {
  assert.equal(typeof trialBalance, 'function');
  assert.equal(typeof balanceSheet, 'function');
  assert.equal(typeof incomeStatement, 'function');
  assert.equal(typeof cashFlowStatement, 'function');
  assert.equal(typeof equityStatement, 'function');
  assert.equal(typeof reportPack, 'function');
  assert.equal(typeof toExcelXml, 'function');
  assert.equal(typeof toPrintableText, 'function');
  assert.equal(CORPORATE_TAX_RATE, 0.23);
  assert.ok(_internals);
});

// ─────────────────────────────────────────────────────────────
// 2. Period resolution
// ─────────────────────────────────────────────────────────────
test('2) resolvePeriod: month / quarter / year / custom / shorthand', () => {
  const jan = resolvePeriod({ year: 2026, month: 1 });
  assert.equal(jan.kind, 'month');
  assert.equal(jan.from, '2026-01-01');
  assert.equal(jan.to, '2026-01-31');

  const q1 = resolvePeriod({ year: 2026, quarter: 1 });
  assert.equal(q1.kind, 'quarter');
  assert.equal(q1.from, '2026-01-01');
  assert.equal(q1.to, '2026-03-31');

  const yr = resolvePeriod({ year: 2026 });
  assert.equal(yr.kind, 'year');
  assert.equal(yr.from, '2026-01-01');
  assert.equal(yr.to, '2026-12-31');

  const custom = resolvePeriod({ from: '2026-02-15', to: '2026-04-11' });
  assert.equal(custom.kind, 'custom');
  assert.equal(custom.from, '2026-02-15');
  assert.equal(custom.to, '2026-04-11');

  const shortM = resolvePeriod('2026-03');
  assert.equal(shortM.kind, 'month');
  assert.equal(shortM.from, '2026-03-01');

  const shortQ = resolvePeriod('2026-Q1');
  assert.equal(shortQ.kind, 'quarter');
  assert.equal(shortQ.to, '2026-03-31');
});

// ─────────────────────────────────────────────────────────────
// 3. priorPeriod
// ─────────────────────────────────────────────────────────────
test('3) priorPeriod: month/quarter/year', () => {
  const prevMonth = priorPeriod(resolvePeriod({ year: 2026, month: 1 }));
  assert.equal(prevMonth.year, 2025);
  assert.equal(prevMonth.month, 12);

  const prevQ = priorPeriod(resolvePeriod({ year: 2026, quarter: 1 }));
  assert.equal(prevQ.year, 2025);
  assert.equal(prevQ.quarter, 4);

  const prevY = priorPeriod(resolvePeriod({ year: 2026 }));
  assert.equal(prevY.year, 2025);
});

// ─────────────────────────────────────────────────────────────
// 4. yoyPeriod
// ─────────────────────────────────────────────────────────────
test('4) yoyPeriod: same period last year', () => {
  const y = yoyPeriod(resolvePeriod({ year: 2026, month: 3 }));
  assert.equal(y.year, 2025);
  assert.equal(y.month, 3);

  const yq = yoyPeriod(resolvePeriod({ year: 2026, quarter: 2 }));
  assert.equal(yq.year, 2025);
  assert.equal(yq.quarter, 2);
});

// ─────────────────────────────────────────────────────────────
// 5. Classify
// ─────────────────────────────────────────────────────────────
test('5) classify: by account number prefix', () => {
  assert.equal(classify('1110').section, 'assets');
  assert.equal(classify('1110').subsection, 'current');
  assert.equal(classify('1210').subsection, 'nonCurrent');
  assert.equal(classify('2110').section, 'liabilities');
  assert.equal(classify('2210').subsection, 'nonCurrent');
  assert.equal(classify('3100').section, 'equity');
  assert.equal(classify('4100').section, 'revenue');
  assert.equal(classify('5100').section, 'cogs');
  assert.equal(classify('6100').section, 'opex');
  assert.equal(classify('8100').section, 'finance');
  assert.equal(classify('9100').section, 'tax');
});

// ─────────────────────────────────────────────────────────────
// 6. normaliseLine: FX conversion
// ─────────────────────────────────────────────────────────────
test('6) normaliseLine: FX converts to ILS', () => {
  const line = normaliseLine({
    id: 1, account: '4100', date: '2026-03-01',
    debit: 0, credit: 1000, currency: 'USD', fx_to_ils: 3.65,
  });
  assert.equal(line.credit, 3650);
  assert.equal(line.original_credit, 1000);
  assert.equal(line.currency, 'USD');
  assert.equal(line.fx_to_ils, 3.65);
});

// ─────────────────────────────────────────────────────────────
// 7. Trial balance — balanced
// ─────────────────────────────────────────────────────────────
test('7) trialBalance: balanced on well-formed ledger', () => {
  const lines = buildSampleLedger();
  const tb = trialBalance({ year: 2026, quarter: 1 }, { glLines: lines });
  assert.ok(tb.balanced, `TB should be balanced, diff=${tb.diff}`);
  assert.equal(tb.totals.movement.debit, tb.totals.movement.credit);
});

// ─────────────────────────────────────────────────────────────
// 8. Trial balance — imbalance detected
// ─────────────────────────────────────────────────────────────
test('8) trialBalance: imbalance is surfaced', () => {
  const lines = buildSampleLedger();
  // Introduce a bogus single-sided entry
  lines.push({ id: 'bad', account: '1110', date: '2026-03-29', debit: 999, credit: 0 });
  const tb = trialBalance({ year: 2026, quarter: 1 }, { glLines: lines });
  assert.equal(tb.balanced, false);
  assert.equal(tb.diff, 999);
});

// ─────────────────────────────────────────────────────────────
// 9. Trial balance — subtotals by section
// ─────────────────────────────────────────────────────────────
test('9) trialBalance: subtotals include every used section', () => {
  const lines = buildSampleLedger();
  const tb = trialBalance({ year: 2026, quarter: 1 }, { glLines: lines });
  const sections = tb.subtotals.map((s) => s.section).sort();
  for (const s of ['assets', 'liabilities', 'equity', 'revenue', 'cogs', 'opex']) {
    assert.ok(sections.includes(s), `section ${s} should appear`);
  }
});

// ─────────────────────────────────────────────────────────────
// 10. Opening / Movement / Closing separation
// ─────────────────────────────────────────────────────────────
test('10) trialBalance: opening / movement / closing split', () => {
  const lines = buildSampleLedger();
  const tb = trialBalance({ year: 2026, quarter: 1 }, { glLines: lines });
  const cash = tb.accounts.find((a) => a.account === '1110');
  assert.ok(cash);
  // Opening cash = 100,000 (dr) + PPE-related buy/loan offsetting to 100,000
  assert.ok(cash.opening.balance > 0, 'opening cash should be positive');
  // Movement in Q1 should include salary + rent outflows and collection inflow
  assert.ok(cash.movement.debit > 0);
  assert.ok(cash.movement.credit > 0);
});

// ─────────────────────────────────────────────────────────────
// 11. Balance sheet — fundamental equation
// ─────────────────────────────────────────────────────────────
test('11) balanceSheet: total assets = total liab + equity', () => {
  const lines = buildSampleLedger();
  const bs = balanceSheet('2026-03-31', { glLines: lines });
  assert.ok(bs.checks.assets_equal_liab_equity,
    `BS should balance, diff=${bs.checks.diff} totals=${JSON.stringify(bs.totals)}`);
  assert.ok(Math.abs(bs.totals.total_assets - bs.totals.total_liab_plus_equity) <= BALANCE_TOLERANCE);
});

// ─────────────────────────────────────────────────────────────
// 12. Balance sheet — comparative & variance
// ─────────────────────────────────────────────────────────────
test('12) balanceSheet: comparative date produces variance', () => {
  const lines = buildSampleLedger();
  const bs = balanceSheet('2026-03-31', {
    glLines: lines,
    comparativeDate: '2026-01-31',
  });
  assert.ok(bs.comparative);
  assert.ok(bs.variance);
  // Assets should grow from January (which only has one month's activity)
  assert.ok(bs.totals.total_assets >= bs.comparative.totals.total_assets);
  assert.ok(bs.variance.total_assets >= 0);
});

// ─────────────────────────────────────────────────────────────
// 13. Balance sheet — synthetic net income
// ─────────────────────────────────────────────────────────────
test('13) balanceSheet: net income folds into equity', () => {
  const lines = buildSampleLedger();
  const bs = balanceSheet('2026-03-31', { glLines: lines });
  assert.ok(bs.equity.retained_earnings_period !== 0,
    'period RE should be non-zero given revenue and expenses');
  const synth = bs.equity.accounts.find((a) => a.synthetic);
  assert.ok(synth, 'synthetic RE line should be present');
});

// ─────────────────────────────────────────────────────────────
// 14. Income statement cascade
// ─────────────────────────────────────────────────────────────
test('14) incomeStatement: revenue → gross → operating → net cascade', () => {
  const lines = buildSampleLedger();
  const is = incomeStatement('2026-01-01', '2026-03-31', { glLines: lines });
  assert.equal(is.revenue.total, 180000); // 50 + 60 + 70
  assert.equal(is.cogs.total, 67000);     // 20 + 22 + 25
  assert.equal(is.profit.gross, 113000);
  // Opex: salaries 24k + rent 9k + depreciation 4k = 37k
  assert.equal(is.opex.total, 37000);
  assert.equal(is.profit.operating, 76000);
});

// ─────────────────────────────────────────────────────────────
// 15. Margins
// ─────────────────────────────────────────────────────────────
test('15) incomeStatement: margin percents', () => {
  const lines = buildSampleLedger();
  const is = incomeStatement('2026-01-01', '2026-03-31', { glLines: lines });
  // Gross margin = 113000 / 180000 = 62.78%
  assert.ok(Math.abs(is.margins.gross_pct - 62.78) < 0.05);
  // Operating margin = 76000 / 180000 = 42.22%
  assert.ok(Math.abs(is.margins.operating_pct - 42.22) < 0.05);
  assert.ok(is.margins.net_pct > 0);
});

// ─────────────────────────────────────────────────────────────
// 16. YoY growth
// ─────────────────────────────────────────────────────────────
test('16) incomeStatement: yoy comparative growth', () => {
  // Minimal prior-year ledger: 100,000 revenue in Q1 2025, 50,000 COGS
  const prior = [
    { id: 'p-s', account: '4100', name_he: 'מכירות', name_en: 'Sales', date: '2025-02-15', debit: 0, credit: 100000 },
    { id: 'p-s-d', account: '1120', name_he: 'לקוחות', name_en: 'AR', date: '2025-02-15', debit: 100000, credit: 0 },
    { id: 'p-c', account: '5100', name_he: 'COGS', name_en: 'COGS', date: '2025-02-15', debit: 50000, credit: 0 },
    { id: 'p-c-d', account: '2110', name_he: 'ספקים', name_en: 'AP', date: '2025-02-15', debit: 0, credit: 50000 },
  ];
  const lines = [...prior, ...buildSampleLedger()];
  const is = incomeStatement('2026-01-01', '2026-03-31', { glLines: lines, yoy: true });
  assert.ok(is.comparative);
  assert.equal(is.comparative.revenue.total, 100000);
  // Growth = (180000 - 100000) / 100000 * 100 = 80%
  assert.ok(Math.abs(is.growth.revenue - 80) < 0.01);
});

// ─────────────────────────────────────────────────────────────
// 17. Israeli 23% corporate tax
// ─────────────────────────────────────────────────────────────
test('17) incomeStatement: applies 23% Israeli corporate tax', () => {
  const lines = buildSampleLedger();
  const is = incomeStatement('2026-01-01', '2026-03-31', { glLines: lines });
  assert.equal(is.tax.rate, 0.23);
  const expected = Math.round(is.profit.pre_tax * 0.23 * 100) / 100;
  assert.equal(is.tax.expense, expected);
  assert.equal(is.profit.net,
    Math.round((is.profit.pre_tax - expected) * 100) / 100);
});

// ─────────────────────────────────────────────────────────────
// 18. Cash-flow statement — indirect method
// ─────────────────────────────────────────────────────────────
test('18) cashFlowStatement: indirect method with NI + depreciation', () => {
  const lines = buildSampleLedger();
  const cf = cashFlowStatement('2026-01-01', '2026-03-31', { glLines: lines });
  assert.equal(cf.operating.depreciation_amortisation, 4000);
  assert.ok(cf.operating.net_income !== 0);
  assert.ok(Array.isArray(cf.operating.adjustments));
  assert.equal(cf.meta.method, 'indirect');
});

// ─────────────────────────────────────────────────────────────
// 19. Cash-flow reconciliation
// ─────────────────────────────────────────────────────────────
test('19) cashFlowStatement: begin + net = ending cash', () => {
  const lines = buildSampleLedger();
  const cf = cashFlowStatement('2026-01-01', '2026-03-31', { glLines: lines });
  const diff = Math.abs((cf.beginning_cash + cf.net_change) - cf.ending_cash);
  assert.ok(diff <= BALANCE_TOLERANCE + 0.01,
    `reconciliation diff too large: ${diff}`);
});

// ─────────────────────────────────────────────────────────────
// 20. Cash-flow classification
// ─────────────────────────────────────────────────────────────
test('20) cashFlowStatement: investing vs financing separation', () => {
  const lines = buildSampleLedger();
  const cf = cashFlowStatement('2026-01-01', '2026-03-31', { glLines: lines });
  // Loan repayment of -5000 should land in financing (via LTL delta)
  const ltl = cf.financing.items.find((i) => i.account === '2210');
  assert.ok(ltl, 'long-term loan movement should appear in financing');
  assert.equal(ltl.delta, -5000);
});

// ─────────────────────────────────────────────────────────────
// 21. Equity statement — opening/movement/closing
// ─────────────────────────────────────────────────────────────
test('21) equityStatement: opening + movements + closing rows', () => {
  const lines = buildSampleLedger();
  const eq = equityStatement({ year: 2026, quarter: 1 }, { glLines: lines });
  const shareCap = eq.rows.find((r) => r.account === '3100');
  assert.ok(shareCap);
  assert.equal(shareCap.opening, 50000);
  assert.equal(shareCap.closing, 50000); // no movement
  const re = eq.rows.find((r) => r.account === '3200');
  assert.equal(re.opening, 50000);
});

// ─────────────────────────────────────────────────────────────
// 22. Equity movements — dividends + share capital issues
// ─────────────────────────────────────────────────────────────
test('22) equityStatement: tracks dividends and new share capital', () => {
  const lines = buildSampleLedger();
  // Simulate a 10,000 dividend paid on 2026-03-28
  lines.push({ id: 'div', account: '3300', name_he: 'דיבידנד ששולם', name_en: 'Dividend Paid',
    date: '2026-03-28', debit: 10000, credit: 0 });
  lines.push({ id: 'div-c', account: '1110', name_he: 'מזומן', name_en: 'Cash',
    date: '2026-03-28', debit: 0, credit: 10000 });

  const eq = equityStatement({ year: 2026, quarter: 1 }, { glLines: lines });
  assert.ok(eq.movements.dividends_paid !== 0,
    'dividends_paid should track the dividend line');
});

// ─────────────────────────────────────────────────────────────
// 23. Report pack
// ─────────────────────────────────────────────────────────────
test('23) reportPack: bundles all statements with checks', () => {
  const lines = buildSampleLedger();
  const pack = reportPack({ year: 2026, quarter: 1 }, { glLines: lines });
  assert.ok(pack.trial_balance);
  assert.ok(pack.income_statement);
  assert.ok(pack.balance_sheet);
  assert.ok(pack.cash_flow_statement);
  assert.ok(pack.equity_statement);
  assert.equal(pack.checks.trial_balance_balanced, true);
  assert.equal(pack.checks.balance_sheet_balanced, true);
});

// ─────────────────────────────────────────────────────────────
// 24. Consolidation — entities filter
// ─────────────────────────────────────────────────────────────
test('24) consolidation: entities filter narrows the ledger', () => {
  const lines = buildSampleLedger().map((l) => ({ ...l, entity: 'parent' }));
  // Add a sub's revenue of 30,000
  lines.push({ id: 'sub1', account: '4100', entity: 'sub1',
    date: '2026-03-01', debit: 0, credit: 30000 });
  lines.push({ id: 'sub1-d', account: '1120', entity: 'sub1',
    date: '2026-03-01', debit: 30000, credit: 0 });

  const isParent = incomeStatement('2026-01-01', '2026-03-31',
    { glLines: lines, entities: ['parent'] });
  const isBoth = incomeStatement('2026-01-01', '2026-03-31',
    { glLines: lines, entities: ['parent', 'sub1'] });
  assert.equal(isParent.revenue.total, 180000);
  assert.equal(isBoth.revenue.total, 210000);
});

// ─────────────────────────────────────────────────────────────
// 25. Consolidation — eliminations
// ─────────────────────────────────────────────────────────────
test('25) consolidation: eliminations net out intercompany', () => {
  const lines = buildSampleLedger();
  // Bogus intercompany revenue to eliminate
  lines.push({ id: 'ic1', account: '4100', date: '2026-03-01', debit: 0, credit: 5000, entity: 'parent' });
  lines.push({ id: 'ic1-d', account: '1120', date: '2026-03-01', debit: 5000, credit: 0, entity: 'parent' });
  const is = incomeStatement('2026-01-01', '2026-03-31', {
    glLines: lines,
    eliminations: [{ account: '4100', entity_from: 'parent', entity_to: 'sub1', amount: 5000, date: '2026-03-01' }],
  });
  // Original revenue 180k + 5k intercompany - 5k elimination = 180k
  assert.equal(is.revenue.total, 180000);
});

// ─────────────────────────────────────────────────────────────
// 26. Excel export
// ─────────────────────────────────────────────────────────────
test('26) toExcelXml: generates valid SpreadsheetML', () => {
  const lines = buildSampleLedger();
  const pack = reportPack({ year: 2026, quarter: 1 }, { glLines: lines });
  const xml = toExcelXml(pack);
  assert.ok(xml.startsWith('<?xml'));
  assert.ok(xml.includes('Workbook'));
  assert.ok(xml.includes('Trial Balance'));
  assert.ok(xml.includes('Balance Sheet'));
  assert.ok(xml.includes('Income Statement'));
});

// ─────────────────────────────────────────────────────────────
// 27. Printable text
// ─────────────────────────────────────────────────────────────
test('27) toPrintableText: readable text summary', () => {
  const lines = buildSampleLedger();
  const pack = reportPack({ year: 2026, quarter: 1 }, { glLines: lines });
  const txt = toPrintableText(pack);
  assert.ok(txt.includes('TRIAL BALANCE'));
  assert.ok(txt.includes('INCOME STATEMENT'));
  assert.ok(txt.includes('BALANCE SHEET'));
  assert.ok(txt.includes('CASH FLOW'));
});

// ─────────────────────────────────────────────────────────────
// 28. Multi-currency roll-up
// ─────────────────────────────────────────────────────────────
test('28) multi-currency: USD/EUR roll up to ILS', () => {
  const lines = [
    { id: 'usd', account: '4100', date: '2026-03-01',
      debit: 0, credit: 1000, currency: 'USD', fx_to_ils: 3.6 },
    { id: 'usd-d', account: '1120', date: '2026-03-01',
      debit: 1000, credit: 0, currency: 'USD', fx_to_ils: 3.6 },
    { id: 'eur', account: '4100', date: '2026-03-01',
      debit: 0, credit: 500, currency: 'EUR', fx_to_ils: 4.0 },
    { id: 'eur-d', account: '1120', date: '2026-03-01',
      debit: 500, credit: 0, currency: 'EUR', fx_to_ils: 4.0 },
  ];
  const is = incomeStatement('2026-03-01', '2026-03-31', { glLines: lines });
  // 1000 * 3.6 + 500 * 4.0 = 3600 + 2000 = 5600 ILS
  assert.equal(is.revenue.total, 5600);
});

// ─────────────────────────────────────────────────────────────
// 29. Empty input → sane structure
// ─────────────────────────────────────────────────────────────
test('29) empty inputs: reports return full structure without crashing', () => {
  const tb = trialBalance({ year: 2026, month: 1 }, { glLines: [] });
  assert.equal(tb.accounts.length, 0);
  assert.equal(tb.balanced, true);

  const bs = balanceSheet('2026-01-31', { glLines: [] });
  assert.equal(bs.totals.total_assets, 0);
  assert.equal(bs.checks.assets_equal_liab_equity, true);

  const is = incomeStatement('2026-01-01', '2026-01-31', { glLines: [] });
  assert.equal(is.revenue.total, 0);
  assert.equal(is.profit.net, 0);

  const cf = cashFlowStatement('2026-01-01', '2026-01-31', { glLines: [] });
  assert.equal(cf.net_change, 0);

  const eq = equityStatement({ year: 2026, month: 1 }, { glLines: [] });
  assert.ok(Array.isArray(eq.rows));
});

// ─────────────────────────────────────────────────────────────
// 30. Drill-down audit trail
// ─────────────────────────────────────────────────────────────
test('30) drill-down audit ids preserved on every account row', () => {
  const lines = buildSampleLedger();
  const tb = trialBalance({ year: 2026, quarter: 1 }, { glLines: lines });
  const sales = tb.accounts.find((a) => a.account === '4100');
  assert.ok(sales);
  assert.ok(sales.audit.movement_line_ids.length >= 3, 'should reference invoice lines');

  const is = incomeStatement('2026-01-01', '2026-03-31', { glLines: lines });
  const salesIs = is.revenue.accounts.find((a) => a.account === '4100');
  assert.ok(salesIs);
  assert.ok(salesIs.audit.length >= 3);
});
