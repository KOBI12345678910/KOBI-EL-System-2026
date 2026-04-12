/**
 * Unit tests for src/imports/legacy-migration.js
 * Agent-68 — ONYX Procurement
 *
 * Run:
 *   node --test src/imports/legacy-migration.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const L = require('./legacy-migration');

// ─── Fixtures inline so the test file is self-contained ───

const HSB_WIN_CSV =
  'מספר חשבונית;תאריך;שם לקוח;ח"פ;סכום לפני מע"מ;מע"מ;סכום\n' +
  '1001;01/03/2026;אלפא בע"מ;514000009;1000;180;1180\n' +
  '1002;02/03/2026;בטא סחר;000000000;500;90;590\n';

const HSB_ERP_CSV =
  'invoice_no,date,customer,vat id,subtotal,vat,total\n' +
  '5001,2026-02-14,Gamma Ltd,514000009,2000,360,2360\n' +
  '5002,2026-02-18,Delta Inc,514000009,100,18,118\n';

const PRIORITY_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<root>\n' +
  '  <INVOICE>\n' +
  '    <IVNUM>9001</IVNUM>\n' +
  '    <CUSTNAME>Epsilon</CUSTNAME>\n' +
  '    <IVDATE>2026-01-10</IVDATE>\n' +
  '    <QPRICE>1180</QPRICE>\n' +
  '  </INVOICE>\n' +
  '  <PART>\n' +
  '    <PARTNAME>SKU-01</PARTNAME>\n' +
  '    <PARTDES>Cable 3m</PARTDES>\n' +
  '    <PRICE>42.50</PRICE>\n' +
  '  </PART>\n' +
  '</root>';

const GENERIC_CSV =
  'invoice_number,document_date,customer_name,tax_id,amount_gross\n' +
  '7001,2026-03-15,Zeta,123456782,1200\n';

// ─── detectLegacySystem ───

test('detectLegacySystem — Hashavshevet Windows CSV', () => {
  const sys = L.detectLegacySystem({ name: 'hsb.csv', content: 'חשבשבת\n' + HSB_WIN_CSV });
  assert.equal(sys, L.LEGACY_SYSTEMS.HASHAVSHEVET_WIN);
});

test('detectLegacySystem — Priority XML', () => {
  const sys = L.detectLegacySystem({ name: 'p.xml', content: PRIORITY_XML });
  assert.equal(sys, L.LEGACY_SYSTEMS.PRIORITY);
});

test('detectLegacySystem — Generic CSV', () => {
  const sys = L.detectLegacySystem({ name: 'x.csv', content: GENERIC_CSV });
  assert.equal(sys, L.LEGACY_SYSTEMS.GENERIC_CSV);
});

test('detectLegacySystem — Unknown returns unknown', () => {
  const sys = L.detectLegacySystem({ name: 'weird.bin', content: '\u0001\u0002\u0003' });
  assert.equal(sys, L.LEGACY_SYSTEMS.UNKNOWN);
});

// ─── Parsers ───

test('parseHashavshevet — Windows dialect parses 2 rows with Hebrew headers', () => {
  const p = L.parseHashavshevet({ content: HSB_WIN_CSV });
  assert.equal(p.rows.length, 2);
  assert.equal(p.meta.delimiter, ';');
  assert.equal(p.rows[0]['מספר חשבונית'], '1001');
});

test('parseHashavshevet — ERP dialect parses English headers', () => {
  const p = L.parseHashavshevet({ content: HSB_ERP_CSV });
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].invoice_no, '5001');
});

test('parsePriority — XML emits INVOICE and PART records', () => {
  const p = L.parsePriority({ name: 'p.xml', content: PRIORITY_XML });
  assert.ok(p.rows.length >= 2);
  const entities = p.rows.map((r) => r.__entity);
  assert.ok(entities.includes('INVOICE'));
  assert.ok(entities.includes('PART'));
});

test('parseGenericCsv — picks up comma delimiter and header map', () => {
  const p = L.parseGenericCsv({ content: GENERIC_CSV });
  assert.equal(p.rows.length, 1);
  assert.equal(p.meta.delimiter, ',');
});

test('parseExcelLegacy — rawSheets path with merged cells and formulas', () => {
  const file = {
    rawSheets: [
      {
        name: 'Invoices',
        rows: [
          ['מספר חשבונית', 'תאריך', 'שם לקוח', 'סכום'],
          ['1001', '01/03/2026', 'אלפא בע"מ', '=1000+180'],
          ['', '02/03/2026', '', '590'],
        ],
      },
    ],
  };
  const p = L.parseExcelLegacy(file);
  assert.equal(p.rows.length, 2);
  // Formula should be resolved to 1180
  assert.equal(p.rows[0]['סכום'], 1180);
  // Merged cell propagation: customer name inherits from row above
  assert.equal(p.rows[1]['שם לקוח'], 'אלפא בע"מ');
  assert.ok(p.meta.formulasResolved >= 1);
  assert.ok(p.meta.mergedCells >= 1);
});

// ─── Mapping ───

test('mapSchema — Hebrew headers map to canonical fields', () => {
  const rows = [
    { 'מספר חשבונית': '1001', 'שם לקוח': 'Alpha', 'סכום': '1180' },
    { 'מספר חשבונית': '1002', 'שם לקוח': 'Beta', 'סכום': '590' },
  ];
  const { mapped, unmappedHeaders } = L.mapSchema(rows);
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].invoice_number, '1001');
  assert.equal(mapped[0].customer_name, 'Alpha');
  assert.equal(mapped[0].amount_gross, '1180');
  assert.equal(unmappedHeaders.length, 0);
});

test('mapSchema — extras preserved for unknown headers', () => {
  const { mapped, unmappedHeaders } = L.mapSchema([{ 'מספר חשבונית': '1', weirdCol: 'x' }]);
  assert.equal(mapped[0].invoice_number, '1');
  assert.equal(mapped[0].extra_weirdcol, 'x');
  assert.deepEqual(unmappedHeaders, ['weirdCol']);
});

// ─── Transform ───

test('normalizeDateGregorian — DD/MM/YYYY', () => {
  assert.equal(L.normalizeDateGregorian('01/03/2026'), '2026-03-01');
  assert.equal(L.normalizeDateGregorian('1-3-2026'), '2026-03-01');
});

test('normalizeDateGregorian — YYYY-MM-DD', () => {
  assert.equal(L.normalizeDateGregorian('2026-01-15'), '2026-01-15');
});

test('normalizeDateGregorian — Excel serial date', () => {
  const val = L.normalizeDateGregorian('46023'); // ≈ 2026-01-01
  assert.match(val, /^2025|^2026/);
});

test('normalizeDateGregorian — Hebrew date flagged as unsupported', () => {
  const val = L.normalizeDateGregorian('א ניסן תשפ"ו');
  assert.ok(val && val.__unsupported_hebrew_date);
});

test('normalizeAmount — handles ₪ and thousands', () => {
  assert.equal(L.normalizeAmount('1,180.50 ₪'), 1180.5);
  assert.equal(L.normalizeAmount('(500)'), -500);
  assert.equal(L.normalizeAmount('500 ש"ח'), 500);
});

test('transformRow — tax_id padded to 9 digits', () => {
  const out = L.transformRow({ tax_id: '12345', document_date: '01/03/2026' });
  assert.equal(out.tax_id, '000012345');
  assert.equal(out.document_date, '2026-03-01');
});

// ─── Validators ───

test('validateIsraeliId — valid ID 000000018 passes checksum', () => {
  assert.equal(L.validateIsraeliId('000000018'), true);
});

test('validateIsraeliId — invalid ID fails', () => {
  assert.equal(L.validateIsraeliId('123456789'), false);
});

test('validateIsraeliCompanyId — 9-digit check', () => {
  assert.equal(L.validateIsraeliCompanyId('1'), false);
  // known-good ID with valid Luhn-style checksum
  assert.equal(L.validateIsraeliCompanyId('514000009'), true);
});

test('validateInvoiceTotals — consistent triple passes', () => {
  const r = L.validateInvoiceTotals({ amount_net: 1000, amount_vat: 180, amount_gross: 1180 });
  assert.equal(r.ok, true);
});

test('validateInvoiceTotals — derives missing components', () => {
  const r = L.validateInvoiceTotals({ amount_gross: 1180 }, { vatRate: 0.18 });
  assert.equal(r.ok, true);
  assert.ok(r.derived);
  assert.equal(r.derived.amount_net, 1000);
  assert.equal(r.derived.amount_vat, 180);
});

test('validateInvoiceTotals — mismatched totals fail', () => {
  const r = L.validateInvoiceTotals({ amount_net: 1000, amount_vat: 100, amount_gross: 1180 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'total_mismatch');
});

test('validateRow — flags invalid tz', () => {
  const v = L.validateRow({ tax_id: '999999999', __entity: 'customer' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.code === 'invalid_tz_checksum'));
});

// ─── migrateLegacyData — dry run pipeline ───

test('migrateLegacyData — Hashavshevet Windows dry run end-to-end', async () => {
  const file = { name: 'hsb.csv', content: HSB_WIN_CSV };
  const res = await L.migrateLegacyData(file, L.LEGACY_SYSTEMS.HASHAVSHEVET_WIN, {
    supabase: null,
    dryRun: true,
  });
  assert.equal(res.dryRun, true);
  assert.equal(res.counts.parsed, 2);
  assert.equal(res.counts.mapped, 2);
  assert.equal(res.counts.transformed, 2);
  // row 1 has valid hp 514000009; row 2 has 000000000 which fails checksum
  assert.ok(res.counts.valid >= 1);
  assert.ok(res.stages.commit.skipped);
});

test('migrateLegacyData — Priority XML dry run', async () => {
  const file = { name: 'p.xml', content: PRIORITY_XML };
  const res = await L.migrateLegacyData(file, L.LEGACY_SYSTEMS.PRIORITY, {
    supabase: null,
    dryRun: true,
  });
  assert.ok(res.counts.parsed >= 2);
});

test('migrateLegacyData — commit path uses injected supabase stub', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      return {
        insert(rows) {
          calls.push({ table, rows });
          return {
            select() {
              return Promise.resolve({
                data: rows.map((_, i) => ({ id: `${table}_${i}` })),
                error: null,
              });
            },
          };
        },
      };
    },
  };
  const file = { name: 'gen.csv', content: GENERIC_CSV };
  const res = await L.migrateLegacyData(file, L.LEGACY_SYSTEMS.GENERIC_CSV, {
    supabase,
    dryRun: false,
  });
  assert.equal(res.dryRun, false);
  assert.ok(calls.length >= 1);
  assert.equal(res.counts.committed, res.counts.valid);
});

test('migrateLegacyData — commit failure triggers rollback marker', async () => {
  const updates = [];
  const supabase = {
    from(table) {
      return {
        insert(rows) {
          return {
            select() {
              if (table === 'legacy_invoices') {
                return Promise.resolve({ data: null, error: { message: 'boom' } });
              }
              return Promise.resolve({
                data: rows.map((_, i) => ({ id: `${table}_${i}` })),
                error: null,
              });
            },
          };
        },
        update(payload) {
          return {
            eq(col, val) {
              updates.push({ table, col, val, payload });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
  const file = { name: 'hsb.csv', content: HSB_ERP_CSV };
  const res = await L.migrateLegacyData(file, L.LEGACY_SYSTEMS.HASHAVSHEVET_ERP, {
    supabase,
    dryRun: false,
  });
  // rollback is best-effort, but pipeline should capture the error
  assert.ok(res.errors.length >= 1);
  assert.ok(res.stages.rollback && res.stages.rollback.attempted);
});

// ─── Report ───

test('generateMigrationReport — returns markdown and text', () => {
  const report = L.generateMigrationReport({
    runId: 'x',
    startedAt: '2026-04-11T10:00:00Z',
    finishedAt: '2026-04-11T10:00:01Z',
    durationMs: 1000,
    system: 'generic_csv',
    fileName: 'x.csv',
    dryRun: true,
    stages: {},
    counts: { parsed: 1, mapped: 1, transformed: 1, valid: 1, invalid: 0, committed: 0 },
    errors: [],
    warnings: [],
    sample: [],
    unmappedHeaders: [],
  });
  assert.match(report.markdown, /Legacy Migration Report/);
  assert.match(report.markdown, /generic_csv/);
  assert.ok(report.json);
});

// ─── Header normalization ───

test('resolveHeader — Hebrew variants all map', () => {
  for (const h of ['מספר חשבונית', 'מס חשבונית', 'invoice no', 'invoice_no']) {
    assert.equal(L.resolveHeader(h), 'invoice_number', `header ${h} failed`);
  }
});
