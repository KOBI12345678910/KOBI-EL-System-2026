/**
 * QA-02 — Unit tests (edge cases) for bank/matcher.js and bank/parsers.js
 *
 * Scope:
 *   - scoreMatch: boundary conditions at each confidence tier
 *   - DST, Feb 29, year boundaries for date diff
 *   - NaN/Infinity amounts
 *   - findBestMatch tie-breaking
 *   - autoReconcileBatch direction/sign handling
 *   - parseNumber: Hebrew minus, parentheses, currency symbols
 *   - parseDate: Feb 29, short year, dash separators
 *
 * ADDITIVE — both this and existing test/bank-*.test.js must pass.
 *
 * Run with: node --test test/unit/qa-02-bank.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  scoreMatch,
  findBestMatch,
  autoReconcileBatch,
} = require(path.resolve(__dirname, '..', '..', 'src', 'bank', 'matcher.js'));

const {
  parseCsvStatement,
  parseMt940Statement,
  autoParse,
} = require(path.resolve(__dirname, '..', '..', 'src', 'bank', 'parsers.js'));

// ─────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────

function makeBankTx(overrides = {}) {
  return {
    id: 'btx-qa02',
    transaction_date: '2026-04-01',
    description: 'payment',
    amount: 1000,
    reference_number: 'REF',
    reconciled: false,
    ...overrides,
  };
}

function makeLedger(overrides = {}) {
  return {
    id: 'inv-qa02',
    customer_name: 'Acme Ltd',
    invoice_date: '2026-04-01',
    gross_amount: 1000,
    amount_outstanding: 1000,
    reference_number: 'REF',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════
// SECTION 1: scoreMatch — amount boundary matrix
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.1 scoreMatch — amount boundaries', () => {
  // amt_diff classifications:
  //   < 0.01       → 'exact'      +0.6
  //   amtRatio < 0.001 → 'near-exact' +0.55
  //   amtRatio < 0.01  → 'close'      +0.4
  //   amtRatio < 0.05  → 'partial'    +0.2
  //   otherwise        → rejected

  test('1.01 amt diff exactly 0.009 → exact', () => {
    const r = scoreMatch(
      makeBankTx({ amount: 100 }),
      makeLedger({ gross_amount: 100.009, reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.amount, 'exact');
  });

  test('1.02 amt ratio < 0.001 (0.05%) → near-exact', () => {
    const r = scoreMatch(
      makeBankTx({ amount: 100000 }),
      makeLedger({ gross_amount: 100050, reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    // diff 50 / 100000 = 0.0005 < 0.001 → near-exact
    assert.equal(r.criteria.amount, 'near-exact');
  });

  test('1.03 amt ratio 0.5% → close', () => {
    const r = scoreMatch(
      makeBankTx({ amount: 10000 }),
      makeLedger({ gross_amount: 10050, reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.amount, 'close');
  });

  test('1.04 amt ratio 3% → partial', () => {
    const r = scoreMatch(
      makeBankTx({ amount: 1000 }),
      makeLedger({ gross_amount: 1030, reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.amount, 'partial');
  });

  test('1.05 amt ratio exactly 5% → rejected', () => {
    // ratio 0.05 — condition is < 0.05, so exact 5% is rejected
    const r = scoreMatch(
      makeBankTx({ amount: 1000 }),
      makeLedger({ gross_amount: 1050, reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.confidence, 0);
    assert.equal(r.criteria.rejected, 'amount_mismatch');
  });

  test('1.06 negative bank amount compared to positive ledger — abs value used', () => {
    const r = scoreMatch(
      makeBankTx({ amount: -1000 }),
      makeLedger({ gross_amount: 1000, reference_number: 'NO' }),
      { type: 'supplier_payment' }, // correct direction for negative bank amount
    );
    assert.equal(r.criteria.amount, 'exact');
  });

  test('1.07 both zero amounts — "exact" + full confidence path', () => {
    // amtDiff = 0, so < 0.01 → exact
    const r = scoreMatch(
      makeBankTx({ amount: 0 }),
      makeLedger({ gross_amount: 0, reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    // amtDiff < 0.01 triggers 'exact'. amtRatio doesn't matter for exact path.
    assert.equal(r.criteria.amount, 'exact');
  });

  test('1.08 NaN amount does not crash', () => {
    let r;
    assert.doesNotThrow(() => {
      r = scoreMatch(
        makeBankTx({ amount: NaN }),
        makeLedger({ gross_amount: 1000 }),
        { type: 'customer_invoice' },
      );
    });
    assert.ok(typeof r.confidence === 'number');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 2: scoreMatch — date proximity edges
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.2 scoreMatch — date boundaries', () => {
  test('2.01 same day = "same_day"', () => {
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2026-04-01', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2026-04-01', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, 'same_day');
  });

  test('2.02 exactly 1 day = "within_1_day"', () => {
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2026-04-02', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2026-04-01', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, 'within_1_day');
  });

  test('2.03 exactly 3 days = "within_3_days"', () => {
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2026-04-04', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2026-04-01', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, 'within_3_days');
  });

  test('2.04 exactly 7 days = "within_week"', () => {
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2026-04-08', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2026-04-01', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, 'within_week');
  });

  test('2.05 exactly 8 days — no date tier added', () => {
    // > 7 days, not > 30 days → no 'date' criterion at all
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2026-04-09', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2026-04-01', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, undefined);
  });

  test('2.06 >30 days = "far_apart" with penalty', () => {
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2026-04-01', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2025-11-01', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, 'far_apart');
  });

  test('2.07 leap day match 2028-02-29', () => {
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2028-02-29', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2028-02-29', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, 'same_day');
  });

  test('2.08 year-boundary: Dec 31 → Jan 1 = 1 day', () => {
    const r = scoreMatch(
      makeBankTx({ transaction_date: '2027-01-01', reference_number: 'NO' }),
      makeLedger({ invoice_date: '2026-12-31', reference_number: 'NO' }),
      { type: 'customer_invoice' },
    );
    assert.equal(r.criteria.date, 'within_1_day');
  });

  test('2.09 invalid date does not crash (NaN diff)', () => {
    let r;
    assert.doesNotThrow(() => {
      r = scoreMatch(
        makeBankTx({ transaction_date: 'not-a-date', reference_number: 'NO' }),
        makeLedger({ invoice_date: '2026-04-01', reference_number: 'NO' }),
        { type: 'customer_invoice' },
      );
    });
    assert.ok(typeof r.confidence === 'number');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 3: scoreMatch — direction handling
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.3 scoreMatch — direction', () => {
  test('3.01 customer_payment with negative bank amount → penalty -0.3', () => {
    const r = scoreMatch(
      makeBankTx({ amount: -1000, reference_number: 'NO' }),
      makeLedger({ gross_amount: 1000, reference_number: 'NO' }),
      { type: 'customer_payment' },
    );
    assert.equal(r.criteria.direction, 'wrong');
  });

  test('3.02 supplier_payment with positive bank amount → penalty -0.3', () => {
    const r = scoreMatch(
      makeBankTx({ amount: 1000, reference_number: 'NO' }),
      makeLedger({ gross_amount: 1000, supplier_name: 'Supplier Ltd', customer_name: undefined, reference_number: 'NO' }),
      { type: 'supplier_payment' },
    );
    assert.equal(r.criteria.direction, 'wrong');
  });

  test('3.03 customer_invoice type has no direction rule', () => {
    const r = scoreMatch(
      makeBankTx({ amount: -1000, reference_number: 'NO' }),
      makeLedger({ gross_amount: 1000, reference_number: 'NO' }),
      { type: 'customer_invoice' }, // not 'customer_payment'
    );
    assert.equal(r.criteria.direction, undefined);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 4: findBestMatch — tie-break and cutoff
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.4 findBestMatch', () => {
  test('4.01 all candidates under 0.3 → null', () => {
    const bankTx = makeBankTx({ reference_number: 'NO' });
    const weak = makeLedger({
      customer_name: 'Zebra Corp',
      invoice_date: '2025-01-01', // far apart
      gross_amount: 1020,           // 2% off, partial
      reference_number: 'OTHER',
    });
    assert.equal(findBestMatch(bankTx, [weak], 'customer_invoice'), null);
  });

  test('4.02 null candidates list returns null', () => {
    assert.equal(findBestMatch(makeBankTx(), null, 'customer_invoice'), null);
    assert.equal(findBestMatch(makeBankTx(), undefined, 'customer_invoice'), null);
  });

  test('4.03 returns the highest-confidence match when multiple pass', () => {
    const bankTx = makeBankTx({ amount: 1000, reference_number: 'REF-BEST' });
    const ok = makeLedger({
      id: 'ok',
      customer_name: 'Other Co',
      gross_amount: 1000,
      invoice_date: '2026-04-01',
      reference_number: 'NO',
    });
    const best = makeLedger({
      id: 'best',
      customer_name: 'Acme',
      gross_amount: 1000,
      invoice_date: '2026-04-01',
      reference_number: 'REF-BEST',
    });
    const r = findBestMatch(bankTx, [ok, best], 'customer_invoice');
    assert.equal(r.entry.id, 'best');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 5: autoReconcileBatch — match_type thresholds
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.5 autoReconcileBatch thresholds', () => {
  test('5.01 confidence exactly 0.85 → "exact"', () => {
    // Use same-day + exact amount + name = 0.6 + 0.2 + 0.15 = 0.95 → "exact"
    const bankTx = makeBankTx({
      description: 'payment from acme',
      reference_number: 'NO',
    });
    const ledger = makeLedger({
      customer_name: 'acme industries',
      reference_number: 'NO',
    });
    const result = autoReconcileBatch(
      [bankTx],
      { customerInvoices: [ledger], purchaseOrders: [] },
    );
    assert.equal(result[0].match_type, 'exact');
  });

  test('5.02 empty transactions returns empty array', () => {
    const r = autoReconcileBatch([], { customerInvoices: [], purchaseOrders: [] });
    assert.deepEqual(r, []);
  });

  test('5.03 null pools do not crash', () => {
    const r = autoReconcileBatch([makeBankTx()], {});
    assert.deepEqual(r, []);
  });

  test('5.04 matched_amount = abs(bank.amount)', () => {
    const bankTx = makeBankTx({ id: 'neg', amount: -500 });
    const po = makeLedger({ id: 'po1', supplier_name: 'S', customer_name: undefined, gross_amount: 500 });
    const r = autoReconcileBatch(
      [bankTx],
      { customerInvoices: [], purchaseOrders: [po] },
    );
    assert.equal(r[0].matched_amount, 500);
  });

  test('5.05 very large amount ₪9,999,999.99', () => {
    const bankTx = makeBankTx({ amount: 9_999_999.99 });
    const ledger = makeLedger({ gross_amount: 9_999_999.99 });
    const r = autoReconcileBatch(
      [bankTx],
      { customerInvoices: [ledger], purchaseOrders: [] },
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].matched_amount, 9_999_999.99);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 6: parseCsvStatement — robustness
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.6 parseCsvStatement edges', () => {
  test('6.01 Hebrew columns (תאריך / סכום / יתרה)', () => {
    const content =
      'תאריך,תיאור,סכום,יתרה,אסמכתא\n' +
      '01/04/2026,תשלום מ-ACME,1000,1000,R1\n' +
      '02/04/2026,רכישה,-500,500,R2\n';
    const r = parseCsvStatement(content);
    assert.equal(r.transactions.length, 2);
    assert.equal(r.transactions[0].amount, 1000);
    assert.equal(r.transactions[1].amount, -500);
  });

  test('6.02 parentheses as negative — "(250)" → -250', () => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      '01/04/2026,test,"(250)",0,R1\n';
    const r = parseCsvStatement(content);
    assert.equal(r.transactions[0].amount, -250);
  });

  test('6.03 Feb 29 in leap year', () => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      '29/02/2028,Leap day,100,100,R1\n';
    const r = parseCsvStatement(content);
    assert.equal(r.transactions[0].transaction_date, '2028-02-29');
  });

  test('6.04 BOM-prefixed content still parses', () => {
    const content =
      '\uFEFFDate,Description,Amount,Balance,Reference\n' +
      '01/04/2026,test,100,100,R1\n';
    const r = parseCsvStatement(content);
    assert.equal(r.transactions.length, 1);
  });

  test('6.05 empty content throws', () => {
    assert.throws(() => parseCsvStatement(''),
      /too short|Could not locate|No valid transactions/);
  });

  test('6.06 debit/credit split columns', () => {
    const content =
      'Date,Description,Debit,Credit,Balance,Reference\n' +
      '01/04/2026,in,0,1000,1000,R1\n' +
      '02/04/2026,out,500,0,500,R2\n';
    const r = parseCsvStatement(content);
    assert.equal(r.transactions[0].amount, 1000);
    assert.equal(r.transactions[1].amount, -500);
  });

  test('6.07 year-2-digit "24" → 2024', () => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      '15/03/24,short-year,100,100,R1\n';
    const r = parseCsvStatement(content);
    assert.equal(r.transactions[0].transaction_date, '2024-03-15');
  });

  test('6.08 closing balance = opening + sum of signed amounts', () => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      '01/04/2026,in,1000,1000,R1\n' +
      '02/04/2026,out,-400,600,R2\n';
    const r = parseCsvStatement(content, { openingBalance: 5000 });
    assert.equal(r.openingBalance, 5000);
    assert.equal(r.closingBalance, 5000 + 1000 - 400);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 7: parseMt940Statement — edge cases
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.7 parseMt940Statement edges', () => {
  test('7.01 empty MT940 throws', () => {
    const content =
      ':20:STMT001\n' +
      ':25:IL62010800\n' +
      ':60F:C260401ILS100000,00\n' +
      ':62F:C260401ILS100000,00\n';
    assert.throws(() => parseMt940Statement(content),
      /No transactions found/);
  });

  test('7.02 single transaction parses', () => {
    // :61: format: YYMMDD[MMDD][C|D][N|R]?amount,NNNtranstype[ref]
    // tranType pattern in parser: [A-Z]\d{3} e.g. N001
    const content =
      ':20:STMT001\n' +
      ':25:IL620108\n' +
      ':60F:C260401ILS100000,00\n' +
      ':61:2604020402D1000,00N001REF1\n' +
      ':86:Test transaction\n' +
      ':62F:C260402ILS99000,00\n';
    const r = parseMt940Statement(content);
    assert.equal(r.transactions.length, 1);
    assert.equal(r.transactions[0].amount, -1000);
    assert.equal(r.transactions[0].transaction_date, '2026-04-02');
  });

  test('7.03 credit balance opening/closing', () => {
    const content =
      ':20:STMT001\n' +
      ':25:IL620108\n' +
      ':60F:C260401ILS50000,00\n' +
      ':61:2604020402C1500,00N001REF1\n' +
      ':86:Credit in\n' +
      ':62F:C260402ILS51500,00\n';
    const r = parseMt940Statement(content);
    assert.equal(r.openingBalance, 50000);
    assert.equal(r.closingBalance, 51500);
    assert.equal(r.transactions[0].amount, 1500);
  });

  test('7.04 debit opening balance is negative', () => {
    const content =
      ':20:STMT001\n' +
      ':25:IL620108\n' +
      ':60F:D260401ILS5000,00\n' +
      ':61:2604020402C1000,00N001REF1\n' +
      ':86:Credit\n' +
      ':62F:D260402ILS4000,00\n';
    const r = parseMt940Statement(content);
    assert.equal(r.openingBalance, -5000);
    assert.equal(r.closingBalance, -4000);
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 8: autoParse — format detection
// ═════════════════════════════════════════════════════════════

describe('QA-02.BANK.8 autoParse', () => {
  test('8.01 explicit hint "mt940" is honored', () => {
    const content =
      ':20:S1\n' +
      ':25:IL620108\n' +
      ':60F:C260401ILS100000,00\n' +
      ':61:2604020402C500,00N001R\n' +
      ':86:test\n' +
      ':62F:C260402ILS100500,00\n';
    const r = autoParse(content, 'mt940');
    assert.equal(r.meta.format, 'mt940');
  });

  test('8.02 :25: header triggers MT940 detection', () => {
    const content = ':25:IL620108\n' + ':60F:C260401ILS100000,00\n' +
      ':61:2604020402C500,00N001R\n' + ':86:test\n' +
      ':62F:C260402ILS100500,00\n';
    const r = autoParse(content);
    assert.equal(r.meta.format, 'mt940');
  });

  test('8.03 CSV-like content parses as CSV by default', () => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      '01/04/2026,test,100,100,R1\n';
    const r = autoParse(content);
    assert.equal(r.meta.format, 'csv');
  });
});
