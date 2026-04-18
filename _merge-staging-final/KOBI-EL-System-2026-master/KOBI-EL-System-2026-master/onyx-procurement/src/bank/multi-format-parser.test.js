/**
 * Multi-Format Bank Statement Parser — Unit Tests
 * Agent 69 extension
 *
 * Exercises:
 *   - detectFormat for every supported format
 *   - parseStatement + normalizeTransaction for OFX, QIF, MT940, CAMT.053
 *   - Israeli CSV variants (Leumi, Hapoalim, Mizrahi, Discount, Otsar HaHayal)
 *   - Hebrew encoding (UTF-8 + Windows-1255)
 *   - Optional PDF parser soft-fail
 *
 * Run with: node --test src/bank/multi-format-parser.test.js
 * (Or from the repo root: node --test src/bank/)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  SOURCE_FORMATS,
  ISRAELI_BANKS,
  detectFormat,
  parseStatement,
  normalizeTransaction,
  parseOfx,
  parseQif,
  parseMt940Raw,
  parseCamt053,
  parseCsvIsraeli,
  parsePdf,
  _internal,
} = require('./multi-format-parser.js');

// ─── Fixture loaders ──────────────────────────────────────────────────
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES_DIR, name));
const readFixtureText = (name) => fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');

// ══════════════════════════════════════════════════════════════════════
// detectFormat
// ══════════════════════════════════════════════════════════════════════

describe('detectFormat', () => {
  test('detects OFX 2.x from XML declaration', () => {
    const buf = readFixture('fixture-ofx.ofx');
    assert.equal(detectFormat(buf), SOURCE_FORMATS.OFX);
  });

  test('detects QIF from !Type:Bank header', () => {
    const buf = readFixture('fixture-qif.qif');
    assert.equal(detectFormat(buf), SOURCE_FORMATS.QIF);
  });

  test('detects MT940 from :20: and :60F: tags', () => {
    const buf = readFixture('fixture-mt940.txt');
    assert.equal(detectFormat(buf), SOURCE_FORMATS.MT940);
  });

  test('detects CAMT.053 from BkToCstmrStmt element', () => {
    const buf = readFixture('fixture-camt053.xml');
    assert.equal(detectFormat(buf), SOURCE_FORMATS.CAMT053);
  });

  test('detects Israeli CSV from Hebrew headers', () => {
    const buf = readFixture('fixture-csv-leumi.csv');
    assert.equal(detectFormat(buf), SOURCE_FORMATS.CSV_IL);
  });

  test('detects PDF from %PDF magic bytes', () => {
    const fakePdf = Buffer.from('%PDF-1.4\n%fake pdf content', 'utf8');
    assert.equal(detectFormat(fakePdf), SOURCE_FORMATS.PDF);
  });

  test('returns "unknown" for gibberish input', () => {
    assert.equal(detectFormat('totally random text content'), 'unknown');
  });

  test('returns "unknown" for empty input', () => {
    assert.equal(detectFormat(''), 'unknown');
  });
});

// ══════════════════════════════════════════════════════════════════════
// OFX 2.x
// ══════════════════════════════════════════════════════════════════════

describe('OFX 2.x parser', () => {
  test('parseOfx extracts all STMTTRN entries', () => {
    const text = readFixtureText('fixture-ofx.ofx');
    const rows = parseOfx(text);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].trnType, 'CREDIT');
    assert.equal(rows[0].fitId, 'FIT0001');
    assert.equal(rows[0].currency, 'USD');
  });

  test('parseStatement normalises OFX to common schema', () => {
    const text = readFixtureText('fixture-ofx.ofx');
    const txs = parseStatement(text, SOURCE_FORMATS.OFX);

    assert.equal(txs.length, 3);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.OFX);
    assert.equal(txs[0].transaction_date, '2026-04-01');
    assert.equal(txs[0].amount, 12500);
    assert.equal(txs[0].currency, 'USD');
    assert.equal(txs[0].type, 'credit');
    assert.equal(txs[0].external_id, 'FIT0001');
    assert.equal(txs[0].counterparty_name, 'Techno Kol Uzi Wire In');

    assert.equal(txs[1].amount, -3200.5);
    assert.equal(txs[1].type, 'debit');
    assert.equal(txs[1].reference, 'REF002');
  });

  test('parseOfx throws on missing OFX root', () => {
    assert.throws(() => parseOfx('<?xml version="1.0"?><NotOFX/>'),
      /could not locate/);
  });

  test('parseOfx throws when there are no STMTTRN entries', () => {
    assert.throws(
      () => parseOfx('<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>'),
      /no <STMTTRN>/
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// QIF
// ══════════════════════════════════════════════════════════════════════

describe('QIF parser', () => {
  test('parseQif extracts all 5 records', () => {
    const text = readFixtureText('fixture-qif.qif');
    const rows = parseQif(text);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].payee, 'Techno Kol Uzi Wire In');
    assert.equal(rows[0].amount, '12500.00');
  });

  test('parseStatement normalises QIF to common schema', () => {
    const text = readFixtureText('fixture-qif.qif');
    const txs = parseStatement(text, SOURCE_FORMATS.QIF);

    assert.equal(txs.length, 5);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.QIF);
    assert.equal(txs[0].transaction_date, '2026-04-01');
    assert.equal(txs[0].amount, 12500);
    assert.equal(txs[0].type, 'credit');
    assert.equal(txs[0].counterparty_name, 'Techno Kol Uzi Wire In');
    assert.match(txs[0].description, /Customer wire transfer/);

    assert.equal(txs[1].amount, -3200.5);
    assert.equal(txs[1].type, 'debit');
    assert.equal(txs[1].reference, 'REF002');
  });

  test('parseQif throws when no records present', () => {
    assert.throws(() => parseQif('!Type:Bank\n'), /no records/);
  });

  test('parseQif flushes trailing record without "^" terminator', () => {
    const text = '!Type:Bank\nD04/01/2026\nT100.00\nPTest\n';
    const rows = parseQif(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].payee, 'Test');
  });
});

// ══════════════════════════════════════════════════════════════════════
// MT940
// ══════════════════════════════════════════════════════════════════════

describe('MT940 parser (self-contained variant)', () => {
  test('parseMt940Raw extracts 5 :61: transactions', () => {
    const text = readFixtureText('fixture-mt940.txt');
    const rows = parseMt940Raw(text);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].date, '2026-04-02');
    assert.equal(rows[0].amount, -3200.5);
    assert.match(rows[0].description, /Stone Works/);
  });

  test('parseStatement normalises MT940 to common schema', () => {
    const text = readFixtureText('fixture-mt940.txt');
    const txs = parseStatement(text, SOURCE_FORMATS.MT940);

    assert.equal(txs.length, 5);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.MT940);
    assert.equal(txs[0].transaction_date, '2026-04-02');
    assert.equal(txs[0].amount, -3200.5);
    assert.equal(txs[0].type, 'debit');
    assert.equal(txs[0].currency, 'ILS');

    const vat = txs.find(t => /VAT/i.test(t.description));
    assert.ok(vat, 'VAT refund row present');
    assert.equal(vat.amount, 5670.25);
    assert.equal(vat.type, 'credit');
  });

  test('parseMt940Raw throws when no :61: tags are present', () => {
    assert.throws(
      () => parseMt940Raw(':20:STMT\n:25:IL\n:60F:C260401ILS100,00\n:62F:C260402ILS100,00\n'),
      /no :61:/
    );
  });
});

// ══════════════════════════════════════════════════════════════════════
// CAMT.053
// ══════════════════════════════════════════════════════════════════════

describe('CAMT.053 (ISO 20022) parser', () => {
  test('parseCamt053 extracts 3 <Ntry> entries', () => {
    const text = readFixtureText('fixture-camt053.xml');
    const rows = parseCamt053(text);
    assert.equal(rows.length, 3);
  });

  test('parseStatement normalises CAMT.053 credit / debit signs', () => {
    const text = readFixtureText('fixture-camt053.xml');
    const txs = parseStatement(text, SOURCE_FORMATS.CAMT053);

    assert.equal(txs.length, 3);
    // Entry 1 — credit from Acme GmbH
    assert.equal(txs[0].amount, 2500);
    assert.equal(txs[0].type, 'credit');
    assert.equal(txs[0].currency, 'EUR');
    assert.equal(txs[0].counterparty_name, 'Acme GmbH');
    assert.equal(txs[0].counterparty_iban, 'DE02300606010002222222');
    assert.equal(txs[0].reference, 'ACSR-0001');
    assert.equal(txs[0].transaction_date, '2026-04-02');
    assert.match(txs[0].description, /INV-2026-045/);

    // Entry 2 — debit to Stone Works
    assert.equal(txs[1].amount, -1234.56);
    assert.equal(txs[1].type, 'debit');
    assert.equal(txs[1].counterparty_name, 'Stone Works Ltd');
    assert.equal(txs[1].counterparty_iban, 'DE44500105175407324931');

    // Entry 3 — debit w/ only AddtlNtryInf
    assert.equal(txs[2].amount, -42);
    assert.equal(txs[2].type, 'debit');
    assert.match(txs[2].description, /Monthly account fee/);
  });

  test('parseCamt053 throws on missing <Stmt>', () => {
    assert.throws(() => parseCamt053('<Document><Other/></Document>'),
      /no <Stmt>/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Israeli CSV — per-bank variants
// ══════════════════════════════════════════════════════════════════════

describe('Israeli CSV parser', () => {
  test('Bank Leumi fixture — 6 rows, correct signs', () => {
    const text = readFixtureText('fixture-csv-leumi.csv');
    const txs = parseStatement(text, SOURCE_FORMATS.CSV_IL);

    assert.equal(txs.length, 6);
    assert.equal(txs[0].amount, 12500);    // credit
    assert.equal(txs[0].type, 'credit');
    assert.equal(txs[1].amount, -3200.5);  // debit
    assert.equal(txs[1].type, 'debit');
    assert.equal(txs[0].currency, 'ILS');
    assert.equal(txs[0].transaction_date, '2026-04-01');
    assert.equal(txs[0].balance, 112500);
    assert.equal(txs[0].bank, 'leumi');
  });

  test('Bank Hapoalim fixture — detected by token', () => {
    const text = readFixtureText('fixture-csv-hapoalim.csv');
    const txs = parseStatement(text, SOURCE_FORMATS.CSV_IL);

    assert.equal(txs.length, 4);
    assert.equal(txs[0].bank, 'hapoalim');
    assert.equal(txs[0].amount, 12500);
  });

  test('Mizrahi Tefahot fixture — 3 rows', () => {
    const text = readFixtureText('fixture-csv-mizrahi.csv');
    const txs = parseStatement(text, SOURCE_FORMATS.CSV_IL);

    assert.equal(txs.length, 3);
    assert.equal(txs[0].bank, 'mizrahi');
    assert.equal(txs[1].amount, -8900);
    assert.equal(txs[2].amount, 5670.25);
  });

  test('Bank Discount fixture — 4 rows with debit/credit columns', () => {
    const text = readFixtureText('fixture-csv-discount.csv');
    const txs = parseStatement(text, SOURCE_FORMATS.CSV_IL);

    assert.equal(txs.length, 4);
    assert.equal(txs[0].bank, 'discount');
    assert.equal(txs[0].amount, 12500);
    assert.equal(txs[1].amount, -15750);
    assert.equal(txs[3].amount, -2100);
  });

  test('Otsar HaHayal fixture — 3 rows', () => {
    const text = readFixtureText('fixture-csv-otsar.csv');
    const txs = parseStatement(text, SOURCE_FORMATS.CSV_IL);

    assert.equal(txs.length, 3);
    assert.equal(txs[0].bank, 'otsar-hahayal');
    assert.equal(txs[1].amount, -8900);
    assert.equal(txs[2].amount, 22500);
  });

  test('detectIsraeliBank falls back to hapoalim for unknown headers', () => {
    const fakeHeaders = ['תאריך', 'תיאור', 'סכום'];
    const bank = _internal.detectIsraeliBank('some random content', fakeHeaders);
    assert.equal(bank.id, 'hapoalim');
  });

  test('parseCsvIsraeli throws when no amount column found', () => {
    const bad = 'תאריך,שם\n01/04/2026,test\n';
    assert.throws(() => parseCsvIsraeli(bad), /amount column/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Encoding — Windows-1255 Hebrew
// ══════════════════════════════════════════════════════════════════════

describe('Hebrew encoding support', () => {
  test('decodes a Windows-1255 buffer into Hebrew', () => {
    // "שלום" = U+05E9 U+05DC U+05D5 U+05DD
    //   ש → 0xF9, ל → 0xEC, ו → 0xE5, ם → 0xED
    const buf = Buffer.from([0xF9, 0xEC, 0xE5, 0xED]);
    const decoded = _internal.decodeWindows1255(buf);
    assert.equal(decoded, 'שלום');
  });

  test('bufferToString transparently passes through UTF-8', () => {
    const utf8 = Buffer.from('תאריך', 'utf8');
    assert.equal(_internal.bufferToString(utf8), 'תאריך');
  });

  test('bufferToString strips UTF-8 BOM', () => {
    const buf = Buffer.concat([
      Buffer.from([0xEF, 0xBB, 0xBF]),
      Buffer.from('תאריך', 'utf8'),
    ]);
    assert.equal(_internal.bufferToString(buf), 'תאריך');
  });
});

// ══════════════════════════════════════════════════════════════════════
// Date & amount helpers
// ══════════════════════════════════════════════════════════════════════

describe('parseDateFlexible', () => {
  const p = _internal.parseDateFlexible;
  test('parses DD/MM/YYYY',      () => assert.equal(p('15/04/2026'), '2026-04-15'));
  test('parses YYYY-MM-DD',      () => assert.equal(p('2026-04-15'), '2026-04-15'));
  test('parses D/M/YY short',    () => assert.equal(p('1/4/26'),     '2026-04-01'));
  test('parses DD.MM.YYYY',      () => assert.equal(p('15.04.2026'), '2026-04-15'));
  test('parses DD-MM-YYYY',      () => assert.equal(p('15-04-2026'), '2026-04-15'));
  test('parses YYYYMMDD compact',() => assert.equal(p('20260415'),   '2026-04-15'));
  test('parses YYMMDD (MT940)',  () => assert.equal(p('260415'),     '2026-04-15'));
  test('returns null for junk',  () => assert.equal(p('not-a-date'), null));
  test('returns null for empty', () => assert.equal(p(''), null));
});

describe('parseAmountFlexible', () => {
  const p = _internal.parseAmountFlexible;
  test('1,234.56 → 1234.56',          () => assert.equal(p('1,234.56'),  1234.56));
  test('1.234,56 EU → 1234.56',       () => assert.equal(p('1.234,56'),  1234.56));
  test('(100) → -100',                () => assert.equal(p('(100)'),     -100));
  test('₪ 1,500 → 1500',              () => assert.equal(p('₪ 1,500'),   1500));
  test('plain negative -250.75',      () => assert.equal(p('-250.75'),   -250.75));
  test('trailing minus 100-',         () => assert.equal(p('100-'),      -100));
  test('empty string → 0',            () => assert.equal(p(''),          0));
  test('number passthrough',          () => assert.equal(p(42),          42));
  test('1,5 EU decimal → 1.5',        () => assert.equal(p('1,5'),       1.5));
  test('1,500 (thousands) → 1500',    () => assert.equal(p('1,500'),     1500));
});

describe('detectCurrency', () => {
  const d = _internal.detectCurrency;
  test('₪ → ILS',      () => assert.equal(d('₪ 100'), 'ILS'));
  test('USD text',     () => assert.equal(d('USD 100'), 'USD'));
  test('$ → USD',      () => assert.equal(d('$100'), 'USD'));
  test('€ → EUR',      () => assert.equal(d('€100'), 'EUR'));
  test('£ → GBP',      () => assert.equal(d('£100'), 'GBP'));
  test('unknown → ILS default', () => assert.equal(d('100'), 'ILS'));
});

// ══════════════════════════════════════════════════════════════════════
// detectFormat + parseStatement auto-dispatch
// ══════════════════════════════════════════════════════════════════════

describe('parseStatement auto-dispatch', () => {
  test('OFX auto-detected and parsed', () => {
    const buf = readFixture('fixture-ofx.ofx');
    const txs = parseStatement(buf);
    assert.equal(txs.length, 3);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.OFX);
  });

  test('QIF auto-detected and parsed', () => {
    const buf = readFixture('fixture-qif.qif');
    const txs = parseStatement(buf);
    assert.equal(txs.length, 5);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.QIF);
  });

  test('MT940 auto-detected and parsed', () => {
    const buf = readFixture('fixture-mt940.txt');
    const txs = parseStatement(buf);
    assert.equal(txs.length, 5);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.MT940);
  });

  test('CAMT.053 auto-detected and parsed', () => {
    const buf = readFixture('fixture-camt053.xml');
    const txs = parseStatement(buf);
    assert.equal(txs.length, 3);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.CAMT053);
  });

  test('Israeli CSV auto-detected and parsed (Leumi)', () => {
    const buf = readFixture('fixture-csv-leumi.csv');
    const txs = parseStatement(buf);
    assert.equal(txs.length, 6);
    assert.equal(txs[0].source_format, SOURCE_FORMATS.CSV_IL);
    assert.equal(txs[0].bank, 'leumi');
  });

  test('throws on unknown format', () => {
    assert.throws(() => parseStatement('gibberish content'),
      /unsupported|unknown format/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// normalizeTransaction dispatch
// ══════════════════════════════════════════════════════════════════════

describe('normalizeTransaction', () => {
  test('normalises a raw OFX row when given format hint', () => {
    const raw = {
      dtPosted: '20260415120000',
      trnAmt: '500.00',
      fitId: 'X1',
      name: 'Foo',
      memo: 'Bar',
      currency: 'USD',
    };
    const out = normalizeTransaction(raw, SOURCE_FORMATS.OFX);
    assert.equal(out.transaction_date, '2026-04-15');
    assert.equal(out.amount, 500);
    assert.equal(out.source_format, SOURCE_FORMATS.OFX);
  });

  test('uses raw._format when no explicit format given', () => {
    const raw = { _format: SOURCE_FORMATS.QIF, date: '04/15/2026', amount: '100', payee: 'x' };
    const out = normalizeTransaction(raw);
    assert.equal(out.source_format, SOURCE_FORMATS.QIF);
  });

  test('throws on unknown format', () => {
    assert.throws(() => normalizeTransaction({}, 'martian'), /unknown format/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// PDF — optional soft-fail path
// ══════════════════════════════════════════════════════════════════════

describe('PDF parser (optional)', () => {
  test('parsePdf gives PDF_UNSUPPORTED when pdf-parse is missing', async () => {
    // In this environment pdf-parse is typically NOT installed.  We only
    // assert soft-fail semantics; if the module IS installed the test is
    // not meaningful and we skip.
    let canLoad = false;
    try {
      require.resolve('pdf-parse');
      canLoad = true;
    } catch { /* soft-fail path */ }

    if (canLoad) {
      // Module is available — just ensure parsePdf returns an array or
      // throws a descriptive non-PDF_UNSUPPORTED error for our fake buffer.
      try {
        await parsePdf(Buffer.from('not really a pdf'));
        // If it somehow succeeded, the result should be iterable
      } catch (err) {
        assert.notEqual(err.code, 'PDF_UNSUPPORTED');
      }
      return;
    }

    try {
      await parsePdf(Buffer.from('dummy'));
      assert.fail('parsePdf should have thrown PDF_UNSUPPORTED');
    } catch (err) {
      assert.equal(err.code, 'PDF_UNSUPPORTED');
      assert.match(err.message, /pdf-parse/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// Normalized schema shape — sanity guard
// ══════════════════════════════════════════════════════════════════════

describe('Normalized schema shape', () => {
  const REQUIRED_KEYS = [
    'transaction_date', 'value_date', 'description', 'reference',
    'amount', 'currency', 'balance', 'type',
    'counterparty_name', 'counterparty_iban', 'external_id', 'source_format',
  ];

  function assertShape(tx, label) {
    for (const k of REQUIRED_KEYS) {
      assert.ok(k in tx, `${label}: expected key "${k}" in normalized tx`);
    }
    assert.ok(['credit', 'debit'].includes(tx.type), `${label}: type must be credit|debit`);
    assert.equal(typeof tx.amount, 'number', `${label}: amount must be number`);
  }

  test('OFX normalized rows have the common schema', () => {
    const txs = parseStatement(readFixture('fixture-ofx.ofx'));
    txs.forEach(t => assertShape(t, 'OFX'));
  });

  test('QIF normalized rows have the common schema', () => {
    const txs = parseStatement(readFixture('fixture-qif.qif'));
    txs.forEach(t => assertShape(t, 'QIF'));
  });

  test('MT940 normalized rows have the common schema', () => {
    const txs = parseStatement(readFixture('fixture-mt940.txt'));
    txs.forEach(t => assertShape(t, 'MT940'));
  });

  test('CAMT.053 normalized rows have the common schema', () => {
    const txs = parseStatement(readFixture('fixture-camt053.xml'));
    txs.forEach(t => assertShape(t, 'CAMT053'));
  });

  test('Israeli CSV normalized rows have the common schema', () => {
    const txs = parseStatement(readFixture('fixture-csv-leumi.csv'));
    txs.forEach(t => assertShape(t, 'CSV-IL Leumi'));
  });
});

// ══════════════════════════════════════════════════════════════════════
// ISRAELI_BANKS registry sanity
// ══════════════════════════════════════════════════════════════════════

describe('ISRAELI_BANKS registry', () => {
  test('contains all 5 required banks', () => {
    const ids = Object.values(ISRAELI_BANKS).map(b => b.id);
    assert.ok(ids.includes('leumi'));
    assert.ok(ids.includes('hapoalim'));
    assert.ok(ids.includes('mizrahi'));
    assert.ok(ids.includes('discount'));
    assert.ok(ids.includes('otsar-hahayal'));
  });

  test('every bank defines date/desc header hints', () => {
    for (const bank of Object.values(ISRAELI_BANKS)) {
      assert.ok(Array.isArray(bank.headers.date) && bank.headers.date.length > 0);
      assert.ok(Array.isArray(bank.headers.description) && bank.headers.description.length > 0);
    }
  });
});
