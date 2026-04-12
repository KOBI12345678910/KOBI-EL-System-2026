/**
 * Balance Sheet Explorer — Unit Tests
 * Agent Y-183
 *
 * Uses Node's built-in `node:test` runner and `node:assert/strict`.
 * רץ על מריץ הטסטים המובנה של Node — ללא תלויות חיצוניות.
 *
 * Run with: node --test test/reporting/balance-sheet.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BalanceSheetExplorer,
  FORM_6111,
  _helpers,
} = require('../../src/reporting/balance-sheet');

// ────────────────────────────────────────────────────────────────────────
// FIXTURE / נתוני בדיקה
// ────────────────────────────────────────────────────────────────────────

function sampleAccounts() {
  return [
    // Current assets
    { code: '1000', name: 'Cash at First Intl Bank',  balance: 120_000 },
    { code: '1010', name: 'Bank deposit 6mo',         balance:  80_000 },
    { code: '1100', name: 'Accounts receivable',      balance: 250_000 },
    { code: '1200', name: 'Raw materials inventory',  balance: 180_000 },
    { code: '1300', name: 'Prepaid insurance',        balance:  20_000 },
    // Non-current assets
    { code: '1500', name: 'Machinery',                balance: 600_000 },
    { code: '1510', name: 'Accumulated depreciation', balance: 150_000 }, // contra
    { code: '1600', name: 'Software licenses',        balance:  40_000 },
    // Current liabilities
    { code: '2100', name: 'Suppliers / ספקים',        balance: 190_000 },
    { code: '2130', name: 'VAT payable',              balance:  35_000 },
    { code: '2150', name: 'Payroll payable',          balance:  60_000 },
    // Non-current liabilities
    { code: '2300', name: 'Long-term bank loan',      balance: 300_000 },
    { code: '2400', name: 'Severance reserve',        balance:  90_000 },
    // Equity
    { code: '3000', name: 'Share capital',            balance: 100_000 },
    { code: '3200', name: 'Retained earnings',        balance: 365_000 },
  ];
}

// ────────────────────────────────────────────────────────────────────────
// 1. CLASSIFY — explicit code
// ────────────────────────────────────────────────────────────────────────
test('classify: explicit Form 6111 code maps to current asset cash', () => {
  const bs = new BalanceSheetExplorer();
  const result = bs.classify({ code: '1000', name: 'Cash', balance: 1 });
  assert.equal(result.side, 'asset');
  assert.equal(result.term, 'current');
  assert.equal(result.key, 'cash');
  assert.equal(result.form6111, '1000');
  assert.equal(result.confidence, 'explicit');
  assert.equal(result.nameHe, 'מזומנים ושווי מזומנים');
});

// ────────────────────────────────────────────────────────────────────────
// 2. CLASSIFY — code prefix
// ────────────────────────────────────────────────────────────────────────
test('classify: code prefix ("1100-SPK") still resolves', () => {
  const bs = new BalanceSheetExplorer();
  const result = bs.classify({ code: '1100-SPK', name: 'Customer ledger' });
  assert.equal(result.side, 'asset');
  assert.equal(result.term, 'current');
  assert.equal(result.key, 'accountsReceivable');
  assert.equal(result.confidence, 'code-prefix');
});

// ────────────────────────────────────────────────────────────────────────
// 3. CLASSIFY — Hebrew keyword fallback
// ────────────────────────────────────────────────────────────────────────
test('classify: Hebrew keyword "מלאי" → inventory (current asset)', () => {
  const bs = new BalanceSheetExplorer();
  const result = bs.classify({ name: 'מלאי חומרי גלם' });
  assert.equal(result.side, 'asset');
  assert.equal(result.term, 'current');
  assert.equal(result.key, 'inventory');
  assert.equal(result.confidence, 'keyword');
});

// ────────────────────────────────────────────────────────────────────────
// 4. CLASSIFY — English keyword fallback
// ────────────────────────────────────────────────────────────────────────
test('classify: English "Long-term loan" → non-current liability', () => {
  const bs = new BalanceSheetExplorer();
  const result = bs.classify({ name: 'Long-term loan from Bank Leumi' });
  assert.equal(result.side, 'liability');
  assert.equal(result.term, 'non-current');
  assert.equal(result.key, 'longTermLoans');
});

// ────────────────────────────────────────────────────────────────────────
// 5. CLASSIFY — unknown account yields unknown classification
// ────────────────────────────────────────────────────────────────────────
test('classify: unknown account yields "unknown" with reason', () => {
  const bs = new BalanceSheetExplorer();
  const result = bs.classify({ name: 'Mysterious ledger xyz' });
  assert.equal(result.side, 'unknown');
  assert.equal(result.confidence, 'unknown');
  assert.ok(result.reason);
});

// ────────────────────────────────────────────────────────────────────────
// 6. BUILD — sample balance sheet balances correctly
// ────────────────────────────────────────────────────────────────────────
test('build: produces balanced assets = liabilities + equity', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build(sampleAccounts(), {
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    label: '2026-Q1',
  });

  // Current assets: 120k+80k+250k+180k+20k = 650k
  assert.equal(sheet.assets.current.total, 650_000);
  // Non-current: 600k − 150k (contra) + 40k = 490k
  assert.equal(sheet.assets.nonCurrent.total, 490_000);
  assert.equal(sheet.assets.total, 1_140_000);
  // Current liabilities: 190k+35k+60k = 285k
  assert.equal(sheet.liabilities.current.total, 285_000);
  // Non-current: 300k+90k = 390k
  assert.equal(sheet.liabilities.nonCurrent.total, 390_000);
  assert.equal(sheet.liabilities.total, 675_000);
  // Equity: 100k+365k = 465k
  assert.equal(sheet.equity.total, 465_000);
  // Balanced: 1,140k = 675k + 465k = 1,140k
  assert.equal(sheet.totals.balanced, true);
  assert.equal(sheet.totals.imbalance, 0);
});

// ────────────────────────────────────────────────────────────────────────
// 7. BUILD — contra accounts reduce PP&E correctly
// ────────────────────────────────────────────────────────────────────────
test('build: accumulated depreciation is treated as contra asset', () => {
  const bs = new BalanceSheetExplorer();
  const accounts = [
    { code: '1500', balance: 1_000_000 },
    { code: '1510', balance: 300_000 }, // contra
  ];
  const sheet = bs.build(accounts);
  assert.equal(sheet.assets.nonCurrent.total, 700_000);
});

// ────────────────────────────────────────────────────────────────────────
// 8. RATIOS — current / quick / cash
// ────────────────────────────────────────────────────────────────────────
test('ratios: current, quick and cash ratios are correct', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build(sampleAccounts());
  const r = sheet.ratios;

  // Current = 650_000 / 285_000 ≈ 2.2807
  assert.ok(Math.abs(r.current - 650_000 / 285_000) < 1e-6);
  // Quick = (650_000 − 180_000) / 285_000 = 1.6491...
  assert.ok(Math.abs(r.quick - (650_000 - 180_000) / 285_000) < 1e-6);
  // Cash = (120_000 + 80_000) / 285_000 ≈ 0.7017
  assert.ok(Math.abs(r.cash - 200_000 / 285_000) < 1e-6);
});

// ────────────────────────────────────────────────────────────────────────
// 9. RATIOS — debt-to-equity / equity ratio
// ────────────────────────────────────────────────────────────────────────
test('ratios: D/E and equity ratio match manual calc', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build(sampleAccounts());
  // D/E = 675_000 / 465_000
  assert.ok(Math.abs(sheet.ratios.debtToEquity - 675_000 / 465_000) < 1e-6);
  // Equity ratio = 465_000 / 1_140_000
  assert.ok(Math.abs(sheet.ratios.equityRatio - 465_000 / 1_140_000) < 1e-6);
  // Leverage = 1_140_000 / 465_000
  assert.ok(Math.abs(sheet.ratios.leverageRatio - 1_140_000 / 465_000) < 1e-6);
});

// ────────────────────────────────────────────────────────────────────────
// 10. RATIOS — divide by zero safety
// ────────────────────────────────────────────────────────────────────────
test('ratios: zero denominators return null (no NaN / Infinity)', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build([
    { code: '1000', balance: 1000 },
    { code: '3000', balance: 1000 },
    // No liabilities at all.
  ]);
  assert.equal(sheet.ratios.current, null);
  assert.equal(sheet.ratios.quick, null);
  assert.equal(sheet.ratios.cash, null);
});

// ────────────────────────────────────────────────────────────────────────
// 11. WORKING CAPITAL — healthy / tight / deficit status
// ────────────────────────────────────────────────────────────────────────
test('workingCapital: classifies healthy / tight / deficit correctly', () => {
  const bs = new BalanceSheetExplorer();

  const healthy = bs.build([
    { code: '1000', balance: 1_000_000 },
    { code: '2100', balance: 300_000 },
  ]);
  assert.equal(healthy.workingCapital.status, 'healthy');
  assert.equal(healthy.workingCapital.he, 'תקין');

  const tight = bs.build([
    { code: '1000', balance: 110_000 },
    { code: '2100', balance: 100_000 },
  ]);
  assert.equal(tight.workingCapital.status, 'tight');
  assert.equal(tight.workingCapital.he, 'מתוח');

  const deficit = bs.build([
    { code: '1000', balance: 50_000 },
    { code: '2100', balance: 200_000 },
  ]);
  assert.equal(deficit.workingCapital.status, 'deficit');
  assert.equal(deficit.workingCapital.value, -150_000);
});

// ────────────────────────────────────────────────────────────────────────
// 12. TREND — multi-period comparison
// ────────────────────────────────────────────────────────────────────────
test('trend: detects improving working-capital direction', () => {
  const bs = new BalanceSheetExplorer();
  const q1 = bs.build(
    [
      { code: '1000', balance: 200_000 },
      { code: '2100', balance: 150_000 },
    ],
    { label: '2026-Q1' }
  );
  const q2 = bs.build(
    [
      { code: '1000', balance: 300_000 },
      { code: '2100', balance: 150_000 },
    ],
    { label: '2026-Q2' }
  );
  const q3 = bs.build(
    [
      { code: '1000', balance: 500_000 },
      { code: '2100', balance: 150_000 },
    ],
    { label: '2026-Q3' }
  );

  const trend = bs.trend([q1, q2, q3]);
  assert.equal(trend.periods.length, 3);
  assert.equal(trend.deltas.length, 2);
  assert.equal(trend.direction, 'improving');
  assert.equal(trend.summary.he, 'המגמה משתפרת');
  // First delta: working capital moved from 50k to 150k → +100k
  assert.equal(trend.deltas[0].workingCapitalAbs, 100_000);
});

// ────────────────────────────────────────────────────────────────────────
// 13. TREND — deteriorating direction
// ────────────────────────────────────────────────────────────────────────
test('trend: detects deteriorating direction', () => {
  const bs = new BalanceSheetExplorer();
  const p1 = bs.build([
    { code: '1000', balance: 500_000 },
    { code: '2100', balance: 100_000 },
  ], { label: 'P1' });
  const p2 = bs.build([
    { code: '1000', balance: 200_000 },
    { code: '2100', balance: 300_000 },
  ], { label: 'P2' });

  const trend = bs.trend([p1, p2]);
  assert.equal(trend.direction, 'deteriorating');
  assert.equal(trend.summary.en, 'Trend is deteriorating');
});

// ────────────────────────────────────────────────────────────────────────
// 14. FORMAT REPORT — bilingual output contains both languages
// ────────────────────────────────────────────────────────────────────────
test('formatReport: contains both Hebrew and English headers', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build(sampleAccounts(), { label: '2026-Q1' });
  const report = bs.formatReport(sheet);

  assert.match(report, /BALANCE SHEET/);
  assert.match(report, /מאזן/);
  assert.match(report, /ASSETS/);
  assert.match(report, /נכסים/);
  assert.match(report, /LIABILITIES/);
  assert.match(report, /התחייבויות/);
  assert.match(report, /EQUITY/);
  assert.match(report, /הון עצמי/);
  assert.match(report, /Current Ratio/);
  assert.match(report, /יחס שוטף/);
  assert.match(report, /WORKING CAPITAL/);
  assert.match(report, /הון חוזר/);
});

// ────────────────────────────────────────────────────────────────────────
// 15. FORMAT REPORT — NIS currency appears
// ────────────────────────────────────────────────────────────────────────
test('formatReport: NIS / ₪ formatting appears in output', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build(sampleAccounts(), { label: '2026-Q1' });
  const report = bs.formatReport(sheet);
  // At least one NIS-style amount (either ₪ symbol or "ILS" depending on Intl).
  assert.ok(/₪|ILS|ש["\u05F4]?ח/.test(report), 'report should contain NIS marker');
});

// ────────────────────────────────────────────────────────────────────────
// 16. REFERENCES — Form 6111 and IFRS references are present
// ────────────────────────────────────────────────────────────────────────
test('build: reference includes Form 6111 and IFRS', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build([{ code: '1000', balance: 1 }]);
  assert.match(sheet.reference.form6111, /6111/);
  assert.match(sheet.reference.gaap, /IFRS/);
});

// ────────────────────────────────────────────────────────────────────────
// 17. BUILD — unclassified accounts land in the unclassified bucket
// ────────────────────────────────────────────────────────────────────────
test('build: unknown accounts are retained in unclassified (never deleted)', () => {
  const bs = new BalanceSheetExplorer();
  const sheet = bs.build([
    { code: '1000', balance: 100 },
    { name: 'Totally mysterious item', balance: 42 },
  ]);
  assert.equal(sheet.unclassified.lines.length, 1);
  assert.equal(sheet.unclassified.total, 42);
  // Asset total untouched by the unclassified row.
  assert.equal(sheet.assets.total, 100);
});

// ────────────────────────────────────────────────────────────────────────
// 18. HELPERS — formatNIS handles invalid and valid input
// ────────────────────────────────────────────────────────────────────────
test('helpers: formatNIS handles NaN and returns em-dash', () => {
  assert.equal(_helpers.formatNIS(NaN), '—');
  assert.equal(_helpers.formatNIS(undefined), '—');
  const good = _helpers.formatNIS(1234.56);
  assert.ok(good.length > 0);
  assert.notEqual(good, '—');
});

// ────────────────────────────────────────────────────────────────────────
// 19. HELPERS — r2 rounds floats safely
// ────────────────────────────────────────────────────────────────────────
test('helpers: r2 rounds to 2 decimals (no float drift)', () => {
  assert.equal(_helpers.r2(0.1 + 0.2), 0.3);
  assert.equal(_helpers.r2(1.235), 1.24);
  assert.equal(_helpers.r2(1234.567), 1234.57);
  assert.equal(_helpers.r2('abc'), 0);
});

// ────────────────────────────────────────────────────────────────────────
// 20. FORM_6111 — map is frozen (immutable / additive-only guarantee)
// ────────────────────────────────────────────────────────────────────────
test('FORM_6111: map is frozen and cannot be mutated at runtime', () => {
  assert.ok(Object.isFrozen(FORM_6111));
  // Attempting to add a key on frozen object in strict mode throws.
  assert.throws(() => {
    'use strict';
    FORM_6111['9999'] = { key: 'hack' };
  });
});

// ────────────────────────────────────────────────────────────────────────
// 21. BUILD — invalid input throws a bilingual TypeError
// ────────────────────────────────────────────────────────────────────────
test('build: rejects non-array input with bilingual error', () => {
  const bs = new BalanceSheetExplorer();
  assert.throws(() => bs.build(null), /accounts/);
  assert.throws(() => bs.build({}), /accounts/);
});
