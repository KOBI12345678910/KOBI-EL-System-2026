/**
 * Bank Statement Parsers — Unit Tests
 * Agent-06 / Wave 1.5
 *
 * Exercises:
 *   - parseCsvStatement (Hebrew + English headers)
 *   - parseMt940Statement (SWIFT MT940)
 *   - autoParse (format detection)
 *   - Internal helpers indirectly: parseNumber, parseDate
 *
 * Run with: node --test test/bank-parsers.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseCsvStatement,
  parseMt940Statement,
  autoParse,
} = require('../src/bank/parsers.js');

// ─── Fixture loaders ──────────────────────────────────────────────────
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const loadFixture = (name) =>
  fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');

const HEBREW_CSV = loadFixture('fixture-bank-csv-hapoalim.csv');
const ENGLISH_CSV = loadFixture('fixture-bank-csv-english.csv');
const MT940 = loadFixture('fixture-bank-mt940.txt');

// ══════════════════════════════════════════════════════════════════════
// parseCsvStatement
// ══════════════════════════════════════════════════════════════════════

describe('parseCsvStatement — Hebrew (Bank Hapoalim style)', () => {
  test('parses realistic Hebrew fixture into expected transactions', () => {
    const result = parseCsvStatement(HEBREW_CSV);

    assert.equal(result.transactions.length, 10,
      'should parse all 10 rows');
    assert.equal(result.meta.format, 'csv');
    assert.equal(result.meta.rowCount, 10);

    // Period dates derived from dd/mm/yyyy -> yyyy-mm-dd
    assert.equal(result.period.start, '2026-04-01');
    assert.equal(result.period.end, '2026-04-14');

    // First row: credit of 12,500 (wire in)
    const tx1 = result.transactions[0];
    assert.equal(tx1.transaction_date, '2026-04-01');
    assert.equal(tx1.amount, 12500);
    assert.equal(tx1.reference_number, 'REF001');
    assert.equal(tx1.balance_after, 112500);

    // Second row: debit of 3,200.50 — should be negative
    const tx2 = result.transactions[1];
    assert.equal(tx2.transaction_date, '2026-04-02');
    assert.equal(tx2.amount, -3200.5);
    assert.equal(tx2.reference_number, 'REF002');

    // Ensure debit column resolved when credit=0
    const tx3 = result.transactions[2];
    assert.equal(tx3.amount, -15750);
  });

  test('closing balance reflects sum of signed amounts', () => {
    const result = parseCsvStatement(HEBREW_CSV, { openingBalance: 100000 });
    const expectedSum = result.transactions.reduce((s, t) => s + t.amount, 0);
    assert.ok(Math.abs(result.closingBalance - (100000 + expectedSum)) < 0.01);
    assert.equal(result.openingBalance, 100000);
  });
});

describe('parseCsvStatement — English headers', () => {
  test('parses English fixture into expected transactions', () => {
    const result = parseCsvStatement(ENGLISH_CSV);

    assert.equal(result.transactions.length, 10);
    assert.equal(result.meta.format, 'csv');
    assert.equal(result.period.start, '2026-04-01');
    assert.equal(result.period.end, '2026-04-14');

    // First row positive, second row negative (single Amount column)
    assert.equal(result.transactions[0].amount, 12500);
    assert.equal(result.transactions[1].amount, -3200.5);
    assert.equal(result.transactions[0].reference_number, 'TXN-001');
    assert.equal(result.transactions[0].balance_after, 112500);
  });
});

describe('parseCsvStatement — error handling', () => {
  test('empty CSV throws', () => {
    assert.throws(() => parseCsvStatement(''),
      /too short|No valid transactions|Could not locate/);
  });

  test('CSV with only a header row throws "No valid transactions"', () => {
    const headerOnly = 'Date,Description,Amount,Balance,Reference\n';
    // csv-parse with skip_empty_lines returns just one row; parser requires >=2
    assert.throws(() => parseCsvStatement(headerOnly),
      /too short|No valid transactions/);
  });

  test('CSV with header + blank data rows yields "No valid transactions"', () => {
    // header + a row that parses but has no valid date
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      'not-a-date,Bad row,100,100,X\n' +
      'still-bad,Another,200,300,Y\n';
    assert.throws(() => parseCsvStatement(content),
      /No valid transactions/);
  });

  test('CSV with malformed dates skips those rows but parses valid ones', () => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      'not-a-date,Bad row,100,100,X\n' +
      '15/04/2026,Good row,500,600,Y\n' +
      'also-bad,Bad row 2,200,800,Z\n' +
      '16/04/2026,Another good,300,900,W\n';
    const result = parseCsvStatement(content);
    assert.equal(result.transactions.length, 2);
    assert.equal(result.transactions[0].transaction_date, '2026-04-15');
    assert.equal(result.transactions[1].transaction_date, '2026-04-16');
    assert.equal(result.transactions[0].amount, 500);
  });
});

// ══════════════════════════════════════════════════════════════════════
// parseNumber & parseDate (exercised via parseCsvStatement)
// ══════════════════════════════════════════════════════════════════════

describe('parseNumber (exercised through CSV amount column)', () => {
  // Helper: build a 1-row CSV and return the parsed amount
  const parseAmount = (amtStr) => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      `01/04/2026,test,${JSON.stringify(amtStr)},0,R1\n`;
    return parseCsvStatement(content).transactions[0].amount;
  };

  test('parses "1,234.56" → 1234.56 (commas stripped)', () => {
    assert.equal(parseAmount('1,234.56'), 1234.56);
  });

  test('parses "(100)" → -100 (parentheses = negative)', () => {
    assert.equal(parseAmount('(100)'), -100);
  });

  test('parses "₪ 1,500" → 1500 (currency symbol stripped)', () => {
    assert.equal(parseAmount('₪ 1,500'), 1500);
  });

  test('parses plain negative "-250.75" → -250.75', () => {
    assert.equal(parseAmount('-250.75'), -250.75);
  });

  test('parses empty string → 0', () => {
    // Use debit/credit variant so the amount column isn't the only column
    const content =
      'Date,Description,Debit,Credit,Balance,Reference\n' +
      '01/04/2026,test,,100,100,R1\n';
    const result = parseCsvStatement(content);
    assert.equal(result.transactions[0].amount, 100); // credit-debit = 100-0
  });
});

describe('parseDate (exercised through CSV date column)', () => {
  const parseDateField = (dateStr) => {
    const content =
      'Date,Description,Amount,Balance,Reference\n' +
      `${dateStr},test,100,100,R1\n`;
    return parseCsvStatement(content).transactions[0].transaction_date;
  };

  test('parses "15/04/2026" → "2026-04-15" (dd/mm/yyyy)', () => {
    assert.equal(parseDateField('15/04/2026'), '2026-04-15');
  });

  test('parses "2026-04-15" → "2026-04-15" (ISO)', () => {
    assert.equal(parseDateField('2026-04-15'), '2026-04-15');
  });

  test('parses "1/4/26" → "2026-04-01" (short form)', () => {
    assert.equal(parseDateField('1/4/26'), '2026-04-01');
  });

  test('parses "15-04-2026" → "2026-04-15" (dash separator)', () => {
    assert.equal(parseDateField('15-04-2026'), '2026-04-15');
  });
});

// ══════════════════════════════════════════════════════════════════════
// parseMt940Statement
// ══════════════════════════════════════════════════════════════════════

describe('parseMt940Statement', () => {
  test('parses full MT940 fixture correctly', () => {
    const result = parseMt940Statement(MT940);

    assert.equal(result.meta.format, 'mt940');
    assert.equal(result.meta.accountNumber, 'IL620108000000012345678');

    // 9 :61: transactions in the fixture
    assert.equal(result.transactions.length, 9);
    assert.equal(result.meta.rowCount, 9);

    // Opening balance from :60F:C260401ILS100000,00
    assert.equal(result.openingBalance, 100000);
    assert.equal(result.period.start, '2026-04-01');

    // Closing balance from :62F:C260414ILS141924,00
    assert.equal(result.closingBalance, 141924);
    assert.equal(result.period.end, '2026-04-14');

    // First txn: 2026-04-02, Debit 3200,50 → -3200.50
    const tx1 = result.transactions[0];
    assert.equal(tx1.transaction_date, '2026-04-02');
    assert.equal(tx1.amount, -3200.5);
    assert.match(tx1.description, /Stone Works/);

    // A credit transaction (VAT refund)
    const vatRefund = result.transactions.find(t => /VAT/i.test(t.description));
    assert.ok(vatRefund, 'VAT refund txn should be present');
    assert.equal(vatRefund.amount, 5670.25);
  });

  test('parses MT940 missing :25: tag (no account number)', () => {
    // Strip out the :25: line
    const withoutTag25 = MT940
      .split('\n')
      .filter(line => !line.startsWith(':25:'))
      .join('\n');
    const result = parseMt940Statement(withoutTag25);

    // Should still work, just with no account number in meta
    assert.equal(result.transactions.length, 9);
    assert.equal(result.meta.accountNumber, undefined);
    assert.equal(result.openingBalance, 100000);
    assert.equal(result.closingBalance, 141924);
  });

  test('MT940 with no :61: tags throws "No transactions found"', () => {
    const empty =
      ':20:STMT001\n' +
      ':25:IL620108000000012345678\n' +
      ':60F:C260401ILS100000,00\n' +
      ':62F:C260414ILS100000,00\n';
    assert.throws(() => parseMt940Statement(empty),
      /No transactions found/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// autoParse
// ══════════════════════════════════════════════════════════════════════

describe('autoParse', () => {
  test('dispatches to CSV parser for CSV content', () => {
    const result = autoParse(ENGLISH_CSV);
    assert.equal(result.meta.format, 'csv');
    assert.equal(result.transactions.length, 10);
  });

  test('dispatches to MT940 parser for content starting with ":20:"', () => {
    const result = autoParse(MT940);
    assert.equal(result.meta.format, 'mt940');
    assert.equal(result.transactions.length, 9);
  });

  test('honours explicit hint="mt940" even if content does not start with :20:', () => {
    // Take the fixture but prefix a blank line so content doesn't startsWith(':20:')
    // With the hint, it should still pick MT940
    const prefixed = '\n' + MT940;
    const result = autoParse(prefixed, 'mt940');
    assert.equal(result.meta.format, 'mt940');
    assert.ok(result.transactions.length > 0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  test('CSV with debit/credit split columns combines correctly (credit - debit)', () => {
    // Verify the Hebrew fixture resolves each row via its debit OR credit column
    const result = parseCsvStatement(HEBREW_CSV);

    // Row 0: credit 12,500 debit 0  → +12,500
    assert.equal(result.transactions[0].amount, 12500);
    // Row 1: debit 3200.50 credit 0 → -3200.50
    assert.equal(result.transactions[1].amount, -3200.5);
    // Row 3: credit 45000        → +45000
    assert.equal(result.transactions[3].amount, 45000);
    // Row 9: debit 45, account fee → -45
    assert.equal(result.transactions[9].amount, -45);

    // Arithmetic sanity check on a debit-only case
    assert.ok(result.transactions.every(t => typeof t.amount === 'number'));
  });

  test('CSV with BOM prefix still parses', () => {
    const bomContent = '\uFEFF' + ENGLISH_CSV;
    const result = parseCsvStatement(bomContent);
    assert.equal(result.transactions.length, 10);
  });

  test('raw_data is preserved on every CSV transaction', () => {
    const result = parseCsvStatement(ENGLISH_CSV);
    for (const tx of result.transactions) {
      assert.ok(tx.raw_data, 'raw_data should be populated');
      assert.ok(Array.isArray(tx.raw_data.row));
      assert.ok(Array.isArray(tx.raw_data.headers));
    }
  });
});
