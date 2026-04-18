/**
 * ONYX CSV Import — tests  (node --test compatible)
 * ─────────────────────────────────────────────────────────
 * Run:   node --test src/imports/csv-import.test.js
 *    or: npm test
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCSV,
  autoDetectDelimiter,
  autoDetectEncoding,
  decodeBuffer,
  inferSchema,
  mapColumns,
  validateRows,
  importRows,
  importReport,
  validateIsraeliId,
  normalizeDate,
  jaroWinkler,
  TARGET_SCHEMAS,
} = require('./csv-import');

// ═══════════════════════════════════════════════════════════
//  parseCSV
// ═══════════════════════════════════════════════════════════

test('parseCSV: basic comma-delimited with headers', () => {
  const csv = 'name,age,city\nAlice,30,Tel Aviv\nBob,25,Haifa\n';
  const { headers, rows } = parseCSV(csv);
  assert.deepEqual(headers, ['name', 'age', 'city']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Alice');
  assert.equal(rows[1].city, 'Haifa');
});

test('parseCSV: quoted fields with commas inside', () => {
  const csv = 'name,note\n"Smith, John","hello, world"\n';
  const { rows } = parseCSV(csv);
  assert.equal(rows[0].name, 'Smith, John');
  assert.equal(rows[0].note, 'hello, world');
});

test('parseCSV: escaped quotes ("")', () => {
  const csv = 'name,quote\nAlice,"She said ""hi"""\n';
  const { rows } = parseCSV(csv);
  assert.equal(rows[0].quote, 'She said "hi"');
});

test('parseCSV: embedded newlines in quoted fields', () => {
  const csv = 'name,desc\n"Alice","line1\nline2"\nBob,flat\n';
  const { rows } = parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].desc, 'line1\nline2');
  assert.equal(rows[1].name, 'Bob');
});

test('parseCSV: CRLF line endings', () => {
  const csv = 'a,b\r\n1,2\r\n3,4\r\n';
  const { rows } = parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].a, '1');
  assert.equal(rows[1].b, '4');
});

test('parseCSV: semicolon delimiter (European)', () => {
  const csv = 'name;age;city\nAlice;30;Tel Aviv\n';
  const { headers, rows } = parseCSV(csv, { delimiter: ';' });
  assert.deepEqual(headers, ['name', 'age', 'city']);
  assert.equal(rows[0].city, 'Tel Aviv');
});

test('parseCSV: tab delimiter', () => {
  const csv = 'a\tb\tc\n1\t2\t3\n';
  const { rows } = parseCSV(csv, { delimiter: '\t' });
  assert.equal(rows[0].a, '1');
  assert.equal(rows[0].c, '3');
});

test('parseCSV: no headers', () => {
  const csv = '1,2,3\n4,5,6\n';
  const { headers, rows } = parseCSV(csv, { hasHeaders: false });
  assert.deepEqual(headers, ['column_1', 'column_2', 'column_3']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].column_2, '2');
});

test('parseCSV: UTF-8 Hebrew content', () => {
  const csv = 'שם,גיל\nישראל,30\nרות,25\n';
  const { rows, headers } = parseCSV(csv);
  assert.equal(headers[0], 'שם');
  assert.equal(rows[0].שם, 'ישראל');
  assert.equal(rows[1].גיל, '25');
});

test('parseCSV: UTF-8 BOM stripped', () => {
  const csv = '\uFEFFname,age\nAlice,30\n';
  const { headers } = parseCSV(csv);
  assert.equal(headers[0], 'name'); // NOT "\uFEFFname"
});

test('parseCSV: Windows-1255 Hebrew buffer', () => {
  // "שלום,עולם" in CP1255:
  //   ש = 0xF9  ל = 0xEC  ו = 0xE5  ם = 0xED
  //   , = 0x2C
  //   ע = 0xF2  ו = 0xE5  ל = 0xEC  ם = 0xED
  const buf = Buffer.from([
    0xF9, 0xEC, 0xE5, 0xED, 0x2C, 0xF2, 0xE5, 0xEC, 0xED, 0x0A,
    0x41, 0x2C, 0x42, 0x0A,
  ]);
  const { headers, rows } = parseCSV(buf, { encoding: 'windows-1255' });
  assert.equal(headers[0], 'שלום');
  assert.equal(headers[1], 'עולם');
  assert.equal(rows[0]['שלום'], 'A');
  assert.equal(rows[0]['עולם'], 'B');
});

test('parseCSV: empty input', () => {
  const { headers, rows } = parseCSV('');
  assert.deepEqual(headers, []);
  assert.deepEqual(rows, []);
});

test('parseCSV: blank lines are skipped', () => {
  const csv = 'a,b\n1,2\n\n3,4\n';
  const { rows } = parseCSV(csv);
  assert.equal(rows.length, 2);
});

// ═══════════════════════════════════════════════════════════
//  autoDetectDelimiter
// ═══════════════════════════════════════════════════════════

test('autoDetectDelimiter: comma', () => {
  assert.equal(autoDetectDelimiter('a,b,c\n1,2,3\n'), ',');
});
test('autoDetectDelimiter: semicolon', () => {
  assert.equal(autoDetectDelimiter('a;b;c\n1;2;3\n'), ';');
});
test('autoDetectDelimiter: tab', () => {
  assert.equal(autoDetectDelimiter('a\tb\tc\n1\t2\t3\n'), '\t');
});
test('autoDetectDelimiter: prefers consistent delimiter over occasional ones', () => {
  // Every row has exactly one semicolon but variable comma counts inside values.
  const csv = 'name;note\nAlice;"hi, world"\nBob;"a, b, c"\nCarol;"plain"\n';
  assert.equal(autoDetectDelimiter(csv), ';');
});

// ═══════════════════════════════════════════════════════════
//  autoDetectEncoding
// ═══════════════════════════════════════════════════════════

test('autoDetectEncoding: UTF-8 BOM', () => {
  const buf = Buffer.from([0xEF, 0xBB, 0xBF, 0x41]);
  assert.equal(autoDetectEncoding(buf), 'utf8');
});
test('autoDetectEncoding: plain ASCII → utf8', () => {
  assert.equal(autoDetectEncoding(Buffer.from('hello world')), 'utf8');
});
test('autoDetectEncoding: valid UTF-8 Hebrew → utf8', () => {
  assert.equal(autoDetectEncoding(Buffer.from('שלום עולם', 'utf8')), 'utf8');
});
test('autoDetectEncoding: windows-1255 Hebrew buffer', () => {
  // enough high-bytes to trip the CP1255 branch
  const buf = Buffer.from([0xF9, 0xEC, 0xE5, 0xED, 0x20, 0xF2, 0xE5, 0xEC, 0xED]);
  assert.equal(autoDetectEncoding(buf), 'windows-1255');
});
test('autoDetectEncoding: empty → utf8', () => {
  assert.equal(autoDetectEncoding(Buffer.alloc(0)), 'utf8');
});

test('decodeBuffer: windows-1255 → correct Unicode', () => {
  const buf = Buffer.from([0xF9, 0xEC, 0xE5, 0xED]); // שלום
  assert.equal(decodeBuffer(buf, 'windows-1255'), 'שלום');
});

// ═══════════════════════════════════════════════════════════
//  inferSchema
// ═══════════════════════════════════════════════════════════

test('inferSchema: detects numbers, dates, booleans, strings', () => {
  const rows = [
    { id: '1', name: 'Alice', active: 'yes', joined: '2024-01-15', salary: '12000.50' },
    { id: '2', name: 'Bob',   active: 'no',  joined: '2024-02-20', salary: '9500' },
    { id: '3', name: 'Carol', active: 'yes', joined: '2024-03-01', salary: '15000' },
  ];
  const schema = inferSchema(rows);
  assert.equal(schema.id, 'number');
  assert.equal(schema.name, 'string');
  assert.equal(schema.active, 'boolean');
  assert.equal(schema.joined, 'date');
  assert.equal(schema.salary, 'number');
});

test('inferSchema: handles empty column as string', () => {
  const rows = [{ a: '1', b: '' }, { a: '2', b: '' }];
  const schema = inferSchema(rows);
  assert.equal(schema.a, 'number');
  assert.equal(schema.b, 'string');
});

test('inferSchema: Israeli date formats', () => {
  const rows = [
    { d: '15/01/2024' },
    { d: '28/02/2024' },
  ];
  assert.equal(inferSchema(rows).d, 'date');
});

// ═══════════════════════════════════════════════════════════
//  mapColumns — fuzzy matching
// ═══════════════════════════════════════════════════════════

test('mapColumns: Hebrew headers map to employees fields', () => {
  const headers = ['ID עובד', 'שם פרטי', 'שם משפחה', 'ת.ז', 'אימייל', 'תאריך קליטה'];
  const { mapping, missingRequired } = mapColumns(headers, 'employees');
  assert.equal(mapping['ID עובד'], 'employee_number');
  assert.equal(mapping['שם פרטי'], 'first_name');
  assert.equal(mapping['שם משפחה'], 'last_name');
  assert.equal(mapping['ת.ז'], 'national_id');
  assert.equal(mapping['אימייל'], 'email');
  assert.equal(mapping['תאריך קליטה'], 'hire_date');
  assert.deepEqual(missingRequired, []);
});

test('mapColumns: English headers for suppliers', () => {
  const headers = ['Name', 'Tax ID', 'Email', 'Phone', 'Payment Terms'];
  const { mapping } = mapColumns(headers, 'suppliers');
  assert.equal(mapping['Name'], 'name');
  assert.equal(mapping['Tax ID'], 'tax_id');
  assert.equal(mapping['Email'], 'email');
  assert.equal(mapping['Payment Terms'], 'payment_terms');
});

test('mapColumns: unknown headers become unmapped', () => {
  const headers = ['name', 'tax_id', 'zzz_unknown'];
  const { mapping, unmapped } = mapColumns(headers, 'suppliers');
  assert.ok(mapping.name);
  assert.ok(unmapped.includes('zzz_unknown'));
});

test('mapColumns: missingRequired lists required fields not mapped', () => {
  // Only tax_id is in the CSV; the 3 required employee-name fields are missing.
  const headers = ['tax_id', 'tax_id_extra'];
  const { missingRequired } = mapColumns(headers, 'employees');
  assert.ok(missingRequired.includes('employee_number'));
  assert.ok(missingRequired.includes('first_name'));
  assert.ok(missingRequired.includes('last_name'));
});

test('jaroWinkler: identical strings = 1', () => {
  assert.equal(jaroWinkler('abc', 'abc'), 1);
});

// ═══════════════════════════════════════════════════════════
//  validateRows
// ═══════════════════════════════════════════════════════════

test('validateRows: accepts good employee row', () => {
  const rows = [{
    'ID עובד': 'E001',
    'שם פרטי': 'ישראל',
    'שם משפחה': 'כהן',
    'ת.ז': '300000007', // valid check-digit
    'אימייל': 'israel@techno-kol.co.il',
    'תאריך קליטה': '15/01/2024',
    'שכר': '12000',
  }];
  const map = mapColumns(Object.keys(rows[0]), 'employees').mapping;
  const { valid, invalid, summary } = validateRows(rows, 'employees', { mapping: map });
  assert.equal(invalid.length, 0, JSON.stringify(invalid));
  assert.equal(summary.valid, 1);
  assert.equal(valid[0].national_id, '300000007');
  assert.equal(valid[0].email, 'israel@techno-kol.co.il');
});

test('validateRows: rejects missing required field', () => {
  const rows = [{ 'ID עובד': 'E002' /* missing name fields */ }];
  const map = mapColumns(Object.keys(rows[0]), 'employees').mapping;
  const { invalid } = validateRows(rows, 'employees', { mapping: map });
  assert.ok(invalid.length >= 1);
  assert.ok(invalid[0].errors.some(e => e.includes('first_name')));
  assert.ok(invalid[0].errors.some(e => e.includes('last_name')));
});

test('validateRows: Israeli ID checksum failure', () => {
  // "123456789" has an invalid check digit
  const rows = [{
    'ID עובד': 'E003', 'שם פרטי': 'דן', 'שם משפחה': 'לוי',
    'ת.ז': '123456789',
  }];
  const map = mapColumns(Object.keys(rows[0]), 'employees').mapping;
  const { invalid } = validateRows(rows, 'employees', { mapping: map });
  assert.equal(invalid.length, 1);
  assert.ok(invalid[0].errors.some(e => e.toLowerCase().includes('checksum')));
});

test('validateIsraeliId: correct & incorrect IDs', () => {
  assert.equal(validateIsraeliId('300000007'), true);
  assert.equal(validateIsraeliId('000000018'), true);
  assert.equal(validateIsraeliId('513000018'), true);
  assert.equal(validateIsraeliId('123456789'), false);
  assert.equal(validateIsraeliId(''), false);
  assert.equal(validateIsraeliId('abc'), false);
});

test('validateRows: number cannot be negative when minValue=0', () => {
  const rows = [{
    'ID עובד': 'E01', 'שם פרטי': 'A', 'שם משפחה': 'B', 'שכר': '-500',
  }];
  const map = mapColumns(Object.keys(rows[0]), 'employees').mapping;
  const { invalid } = validateRows(rows, 'employees', { mapping: map });
  assert.ok(invalid.some(r => r.errors.some(e => e.includes('salary'))));
});

test('validateRows: date out of range', () => {
  const rows = [{
    'ID עובד': 'E01', 'שם פרטי': 'A', 'שם משפחה': 'B',
    'תאריך קליטה': '01/01/1900', // below minDate
  }];
  const map = mapColumns(Object.keys(rows[0]), 'employees').mapping;
  const { invalid } = validateRows(rows, 'employees', { mapping: map });
  assert.ok(invalid.some(r => r.errors.some(e => e.includes('hire_date'))));
});

test('validateRows: email format', () => {
  const rows = [{
    'ID עובד': 'E01', 'שם פרטי': 'A', 'שם משפחה': 'B', 'אימייל': 'not-an-email',
  }];
  const map = mapColumns(Object.keys(rows[0]), 'employees').mapping;
  const { invalid } = validateRows(rows, 'employees', { mapping: map });
  assert.ok(invalid.some(r => r.errors.some(e => e.includes('email'))));
});

test('validateRows: unique employee_number duplicate', () => {
  const rows = [
    { 'ID עובד': 'E01', 'שם פרטי': 'A', 'שם משפחה': 'B' },
    { 'ID עובד': 'E01', 'שם פרטי': 'C', 'שם משפחה': 'D' },
  ];
  const map = mapColumns(Object.keys(rows[0]), 'employees').mapping;
  const { invalid } = validateRows(rows, 'employees', { mapping: map });
  assert.ok(invalid.some(r => r.errors.some(e => e.includes('duplicate'))));
});

test('normalizeDate: multiple formats', () => {
  assert.equal(normalizeDate('15/01/2024'), '2024-01-15');
  assert.equal(normalizeDate('2024-01-15'), '2024-01-15');
  assert.equal(normalizeDate('15.01.2024'), '2024-01-15');
  assert.equal(normalizeDate('15-01-24'), '2024-01-15');
  assert.equal(normalizeDate('bogus'), null);
  assert.equal(normalizeDate('32/01/2024'), null); // day out of range
});

// ═══════════════════════════════════════════════════════════
//  importRows (mock Supabase)
// ═══════════════════════════════════════════════════════════

function mockSupabase({ failBatch = -1 } = {}) {
  let batchIdx = -1;
  const calls = [];
  return {
    _calls: calls,
    from(table) {
      return {
        insert(rows) {
          batchIdx++;
          const idx = batchIdx;
          calls.push({ op: 'insert', table, rows, batch: idx });
          return {
            select() {
              if (idx === failBatch) {
                return Promise.resolve({ data: null, error: { message: 'forced failure' } });
              }
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
        upsert(rows) {
          batchIdx++;
          const idx = batchIdx;
          calls.push({ op: 'upsert', table, rows, batch: idx });
          return {
            select() { return Promise.resolve({ data: rows, error: null }); },
          };
        },
      };
    },
  };
}

test('importRows: inserts in batches of 100', async () => {
  const rows = Array.from({ length: 250 }, (_, i) => ({ id: i, name: `n${i}` }));
  const supabase = mockSupabase();
  const result = await importRows(rows, { tableName: 'widgets', supabase });
  assert.equal(result.inserted, 250);
  assert.equal(result.failed, 0);
  assert.equal(result.batches.length, 3);
  assert.equal(supabase._calls.length, 3);
  assert.equal(supabase._calls[0].rows.length, 100);
  assert.equal(supabase._calls[1].rows.length, 100);
  assert.equal(supabase._calls[2].rows.length, 50);
});

test('importRows: records per-batch failures', async () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: i }));
  const supabase = mockSupabase({ failBatch: 1 });
  const result = await importRows(rows, { tableName: 't', supabase });
  assert.equal(result.inserted, 100);  // batch 0 only
  assert.equal(result.failed, 50);     // batch 1 (50 rows)
  assert.ok(result.errors[0].includes('forced failure'));
});

test('importRows: upsert uses upsert op with onConflict', async () => {
  const supabase = mockSupabase();
  await importRows([{ id: 1 }], {
    tableName: 't', supabase, upsert: true, onConflict: 'id',
  });
  assert.equal(supabase._calls[0].op, 'upsert');
});

// ═══════════════════════════════════════════════════════════
//  importReport
// ═══════════════════════════════════════════════════════════

test('importReport: end-to-end summary', () => {
  const validation = {
    valid:   [{ a: 1 }, { a: 2 }],
    invalid: [{ row: 3, errors: ['x: bad'], original: { a: 'z' } }],
    summary: { total: 3, valid: 2, invalid: 1, errorCount: 1 },
  };
  const imported = {
    inserted: 2, failed: 0, batches: [{ index: 0, size: 2, ok: true }],
    errors: [], startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:01Z',
  };
  const report = importReport({ entity: 'employees', validation, imported });
  assert.equal(report.entity, 'employees');
  assert.equal(report.validation.passed, 2);
  assert.equal(report.validation.failed, 1);
  assert.equal(report.importing.inserted, 2);
  assert.equal(report.summary.accepted, 2);
  assert.equal(report.summary.rejected, 1);
  assert.match(report.summary.message, /Processed 3 rows/);
});

// ═══════════════════════════════════════════════════════════
//  End-to-end: full pipeline for employees entity
// ═══════════════════════════════════════════════════════════

test('end-to-end: employees CSV → validate → import', async () => {
  const csv =
    'ID עובד,שם פרטי,שם משפחה,ת.ז,אימייל,תאריך קליטה,שכר\n' +
    'E001,ישראל,כהן,300000007,israel@example.com,15/01/2024,12000\n' +
    'E002,רות,לוי,000000018,ruth@example.com,01/02/2024,10500\n';

  const parsed = parseCSV(csv);
  assert.equal(parsed.rows.length, 2);

  const { mapping } = mapColumns(parsed.headers, 'employees');
  const validation = validateRows(parsed.rows, 'employees', { mapping });
  assert.equal(validation.invalid.length, 0,
    'expected no invalid rows, got: ' + JSON.stringify(validation.invalid));
  assert.equal(validation.valid.length, 2);

  const supabase = mockSupabase();
  const imp = await importRows(validation.valid, {
    tableName: TARGET_SCHEMAS.employees.table,
    supabase,
  });
  assert.equal(imp.inserted, 2);

  const report = importReport({ entity: 'employees', validation, imported: imp });
  assert.equal(report.summary.accepted, 2);
});

// ═══════════════════════════════════════════════════════════
//  Suppliers sample path
// ═══════════════════════════════════════════════════════════

test('end-to-end: suppliers with semicolon delimiter', () => {
  const csv = 'שם ספק;ח.פ;אימייל;טלפון\nטכנו קול;513000018;info@tk.co.il;03-1234567\n';
  const parsed = parseCSV(csv, { delimiter: ';' });
  const { mapping } = mapColumns(parsed.headers, 'suppliers');
  assert.equal(mapping['שם ספק'], 'name');
  assert.equal(mapping['ח.פ'], 'tax_id');
  const { valid, invalid } = validateRows(parsed.rows, 'suppliers', { mapping });
  assert.equal(invalid.length, 0, JSON.stringify(invalid));
  assert.equal(valid[0].name, 'טכנו קול');
});
